// 新交互：点「编号」框即弹出在库编号清单；点一项即回填；箭头按钮已移除
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
    s.call(el, '1'); el.dispatchEvent(new Event('input', { bubbles: true }))
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
  await sleep(1500)

  console.log('① 箭头按钮是否已移除:', await p.evaluate(() => !document.querySelector('.remark-pick-btn') ? 'PASS(无)' : 'FAIL(仍在)'))
  const boxW = await p.evaluate(() => {
    const tr = document.querySelector('#stock-table tbody tr.new-row')
    const ins = Array.from(tr.querySelectorAll('input.table-input'))
    const i = ins.findIndex(e => e.placeholder === '前缀')
    return ins[i + 1] ? Math.round(ins[i + 1].getBoundingClientRect().width) : 0
  })
  console.log('② 编号框宽度:', boxW + 'px', boxW >= 30 ? 'PASS' : 'FAIL')

  // 点编号框
  const pos = await p.evaluate(() => {
    const tr = document.querySelector('#stock-table tbody tr.new-row')
    const ins = Array.from(tr.querySelectorAll('input.table-input'))
    const i = ins.findIndex(e => e.placeholder === '前缀')
    const el = ins[i + 1]
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })
  const who = await p.evaluate((q) => {
    const el = document.elementFromPoint(q.x, q.y)
    const tr = document.querySelector('#stock-table tbody tr.new-row')
    const ins = Array.from(tr.querySelectorAll('input.table-input'))
    const i = ins.findIndex(e => e.placeholder === '前缀')
    const target = ins[i + 1]
    return {
      命中元素: el ? (el.tagName + '.' + el.className + ' ph=' + (el.placeholder || '')) : null,
      目标元素: target ? (target.tagName + ' disabled=' + target.disabled + ' rect=' + JSON.stringify({ x: Math.round(target.getBoundingClientRect().x), y: Math.round(target.getBoundingClientRect().y), w: Math.round(target.getBoundingClientRect().width) })) : null,
      点: q,
    }
  }, pos)
  console.log('  命中检查:', JSON.stringify(who))
  // 真实鼠标点击（按下→抬起），这正是之前会「开了又关」的路径
  await p.mouse.move(pos.x, pos.y); await sleep(80)
  await p.mouse.down(); await sleep(80); await p.mouse.up()
  await sleep(2500)
  const stillOpen = await p.evaluate(() => ({ 面板: !!document.querySelector('.remark-pick'), 项数: document.querySelectorAll('.remark-pick .remark-pick-item').length }))
  console.log('  真实点击后面板:', JSON.stringify(stillOpen))
  const list = await p.evaluate(() => Array.from(document.querySelectorAll('.remark-pick .remark-pick-item')).map(it => it.innerText.replace(/\s+/g, ' ').trim()).slice(0, 4))
  console.log('③ 点框后弹出清单:', JSON.stringify(list))

  // 点第 2 项
  const it2 = await p.evaluate(() => {
    const it = document.querySelectorAll('.remark-pick .remark-pick-item')[1]
    if (!it) return null
    const r = it.getBoundingClientRect()
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), text: it.innerText.replace(/\s+/g,' ').trim() }
  })
  if (it2) { await p.mouse.move(it2.x, it2.y); await sleep(80); await p.mouse.down(); await sleep(90); await p.mouse.up() }
  await sleep(1800)
  const after = await p.evaluate(() => {
    const tr = document.querySelector('#stock-table tbody tr.new-row')
    const ins = Array.from(tr.querySelectorAll('input.table-input'))
    const i = ins.findIndex(e => e.placeholder === '前缀')
    return { 前缀: ins[i] ? ins[i].value : '', 编号: ins[i+1] ? ins[i+1].value : '', 面板: !!document.querySelector('.remark-pick') }
  })
  console.log('④ 选中「' + (it2 && it2.text) + '」后:', JSON.stringify(after))
  console.log('错误:', errs.length ? errs.slice(0,3) : '无')
  await p.screenshot({ path: '../../runtime/remark-nobox.png' })
  await b.close()
})().catch(e => { console.error('FAILED', e.message); process.exit(1) })
