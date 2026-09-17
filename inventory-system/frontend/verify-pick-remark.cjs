// 备注编号选择器：点选后是否回填（三种点击方式）
const puppeteer = require('puppeteer-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:8081'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 })
  const p = await b.newPage()
  await p.setViewport({ width: 1700, height: 950 })
  const errs = []
  p.on('pageerror', e => errs.push(e.message.slice(0, 180)))
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await sleep(1800)
  await p.type('#username', 'demo@kunzz.local', { delay: 12 }); await p.type('#password', 'demo123', { delay: 12 })
  await p.click('button[type="submit"]'); await sleep(3500)
  await p.goto(BASE + '/inout', { waitUntil: 'domcontentloaded' }); await sleep(4000)
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true })))
  await sleep(2000)
  await p.evaluate(() => {
    const el = document.querySelector('#stock-table tbody tr.new-row input.out-qty')
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    s.call(el, '5'); el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await sleep(1500)
  await p.focus('#stock-table tbody tr.new-row input[placeholder="货品"]'); await sleep(300)
  await p.keyboard.type('SALMON', { delay: 55 }); await sleep(2000)
  await p.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll('div'))) {
      for (const c of Array.from(d.children)) {
        const t = (c.innerText || '').replace(/\s+/g, ' ').trim()
        if (/^SALMON \(/.test(t) && t.length < 60) { c.click(); return }
      }
    }
  })
  await sleep(2500)
  await p.evaluate(() => document.querySelector('#stock-table tbody tr.new-row input.remark-checkbox').click())
  await sleep(1200)

  const read = () => p.evaluate(() => {
    const tr = document.querySelector('#stock-table tbody tr.new-row')
    const ins = Array.from(tr.querySelectorAll('input.table-input'))
    const pre = ins.find(e => e.placeholder === '前缀')
    const suf = ins.filter(e => e.placeholder === '编号' || e.placeholder === '自动').slice(-1)[0]
    return { 前缀: pre ? pre.value : '(无)', 编号: suf ? suf.value : '(无)', 面板: !!document.querySelector('.remark-pick') }
  })

  const open = async () => {
    const opened = await p.evaluate(() => {
      const btn = document.querySelector('#stock-table tbody tr.new-row button.remark-pick-btn')
      if (!btn) return 'no-btn'
      btn.click(); return 'clicked'
    })
    await sleep(1500)
    const panel = await p.evaluate(() => { const el = document.querySelector('.remark-pick'); return el ? el.querySelectorAll('.remark-pick-item').length : 0 })
    if (!panel) { console.log('   (面板未打开，重试一次)', opened); await p.evaluate(() => document.querySelector('#stock-table tbody tr.new-row button.remark-pick-btn').click()); await sleep(1800) }
    return panel
  }

  // A 元素点击
  await open(); await sleep(2200)
  const A = await p.evaluate(() => { const it = document.querySelectorAll('.remark-pick .remark-pick-item')[2]; if (it) it.click(); return it ? it.innerText.replace(/\s+/g,' ').trim() : null })
  await sleep(1500)
  console.log('A 元素点击:', JSON.stringify(A), '→', JSON.stringify(await read()))

  // B 真实鼠标（按下→抬起）
  await open(); await sleep(2200)
  const pos = await p.evaluate(() => { const it = document.querySelectorAll('.remark-pick .remark-pick-item')[4]; if (!it) return null; const r = it.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })
  if (pos) { await p.mouse.click(pos.x, pos.y) }
  await sleep(1500)
  console.log('B 鼠标点击:', JSON.stringify(await read()))

  // C 鼠标按下后稍停再抬起（模拟人手）
  await open(); await sleep(2200)
  const pos2 = await p.evaluate(() => { const it = document.querySelectorAll('.remark-pick .remark-pick-item')[5]; if (!it) return null; const r = it.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })
  if (pos2) { await p.mouse.move(pos2.x, pos2.y); await p.mouse.down(); await sleep(140); await p.mouse.up() }
  await sleep(1500)
  console.log('C 慢按:', JSON.stringify(await read()))
  console.log('错误:', errs.length ? errs.slice(0,3) : '无')
  await b.close()
})().catch(e => { console.error('FAILED', e.message); process.exit(1) })
