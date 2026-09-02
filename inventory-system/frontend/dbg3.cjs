const puppeteer = require('puppeteer-core')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
async function main() {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 })
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)))
  // 真实登录
  await page.goto('http://localhost:8081/login', { waitUntil: 'networkidle2' })
  await page.type('#username', 'demo')
  await page.type('#password', 'demo123')
  await page.click('button[type="submit"]')
  await new Promise(r => setTimeout(r, 1500))
  console.log('登录后 URL:', page.url())
  await page.goto('http://localhost:8081/inout?system=j1', { waitUntil: 'networkidle2' })
  await new Promise(r => setTimeout(r, 1200))
  const info = await page.evaluate(() => {
    const el = document.querySelector('.sio-root .table-scroll-container')
    const tc = document.querySelector('.sio-root .table-container')
    return {
      hasTable: !!el,
      scrollable: el ? el.scrollHeight > el.clientHeight : null,
      scrollH: el ? el.scrollHeight : 0,
      clientH: el ? el.clientHeight : 0,
      tcDisplay: tc ? getComputedStyle(tc).display : null,
      tcFlex: tc ? getComputedStyle(tc).flex : null,
      rowCount: document.querySelectorAll('.sio-root .stock-table tbody tr').length,
    }
  })
  console.log('进出货表格:', JSON.stringify(info, null, 1))
  await page.screenshot({ path: 'C:/Users/kunzz/OneDrive/Desktop/inventory-system/docs/_inout_check.png' })
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
