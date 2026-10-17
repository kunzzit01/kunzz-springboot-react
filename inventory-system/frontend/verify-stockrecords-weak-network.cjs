// 总库存弱网验证（不需要后端/数据库）：本地起静态服务 + 拦截 /api，模拟延迟、失败、乱序与取消。
// 运行：node verify-stockrecords-weak-network.cjs   （先 npm run build）
const http = require('http')
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-core')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DIST = path.join(__dirname, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const item = (name, stock, no) => ({
  no, product_name: name, code_number: 'C' + no, specification: 'Packet', total_stock: stock,
  price: 1, total_price: stock, formatted_stock: stock.toFixed(2), formatted_price: '1.00',
  formatted_total_price: stock.toFixed(2), type: 'Kitchen', price_count: 1, price_variants: [],
})
const summary = (names, stockFn) => ({
  summary: names.map((n, i) => item(n, stockFn ? stockFn(n) : 5, i + 1)),
  total_value: 0, formatted_total_value: '0.00', total_products: names.length, type_stats: { Kitchen: 0 },
})

// ---- 可编排的桩 ----
const sumPlan = {} // sys -> { delay, status, data }
const minPlan = {} // sys -> { delay, status, rows }
const seen = []    // { path, sys, t }
const failed = []  // { url, err }
const plan = (sys) => sumPlan[sys] || { data: summary(['CENTRAL-A'], () => 5) }

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0])
      let file = path.join(DIST, url === '/' ? 'index.html' : url)
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }))
  })
}

const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''))
  if (!cond) process.exitCode = 1
}

;(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('缺少 dist，请先 npm run build')
  const { srv, port } = await serve()
  const base = 'http://127.0.0.1:' + port
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(e.message.slice(0, 160)))
  await page.evaluateOnNewDocument(() => localStorage.setItem('inv_token', 'test-token'))
  // 记录被客户端取消的请求数（axios 走 XHR，abort 就是真取消）
  await page.evaluateOnNewDocument(() => {
    window.__aborts = 0
    const orig = XMLHttpRequest.prototype.abort
    XMLHttpRequest.prototype.abort = function () { window.__aborts++; return orig.apply(this, arguments) }
  })

  await page.setRequestInterception(true)
  page.on('requestfailed', r => failed.push({ url: r.url(), err: (r.failure() || {}).errorText }))
  page.on('request', async (req) => {
    const u = new URL(req.url())
    if (!u.pathname.startsWith('/api/')) return req.continue()
    const sys = u.searchParams.get('system')
    const send = (body, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const okData = (data) => send({ code: 0, message: 'ok', data })
    try {
      if (u.pathname === '/api/stock/summary') {
        seen.push({ path: 'summary', sys, t: Date.now() })
        const p = plan(sys)
        if (p.delay) await sleep(p.delay)
        return p.status ? send({ code: 500, message: 'boom' }, p.status) : okData(p.data)
      }
      if (u.pathname === '/api/stock/minimum') {
        seen.push({ path: 'minimum', sys, t: Date.now() })
        const p = minPlan[sys] || { rows: [] }
        if (p.delay) await sleep(p.delay)
        return p.status ? send({ code: 500, message: 'boom' }, p.status) : okData(p.rows)
      }
      if (u.pathname === '/api/auth/me/stock-perms') return okData({ canApply: true, canApprove: true, systems: ['central', 'j1', 'j2', 'j3'], views: [] })
      if (u.pathname === '/api/auth/me/permissions') return okData({ sections: ['brand', 'analytics', 'hr', 'resource', 'visual'], submenu: { resource: ['stock_inventory'] }, brand: {}, pages: {} })
      if (u.pathname === '/api/auth/me') return okData({ username: 'demo', accountType: 'special', displayName: 'Demo', isFirstLogin: false })
      if (u.pathname === '/api/applications/pending-count') return okData(0)
      if (u.pathname === '/api/stock/freezer-categories') return okData([])
      if (u.pathname === '/api/stock/products/price-log-latest') return okData([])
      return okData(null)
    } catch { /* 请求已被取消 */ }
  })

  const title = () => page.$eval('#page-title', el => el.textContent.trim())
  const bodyText = (sys) => page.$eval('#' + sys + '-stock-tbody', el => el.innerText)
  const waitText = (sys, txt, timeout = 8000) => page.waitForFunction(
    (s, t) => (document.getElementById(s + '-stock-tbody')?.innerText || '').includes(t), { timeout }, sys, txt)
  const waitBody = (txt, timeout = 8000) => page.waitForFunction(
    (t) => document.body.innerText.includes(t), { timeout }, txt)
  const pick = async (label) => {
    const cn = label === 'central' ? '中央' : label
    for (let i = 0; i < 3; i++) {
      const open = await page.evaluate(() => {
        const d = document.querySelector('.system-selector .selector-dropdown')
        return !!d && getComputedStyle(d).display !== 'none'
      })
      if (!open) { await page.click('.system-selector .selector-button'); await sleep(150) }
      const hit = await page.evaluate(l => {
        const it = [...document.querySelectorAll('.system-selector .selector-dropdown .dropdown-item')].find(x => x.textContent.trim() === l)
        if (!it) return false
        it.click()
        return true
      }, cn)
      if (hit) break
      await sleep(150)
    }
    await page.waitForFunction(c => (document.getElementById('page-title')?.textContent || '').includes(c), { timeout: 5000 }, cn)
  }
  const modalOpen = () => page.evaluate(() => {
    const m = document.querySelector('.low-stock-modal')
    return !!m && getComputedStyle(m).display !== 'none'
  })
  const closeModal = async () => { if (await modalOpen()) { await page.click('.low-stock-modal .close-modal'); await sleep(250) } }
  const reqCount = (kind, sys) => seen.filter(s => s.path === kind && s.sys === sys).length

  // ---------- T1 首屏只加载当前分店 ----------
  sumPlan.central = { data: summary(['CENTRAL-A']) }
  await page.goto(base + '/records', { waitUntil: 'domcontentloaded' })
  await waitText('central', 'CENTRAL-A')
  ok('T1 首屏显示中央数据', (await title()) === '总库存 - 中央')
  ok('T1 只请求当前分店库存', reqCount('summary', 'j1') + reqCount('summary', 'j2') + reqCount('summary', 'j3') === 0,
    JSON.stringify(seen.filter(s => s.path === 'summary').map(s => s.sys)))
  ok('T1 只请求当前分店最低库存', reqCount('minimum', 'j1') + reqCount('minimum', 'j2') + reqCount('minimum', 'j3') === 0)
  await closeModal()

  // ---------- T2 慢请求被切走：取消且不覆盖新分店 ----------
  sumPlan.j1 = { delay: 1500, data: summary(['J1-A']) }
  sumPlan.j2 = { delay: 50, data: summary(['J2-A']) }
  await pick('J1'); await sleep(120); await pick('J2')
  await waitText('j2', 'J2-A')
  await sleep(1700)
  ok('T2 最终显示 J2', (await title()) === '总库存 - J2')
  ok('T2 慢的 J1 响应未覆盖 J2', !(await bodyText('j2')).includes('J1-A'), (await bodyText('j2')).slice(0, 40))
  ok('T2 切走的 J1 请求被客户端取消', (await page.evaluate(() => window.__aborts)) >= 1, 'aborts=' + (await page.evaluate(() => window.__aborts)))
  ok('T2 J1 请求确实发过（只是被丢弃）', reqCount('summary', 'j1') >= 1)
  ok('T2 取消不显示为失败', !(await page.evaluate(() => document.body.innerText)).includes('加载失败'))

  // ---------- T3 有旧数据 + 刷新失败：保留旧数据并明确提示 ----------
  sumPlan.j2 = { status: 500 }
  await pick('J3'); await sleep(400); await pick('J2')
  await waitBody('更新失败')
  const t3body = await bodyText('j2')
  ok('T3 保留上次数据', t3body.includes('J2-A'))
  const t3all = await page.evaluate(() => document.body.innerText)
  ok('T3 明确标注“上次数据”', t3all.includes('更新失败，当前显示的是上次数据'))
  ok('T3 提供重试按钮', await page.evaluate(() => [...document.querySelectorAll('#j2-page button')].some(b => b.textContent.trim() === '重试')))
  sumPlan.j2 = { data: summary(['J2-B']) }
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#j2-page button')].find(x => x.textContent.trim() === '重试')
    if (b) b.click()
  })
  await waitText('j2', 'J2-B')
  ok('T3 重试后拿到最新数据', !(await page.evaluate(() => document.body.innerText)).includes('更新失败，当前显示的是上次数据'))

  // ---------- T4 首次加载失败：不伪装成“暂无数据” ----------
  sumPlan.j1 = { status: 500 }
  await pick('J1')
  await waitText('j1', '加载失败')
  ok('T4 首次失败显示加载失败与重试', (await bodyText('j1')).includes('加载失败'))
  ok('T4 不显示“暂无数据”', !(await bodyText('j1')).includes('暂无'))
  sumPlan.j1 = { data: summary(['J1-B']) }
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#j1-page button')].find(x => x.textContent.trim() === '重试')
    if (b) b.click()
  })
  await waitText('j1', 'J1-B')
  ok('T4 重试成功', (await bodyText('j1')).includes('J1-B'))

  // ---------- T5 预警：每次切店都弹，且只在库存+最低库存都成功时弹 ----------
  sumPlan.j2 = { data: summary(['J2-A'], () => 1) }
  minPlan.j2 = { rows: [{ productName: 'J2-A', minimumQuantity: 10 }] }
  await pick('J2')
  await page.waitForFunction(() => {
    const m = document.querySelector('.low-stock-modal')
    return !!m && getComputedStyle(m).display !== 'none'
  }, { timeout: 8000 })
  const modalText = await page.$eval('.low-stock-modal', el => el.innerText)
  ok('T5 J2 弹出预警且口径正确', modalText.includes('库存预警 - J2') && modalText.includes('J2-A') && modalText.includes('1 个货品'), modalText.replace(/\s+/g, ' ').slice(0, 80))
  await closeModal()
  await pick('central'); await sleep(900)
  ok('T5 中央无预警（最低库存全 0）不弹', !(await modalOpen()))
  const before = reqCount('minimum', 'j2')
  await pick('J2')
  await page.waitForFunction(() => {
    const m = document.querySelector('.low-stock-modal')
    return !!m && getComputedStyle(m).display !== 'none'
  }, { timeout: 8000 })
  ok('T5 切回 J2 再次弹窗', await modalOpen())
  ok('T5 切店会重新取最低库存', reqCount('minimum', 'j2') > before)
  await closeModal()

  // ---------- T6 最低库存取不到：不拿旧值/空值弹预警 ----------
  sumPlan.j3 = { data: summary(['J3-A'], () => 1) }
  minPlan.j3 = { status: 500 }
  await pick('J3')
  await waitText('j3', 'J3-A')
  await sleep(700)
  ok('T6 最低库存失败时不弹预警', !(await modalOpen()))
  await closeModal()

  ok('T7 无未捕获页面异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

  await browser.close()
  srv.close()
  console.log(process.exitCode ? '\n=== 有失败项 ===' : '\n=== 全部通过 ===')
})().catch(e => { console.error('FAILED', e); process.exit(1) })
