// 回归：进出货「今年」大数据量 + 切分店，验证不再触发 React #185（Maximum update depth exceeded）。
// 运行：node verify-inout-year-switch.cjs   （会用 vite dev 起 5174，需要后端 8081）
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const ping = (u) => new Promise(res => { const q = http.get(u, r => { r.resume(); res(r.statusCode === 200) }); q.on('error', () => res(false)); q.setTimeout(1500, () => { q.destroy(); res(false) }) })
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) process.exitCode = 1 }

;(async () => {
  const viteBin = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js')
  const logFd = fs.openSync(path.join(__dirname, '_vite_verify.log'), 'w')
  const vite = spawn(process.execPath, [viteBin, '--port', '5174', '--strictPort'], { cwd: __dirname, stdio: ['ignore', logFd, logFd] })
  try {
    let up = false
    for (let i = 0; i < 60; i++) { if (await ping('http://127.0.0.1:5174/')) { up = true; break } await sleep(500) }
    if (!up) throw new Error('vite 未就绪（见 _vite_verify.log）')

    const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], protocolTimeout: 180000 })
    const p = await b.newPage()
    await p.setViewport({ width: 1600, height: 900 })
    const errs = []
    p.on('pageerror', e => errs.push((e.stack || e.message).slice(0, 300)))

    const crashed = () => p.evaluate(() => document.body.innerText.includes('页面出错了'))
    const title = () => p.$eval('#current-system', el => el.textContent.trim()).catch(() => '')
    const domRows = () => p.evaluate(() => document.querySelectorAll('#stock-table tbody tr[data-vi]').length)

    await p.goto('http://127.0.0.1:5174/login', { waitUntil: 'domcontentloaded' }); await sleep(1200)
    await p.type('#username', 'demo@kunzz.local', { delay: 5 })
    await p.type('#password', 'demo123', { delay: 5 })
    await p.click('button[type="submit"]')
    await p.waitForFunction(() => location.pathname !== '/login', { timeout: 25000 }).catch(() => null)
    await p.goto('http://127.0.0.1:5174/inout?system=j1', { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('.quick-dropdown .dropdown-toggle', { timeout: 30000 })

    // 选「今年」→ 进入大数据量 + 虚拟滚动
    await p.click('.quick-dropdown .dropdown-toggle'); await sleep(350)
    await p.evaluate(() => {
      const it = [...document.querySelectorAll('.quick-dropdown .dropdown-item')].find(x => x.textContent.trim() === '今年')
      if (it) it.click()
    })
    await p.waitForFunction(() => document.querySelectorAll('#stock-table tbody tr[data-vi]').length > 0, { timeout: 30000 })
    await sleep(1200)
    ok('选「今年」后有行且未崩溃', !(await crashed()) && (await domRows()) > 0, 'domRows=' + (await domRows()))

    // 反复切分店
    for (const label of ['J2', 'J3', 'J1', 'J2']) {
      await p.click('.system-selector .selector-button'); await sleep(250)
      await p.evaluate(l => {
        const it = [...document.querySelectorAll('.system-selector .selector-dropdown .dropdown-item')].find(x => x.textContent.trim() === l)
        if (it) it.click()
      }, label)
      await p.waitForFunction(l => (document.getElementById('current-system')?.textContent || '').trim() === l, { timeout: 20000 }, label).catch(() => null)
      await sleep(1500)
      const t = await title(); const rows = await domRows(); const bad = await crashed()
      ok('切到 ' + label + ' 不崩溃且有行', !bad && t === label && rows > 0, `title=${t} domRows=${rows}`)
    }

    // 滚动：虚拟列表在中间位置仍要有行（且 DOM 行数远小于 2 万）
    await p.evaluate(() => { const el = document.querySelector('.table-scroll-container'); if (el) el.scrollTop = 12000 })
    await sleep(1200)
    const rowsAfterScroll = await domRows()
    ok('滚到中间仍渲染行', rowsAfterScroll > 0 && rowsAfterScroll < 300, 'domRows=' + rowsAfterScroll)

    // 再切一次，确认滚动后切店也不炸
    await p.click('.system-selector .selector-button'); await sleep(250)
    await p.evaluate(() => {
      const it = [...document.querySelectorAll('.system-selector .selector-dropdown .dropdown-item')].find(x => x.textContent.trim() === 'J3')
      if (it) it.click()
    })
    await sleep(2000)
    ok('滚动后再切店不崩溃', !(await crashed()) && (await title()) === 'J3')
    ok('全程无 #185 / 未捕获异常', errs.length === 0, errs.slice(0, 2).join(' | '))

    console.log(process.exitCode ? '\n=== 有失败项 ===' : '\n=== 全部通过 ===')
    await b.close()
  } finally {
    vite.kill()
  }
})().catch(e => { console.error('FAILED', e.message); process.exit(1) })
