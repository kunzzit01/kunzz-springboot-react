// 备注编号选择器：出货时列出在库编号 + 剩余量，点选后回填前缀/编号（保留供回归）
const puppeteer = require('puppeteer-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:8081'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function run() {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 })
  const p = await b.newPage()
  await p.setViewport({ width: 1700, height: 1000 })
  const errs = []
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)))
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await sleep(1800)
  await p.type('#username', 'demo@kunzz.local', { delay: 15 })
  await p.type('#password', 'demo123', { delay: 15 })
  await p.click('button[type="submit"]')
  await sleep(3500)
  await p.goto(BASE + '/inout', { waitUntil: 'domcontentloaded' })
  await sleep(4000)

  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true })))
  await sleep(2000)
  // 出货数量
  await p.evaluate(() => {
    const el = document.querySelectorAll('#stock-table tbody tr.new-row input[type=number]')[1]
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, '1'); el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await sleep(1800)
  // 选货品
  await p.focus('#stock-table tbody tr.new-row input[placeholder="货品"]')
  await sleep(300)
  await p.keyboard.type('SALMON', { delay: 60 }); await sleep(2000)
  await p.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll('div'))) {
      for (const c of Array.from(d.children)) {
        const t = (c.innerText || '').trim()
        if (t.indexOf('SALMON (') === 0 && t.length < 50) { c.click(); return }
      }
    }
  })
  await sleep(2000)

  console.log('未勾备注时有无选择器按钮:', await p.evaluate(() => !!document.querySelector('#stock-table tbody tr.new-row button.remark-pick-btn')))
  await p.evaluate(() => document.querySelector('#stock-table tbody tr.new-row input.remark-checkbox').click())
  await sleep(1200)
  await p.evaluate(() => document.querySelector('#stock-table tbody tr.new-row button.remark-pick-btn').click())
  await sleep(2200)

  const list = await p.evaluate(() => Array.from(document.querySelectorAll('.remark-pick .remark-pick-item')).map(it => it.innerText.replace(/\s+/g, ' ').trim()))
  console.log('选项数:', list.length)
  list.slice(0, 4).forEach(t => console.log('  ' + t))

  const chosen = await p.evaluate(() => {
    const it = document.querySelectorAll('.remark-pick .remark-pick-item')[2]
    if (!it) return null
    const t = it.innerText.replace(/\s+/g, ' ').trim(); it.click(); return t
  })
  await sleep(1500)
  const filled = await p.evaluate(() => {
    const tr = document.querySelector('#stock-table tbody tr.new-row')
    return Array.from(tr.querySelectorAll('input.table-input')).map(e => (e.placeholder || '?') + '=' + e.value)
  })
  console.log('点选:', chosen)
  console.log('回填:', JSON.stringify(filled.filter(x => /前缀|编号/.test(x))))

  // 再点一次应能换一个编号
  await p.evaluate(() => document.querySelector('#stock-table tbody tr.new-row button.remark-pick-btn').click())
  await sleep(1800)
  await p.evaluate(() => {
    const it = document.querySelectorAll('.remark-pick .remark-pick-item')[0]
    if (it) it.click()
  })
  await sleep(1200)
  const filled2 = await p.evaluate(() => {
    const tr = document.querySelector('#stock-table tbody tr.new-row')
    return Array.from(tr.querySelectorAll('input.table-input')).map(e => (e.placeholder || '?') + '=' + e.value)
  })
  console.log('换选后:', JSON.stringify(filled2.filter(x => /前缀|编号/.test(x))))
  console.log('JS 错误:', errs.length ? errs.slice(0, 3) : '无')
  await b.close()
}
run().catch(e => { console.error('FAILED', e.message); process.exit(1) })
