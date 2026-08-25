/**
 * 进出货发票 PDF 生成（对齐旧系统 js/stockeditall.js generateInvoicePDF / generateMultiPageInvoicePDF）
 * 使用 pdf-lib 加载发票模板 + 固定坐标绘制（模板来自 /invoice/ 目录，已从线上下载）
 */

const SYS = ['j1', 'j2', 'j3'] as const
type Sys = typeof SYS[number]

export interface InvoiceRow {
  date: string
  code_number?: string
  product_name?: string
  out_quantity?: number | string
  specification?: string
  price?: number | string
}

// ---------- 金额/数字工具（对齐旧系统） ----------

export function formatNumber(value: unknown): string {
  if (!value || value === '' || value === '0') return '0.000'
  const num = parseFloat(String(value))
  return isNaN(num) ? '0.000' : num.toFixed(3)
}

export function roundCurrencyValue(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '0') return 0
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!isFinite(num)) return 0
  const sign = num >= 0 ? 1 : -1
  const correction = Number.EPSILON * Math.max(1, Math.abs(num))
  const absRoundedCents = Math.round((Math.abs(num) + correction) * 100)
  return sign * (absRoundedCents / 100)
}

export function formatCentsToCurrency(cents: number): string {
  if (cents === null || cents === undefined || isNaN(cents)) return '0.00'
  const roundedCents = Math.round(cents)
  const sign = roundedCents < 0 ? '-' : ''
  const absCents = Math.abs(roundedCents)
  const units = Math.floor(absCents / 100)
  const centsPart = (absCents % 100).toString().padStart(2, '0')
  return `${sign}${units}.${centsPart}`
}

/** 进位规则：1/2退0，3/4进5，6/7退5，8/9进0 */
function roundToNearestFive(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '0') return 0
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!isFinite(num)) return 0
  const sign = num >= 0 ? 1 : -1
  const absNum = Math.abs(num)
  const integerPart = Math.floor(absNum)
  const decimalPart = absNum - integerPart
  const cents = Math.round(decimalPart * 100)
  const lastDigit = cents % 10
  let roundedCents: number
  if (lastDigit === 1 || lastDigit === 2) roundedCents = Math.floor(cents / 10) * 10
  else if (lastDigit === 3 || lastDigit === 4) roundedCents = Math.floor(cents / 10) * 10 + 5
  else if (lastDigit === 6 || lastDigit === 7) roundedCents = Math.floor(cents / 10) * 10 + 5
  else if (lastDigit === 8 || lastDigit === 9) roundedCents = (Math.floor(cents / 10) + 1) * 10
  else roundedCents = cents
  return sign * (integerPart + roundedCents / 100)
}

export function calculateRoundingAdjustment(value: unknown): number {
  if (value === null || value === undefined || value === '' || value === '0') return 0
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!isFinite(num)) return 0
  return roundToNearestFive(num) - num
}

export function formatCurrencyForPDF(value: unknown): string {
  return roundCurrencyValue(value).toFixed(2)
}

export function formatDateToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return ''
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return dateStr
}

/** 发票号码：J1-YYMM-XXX */
export function generateInvoiceNumber(system: string, invoiceDate: string, userSuffix: string): string {
  const d = new Date(invoiceDate + 'T00:00:00')
  if (isNaN(d.getTime())) return `${system.toUpperCase()}-XXXX-${String(userSuffix).padStart(3, '0')}`
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear().toString().slice(-2)
  const suffix = String(userSuffix).padStart(3, '0')
  return `${system.toUpperCase()}-${year}${month}-${suffix}`
}

// ---------- 坐标对齐（对齐旧系统） ----------

function getRightAlignedX(text: string, maxX: number, charWidth = 6): number {
  return maxX - (text.length * charWidth)
}
function getCenterAlignedX(text: string, centerX: number, charWidth = 6): number {
  return centerX - (text.length * charWidth / 2)
}
function getDecimalAlignedX(text: string, anchorX: number, font: any, size: number, dotOffset = 0): number {
  const str = String(text ?? '')
  const dotIndex = str.indexOf('.')
  if (dotIndex >= 0) {
    const leftPart = str.substring(0, dotIndex)
    const leftWidth = font.widthOfTextAtSize(leftPart, size)
    return (anchorX - dotOffset) - leftWidth
  }
  return anchorX - font.widthOfTextAtSize(str, size)
}

// ---------- 模板 ----------

function templateUrl(system: Sys, multiPage: boolean, pageIndex: number): string {
  if (multiPage) {
    return `/invoice/${system}invoiceMulti(${pageIndex === 0 ? 1 : 2}).pdf`
  }
  return `/invoice/${system}invoice.pdf`
}

async function loadTemplate(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('无法加载发票模板: ' + url)
  const bytes = await res.arrayBuffer()
  const { PDFDocument } = (window as any).PDFLib
  return PDFDocument.load(bytes)
}

interface PdfContext {
  doc: any
  page: any
  width: number
  height: number
  fontSize: number
  smallFontSize: number
  textColor: any
  boldFont: any
  regularFont: any
  monoFont: any
  monoBoldFont: any
}

async function setupPage(doc: any, system: Sys, multiPage: boolean, pageIndex: number): Promise<PdfContext> {
  const templateDoc = await loadTemplate(templateUrl(system, multiPage, pageIndex))
  let page: any
  if (multiPage) {
    const [tplPage] = await doc.copyPages(templateDoc, [0])
    page = doc.addPage(tplPage)
  } else {
    page = doc.getPage(0)
  }
  const { width, height } = page.getSize()
  const { rgb, StandardFonts } = (window as any).PDFLib
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
  const regularFont = await doc.embedFont(StandardFonts.Helvetica)
  const monoFont = await doc.embedFont(StandardFonts.Courier)
  const monoBoldFont = await doc.embedFont(StandardFonts.CourierBold)
  return {
    doc, page, width, height,
    fontSize: 11, smallFontSize: 9,
    textColor: rgb(0, 0, 0),
    boldFont, regularFont, monoFont, monoBoldFont,
  }
}

function fillHeader(ctx: PdfContext, system: Sys, invoiceNumber: string, invoiceDate: string) {
  const { page, height, fontSize, textColor, boldFont } = ctx
  const currentDate = formatDateToDDMMYYYY(invoiceDate) || new Date().toLocaleDateString('en-GB')
  page.drawText(` ${currentDate}`, { x: 495.5, y: height - 110.5, size: fontSize, color: textColor, font: boldFont })
  if (invoiceNumber) {
    page.drawText(invoiceNumber, { x: 500, y: height - 96.5, size: fontSize, color: textColor, font: boldFont })
  }
}

interface DisplayRow {
  item_number: number
  product_name: string
  out_quantity: number | string
  specification: string
  price: number | string
  total_value: number
  is_date_group?: boolean
  date?: string
}

function fillDataRows(ctx: PdfContext, system: Sys, pageData: DisplayRow[], startIndex: number, isGroupedByDate: boolean): { raw: number; cents: number } {
  const { page, height, smallFontSize, textColor, monoBoldFont } = ctx
  const startY = height - (system === 'j1' ? 162 : 202)
  const lineHeight = 20
  let raw = 0
  let cents = 0
  pageData.forEach((record, index) => {
    const yPosition = startY - index * lineHeight
    const itemNumber = isGroupedByDate ? (record.item_number || startIndex + index + 1) : (startIndex + index + 1)
    let totalRaw: number, totalRounded: number
    if (isGroupedByDate && record.is_date_group) {
      totalRaw = parseFloat(String(record.total_value)) || 0
      totalRounded = roundCurrencyValue(totalRaw)
    } else {
      const outQty = parseFloat(String(record.out_quantity)) || 0
      const price = parseFloat(String(record.price)) || 0
      totalRaw = outQty * price
      totalRounded = roundCurrencyValue(totalRaw)
    }
    cents += Math.round(totalRounded * 100)
    raw += totalRaw

    const itemText = itemNumber.toString()
    page.drawText(itemText, { x: getCenterAlignedX(itemText, 42, 6), y: yPosition, size: smallFontSize, color: textColor })

    const productName = record.product_name || ''
    const display = productName.length > 25 ? productName.substring(0, 25) + '...' : productName
    page.drawText(display.toUpperCase(), { x: 80, y: yPosition, size: smallFontSize, color: textColor })

    let qtyText = isGroupedByDate && record.is_date_group ? '-' : formatNumber(record.out_quantity)
    page.drawText(qtyText, { x: getDecimalAlignedX(qtyText, 373, monoBoldFont, smallFontSize, 0), y: yPosition, size: smallFontSize, color: textColor, font: monoBoldFont })

    let uomText = isGroupedByDate && record.is_date_group ? '-' : (record.specification || '')
    page.drawText(uomText.toUpperCase(), { x: 406, y: yPosition, size: 8, color: textColor })

    let priceText = isGroupedByDate && record.is_date_group ? '-' : formatCurrencyForPDF(record.price)
    page.drawText(priceText, { x: getDecimalAlignedX(priceText, 488, monoBoldFont, smallFontSize, 0), y: yPosition, size: smallFontSize, color: textColor, font: monoBoldFont })

    const totalText = formatCurrencyForPDF(totalRounded)
    page.drawText(totalText, { x: getDecimalAlignedX(totalText, 548, monoBoldFont, smallFontSize, 0), y: yPosition, size: smallFontSize, color: textColor, font: monoBoldFont })
  })
  return { raw, cents }
}

function fillTotals(ctx: PdfContext, system: Sys, grandTotalRaw: number, isGroupedByDate: boolean) {
  const { page, height, fontSize, smallFontSize, textColor, boldFont } = ctx
  if (system === 'j1') {
    const roundingAdjustment = calculateRoundingAdjustment(grandTotalRaw)
    const totalRounded = roundToNearestFive(grandTotalRaw)
    const totalCents = Math.round(totalRounded * 100)
    page.drawText(formatCurrencyForPDF(roundingAdjustment), { x: getRightAlignedX(formatCurrencyForPDF(roundingAdjustment), 575, 8), y: height - 700, size: smallFontSize, color: textColor })
    page.drawText(formatCentsToCurrency(totalCents), { x: getRightAlignedX(formatCentsToCurrency(totalCents), 574, 8), y: height - 717, size: fontSize, color: textColor, font: boldFont })
  } else {
    // j2 / j3
    const subtotalRaw = grandTotalRaw
    const subtotalCents = Math.round(subtotalRaw * 100)
    if (isGroupedByDate) {
      const roundingAdjustment = calculateRoundingAdjustment(subtotalRaw)
      const roundingCents = Math.round(roundingAdjustment * 100)
      const finalTotalCents = subtotalCents + roundingCents
      page.drawText(formatCurrencyForPDF(roundingAdjustment), { x: getRightAlignedX(formatCurrencyForPDF(roundingAdjustment), 583, 8), y: height - 701, size: smallFontSize, color: textColor })
      page.drawText(formatCentsToCurrency(finalTotalCents), { x: getRightAlignedX(formatCentsToCurrency(finalTotalCents), 580, 8), y: height - 717, size: fontSize, color: textColor, font: boldFont })
    } else {
      const chargeCents = Math.round(subtotalCents * 15 / 100)
      const subtotalPlusCharge = subtotalRaw + (chargeCents / 100)
      const roundingAdjustment = calculateRoundingAdjustment(subtotalPlusCharge)
      const roundingCents = Math.round(roundingAdjustment * 100)
      const finalTotalCents = subtotalCents + chargeCents + roundingCents
      page.drawText(formatCentsToCurrency(subtotalCents), { x: getRightAlignedX(formatCentsToCurrency(subtotalCents), 588, 8), y: height - 681, size: smallFontSize, color: textColor })
      page.drawText(formatCentsToCurrency(chargeCents), { x: getRightAlignedX(formatCentsToCurrency(chargeCents), 585.5, 8), y: height - 692, size: smallFontSize, color: textColor })
      page.drawText(formatCurrencyForPDF(roundingAdjustment), { x: getRightAlignedX(formatCurrencyForPDF(roundingAdjustment), 583, 8), y: height - 701, size: smallFontSize, color: textColor })
      page.drawText(formatCentsToCurrency(finalTotalCents), { x: getRightAlignedX(formatCentsToCurrency(finalTotalCents), 580, 8), y: height - 717, size: fontSize, color: textColor, font: boldFont })
    }
  }
}

/** 按日期分组（多天），对齐旧系统 confirmExport */
export function groupByDate(rows: InvoiceRow[]): { display: DisplayRow[]; isGroupedByDate: boolean } {
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  if (dates.length <= 1) {
    return {
      display: rows.map((r, i) => ({
        item_number: i + 1, product_name: r.product_name || '', out_quantity: r.out_quantity || 0,
        specification: r.specification || '', price: r.price || 0,
        total_value: (parseFloat(String(r.out_quantity)) || 0) * (parseFloat(String(r.price)) || 0),
      })),
      isGroupedByDate: false,
    }
  }
  const display: DisplayRow[] = []
  dates.forEach((date) => {
    const dayRows = rows.filter((r) => r.date === date)
    const total = dayRows.reduce((s, r) => s + (parseFloat(String(r.out_quantity)) || 0) * (parseFloat(String(r.price)) || 0), 0)
    display.push({
      item_number: display.length + 1,
      product_name: formatDateToDDMMYYYY(date),
      out_quantity: 0, specification: '-', price: 0, total_value: total,
      is_date_group: true, date,
    })
  })
  return { display, isGroupedByDate: true }
}

/** 生成发票 PDF（单页或多页，对齐旧系统） */
export async function generateInvoicePdf(
  rows: InvoiceRow[],
  startDate: string,
  endDate: string,
  system: string,
  invoiceNumber: string,
  invoiceDate: string,
): Promise<void> {
  const sys = (['j1', 'j2', 'j3'].includes(system) ? system : 'j1') as Sys
  const { display, isGroupedByDate } = groupByDate(rows)

  const recordsPerPage = sys === 'j1' ? 27 : 24
  const useMultiPage = display.length > recordsPerPage
  const totalPages = Math.ceil(display.length / recordsPerPage)

  const { PDFDocument } = (window as any).PDFLib

  if (!useMultiPage) {
    const ctx = await setupPage(await PDFDocument.load(await (await fetch(templateUrl(sys, false, 0))).arrayBuffer()), sys, false, 0)
    fillHeader(ctx, sys, invoiceNumber, invoiceDate)
    const { raw, cents } = fillDataRows(ctx, sys, display, 0, isGroupedByDate)
    fillTotals(ctx, sys, raw, isGroupedByDate)
    const bytes = await ctx.doc.save()
    downloadPdf(bytes, sys, startDate, endDate)
    return
  }

  // 多页
  const doc = await PDFDocument.create()
  let grandRaw = 0
  for (let p = 0; p < totalPages; p++) {
    const ctx = await setupPage(doc, sys, true, p)
    fillHeader(ctx, sys, invoiceNumber, invoiceDate)
    const startIdx = p * recordsPerPage
    const pageData = display.slice(startIdx, startIdx + recordsPerPage)
    const { raw } = fillDataRows(ctx, sys, pageData, startIdx, isGroupedByDate)
    grandRaw += raw
    if (p === totalPages - 1) {
      fillTotals(ctx, sys, grandRaw, isGroupedByDate)
    }
  }
  const bytes = await doc.save()
  downloadPdf(bytes, sys, startDate, endDate)
}

function downloadPdf(bytes: Uint8Array, system: string, startDate: string, endDate: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `invoice_${system}_${startDate}_${endDate}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
