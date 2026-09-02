import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getInvoiceData } from '../api'
import { getMobileRecords, type MobileRecord } from '../api/mobile'
import { generateInvoiceNumber, generateInvoicePdf } from '../utils/invoicePdf'
import { showToast } from '../utils/toast'
import { useMobileAccess, MobileDenied } from '../utils/useMobileAccess'
import { useRealtime } from '../utils/useRealtime'
import '../styles/mobile-records.css'

/**
 * 手机出货记录（1:1 对齐旧系统 /jX/j1stockeditmobile.php「手机出货记录 - JX」）
 * 桌面进出货「手机版」按钮的落点（对齐旧 mobile-selector → jXstockeditmobile）。
 * 结构/交互/CSS 均按旧页移植（CSS 见 styles/mobile-records.css，机械加 .mobrec-root 前缀）：
 *   头部（返回上一页）→ unified-header-row（日期范围[日历弹窗] / 快速选择[时段] / 搜索 / 导出数据 / 总记录数）
 *   → 5 列表格（日期[05 Sep]/货品编号/货品/出货[红字三位小数]/出货人）→ 生成 PDF 发票弹窗 → 回到顶部。
 * 注：旧页的新增记录弹窗/新增库存记录表单无任何打开入口（孤儿代码），故不实现。
 * 权限：双层校验（branch + 权限树），与 /mobile/out 一致。
 */

const STORES = ['j1', 'j2', 'j3'] as const
const QUICK_KEYS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear'] as const
const QUICK_LABELS = ['今天', '昨天', '本周', '上周', '这个月', '上个月', '今年', '去年']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDisplay = (d: Date) => `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`
/** 旧页 formatDate：单元格显示「05 Sep」 */
const fmtCellDate = (dateString?: string) => {
  const date = dateString ? new Date(dateString + 'T00:00:00') : null
  if (!date || isNaN(date.getTime())) return dateString || '-'
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`
}
const fmtNumber = (value?: number | string) => {
  const num = parseFloat(String(value ?? ''))
  return isNaN(num) ? '0.000' : num.toFixed(3)
}

function quickRange(key: (typeof QUICK_KEYS)[number]): { start: Date; end: Date } {
  const today = new Date()
  switch (key) {
    case 'today': return { start: today, end: today }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1); return { start: y, end: y }
    }
    case 'thisWeek': {
      const monday = new Date(today)
      const dow = monday.getDay()
      monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1))
      return { start: monday, end: today }
    }
    case 'lastWeek': {
      const lastSunday = new Date(today)
      const dow = lastSunday.getDay()
      lastSunday.setDate(lastSunday.getDate() - (dow === 0 ? 0 : dow) - 1)
      const lastMonday = new Date(lastSunday)
      lastMonday.setDate(lastSunday.getDate() - 6)
      return { start: lastMonday, end: lastSunday }
    }
    case 'thisMonth': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today }
    case 'lastMonth': return {
      start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      end: new Date(today.getFullYear(), today.getMonth(), 0),
    }
    case 'thisYear': return { start: new Date(today.getFullYear(), 0, 1), end: today }
    case 'lastYear': return { start: new Date(today.getFullYear() - 1, 0, 1), end: new Date(today.getFullYear() - 1, 11, 31) }
  }
}

export default function MobileRecords() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const system = useMemo(() => {
    const s = (searchParams.get('system') || 'j1').toLowerCase()
    return (STORES as readonly string[]).includes(s) ? s : 'j1'
  }, [searchParams])

  const access = useMobileAccess()
  const allowed = access.ready && access.allowedSystems.includes(system)

  const [records, setRecords] = useState<MobileRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [kw, setKw] = useState('')

  // 日期范围（对齐旧 dateRange：null = 不限，加载全部）
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  // 日历弹窗
  const [calOpen, setCalOpen] = useState(false)
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selStart, setSelStart] = useState<Date | null>(null)
  const [selEnd, setSelEnd] = useState<Date | null>(null)
  const [previewDate, setPreviewDate] = useState<Date | null>(null)
  // 快速选择
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickLabel, setQuickLabel] = useState('时段')
  // 导出弹窗
  const [exportOpen, setExportOpen] = useState(false)
  const [exportForm, setExportForm] = useState({ startDate: '', endDate: '', system: 'j1', invoiceDate: '', invoiceSuffix: '' })
  const [exporting, setExporting] = useState(false)
  // 回到顶部
  const [showTop, setShowTop] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    try {
      const data = await getMobileRecords(
        system,
        rangeStart ? fmtDay(rangeStart) : undefined,
        rangeEnd ? fmtDay(rangeEnd) : undefined,
      )
      setRecords(data)
    } catch { /* 拦截器已提示 */ }
    setLoading(false)
  }, [system, rangeStart, rangeEnd, allowed])

  useEffect(() => { load() }, [load])
  // 全站实时推送：数据变更 → 自动刷新
  useRealtime(system, () => { load() }, 1000, 3000)
  // 全站实时推送：数据变更 → 自动刷新

  // 搜索（对齐旧 unified-filter：货品/编号/出货人 实时过滤）
  const visible = useMemo(() => {
    const term = kw.toLowerCase().trim()
    if (!term) return records
    return records.filter(r =>
      (r.product_name || '').toLowerCase().includes(term) ||
      (r.code_number || '').toLowerCase().includes(term) ||
      (r.receiver || '').toLowerCase().includes(term))
  }, [records, kw])

  const pickQuick = (key: (typeof QUICK_KEYS)[number]) => {
    const r = quickRange(key)
    setRangeStart(r.start); setRangeEnd(r.end)
    setSelStart(r.start); setSelEnd(r.end)
    setQuickLabel(QUICK_LABELS[QUICK_KEYS.indexOf(key)])
    setQuickOpen(false)
  }

  // ===== 日历（对齐旧 selectDate：两击选范围，自动交换起止） =====
  const rangeDisplay = useMemo(() => {
    if (rangeStart && rangeEnd) return `${fmtDisplay(rangeStart)} - ${fmtDisplay(rangeEnd)}`
    if (rangeStart) return `${fmtDisplay(rangeStart)} - 选择结束日期`
    return '选择日期范围'
  }, [rangeStart, rangeEnd])

  const selectDate = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    if (!selStart || (selStart && selEnd)) {
      setSelStart(d); setSelEnd(null)
      setRangeStart(d); setRangeEnd(null)
      return
    }
    let s = selStart, e = d
    if (d < s) { e = s; s = d }
    setSelStart(s); setSelEnd(e)
    setRangeStart(s); setRangeEnd(e)
    setCalOpen(false)
  }

  const dayClass = (date: Date, isOtherMonth: boolean) => {
    const cls = ['calendar-day']
    if (isOtherMonth) cls.push('other-month')
    const t0 = new Date(); t0.setHours(0, 0, 0, 0)
    if (date.getTime() === t0.getTime() && !isOtherMonth) cls.push('today')
    if (selStart && selEnd) {
      const st = selStart.getTime(), en = selEnd.getTime(), cu = date.getTime()
      if (cu === st && cu === en) cls.push('selected', 'start-date', 'end-date')
      else if (cu === st) cls.push('start-date')
      else if (cu === en) cls.push('end-date')
      else if (cu > st && cu < en) cls.push('in-range')
    } else if (selStart && date.getTime() === selStart.getTime()) {
      cls.push('start-date', 'selecting')
    } else if (selStart && !selEnd && previewDate) {
      // 悬停预览范围
      const st = selStart.getTime(), pv = previewDate.getTime(), cu = date.getTime()
      const lo = Math.min(st, pv), hi = Math.max(st, pv)
      if (cu >= lo && cu <= hi) cls.push('preview-range')
      if (cu === pv) cls.push('preview-end')
    }
    return cls.join(' ')
  }

  const calendarDays = useMemo(() => {
    const cells: { date: Date; other: boolean }[] = []
    const first = new Date(viewYear, viewMonth, 1)
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const lead = first.getDay()
    // 上月补位
    for (let i = lead - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i)
      cells.push({ date: d, other: true })
    }
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(viewYear, viewMonth, d), other: false })
    // 下月补位（补满整周）
    while (cells.length % 7 !== 0) {
      const d = new Date(viewYear, viewMonth + 1, cells.length - lead - daysInMonth + 1)
      cells.push({ date: d, other: true })
    }
    return cells
  }, [viewYear, viewMonth])

  const changeMonth = (delta: number) => {
    const m = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(m.getFullYear()); setViewMonth(m.getMonth())
  }

  // ===== 导出（对齐旧 confirmExport → 生成 PDF 发票） =====
  const parseDMY = (s: string) => {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) return null
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  }
  const toYMD = (d: Date) => fmtDay(d)

  const confirmExport = async () => {
    const sd = parseDMY(exportForm.startDate)
    const ed = parseDMY(exportForm.endDate)
    const id = parseDMY(exportForm.invoiceDate)
    if (!sd || !ed) { showToast('请选择开始和结束日期', 'error'); return }
    if (!exportForm.system) { showToast('请选择导出系统', 'error'); return }
    if (!id) { showToast('请选择发票日期', 'error'); return }
    if (!/^\d{3}$/.test(exportForm.invoiceSuffix)) { showToast('请输入三位数字的发票号码后缀（例如：001）', 'error'); return }
    if (sd > ed) { showToast('开始日期不能晚于结束日期', 'error'); return }
    setExporting(true)
    try {
      const invoiceNumber = generateInvoiceNumber(exportForm.system, toYMD(id), exportForm.invoiceSuffix)
      const rows = await getInvoiceData(exportForm.system, toYMD(sd), toYMD(ed))
      await generateInvoicePdf(rows as any[], toYMD(sd), toYMD(ed), exportForm.system, invoiceNumber, toYMD(id))
      setExportOpen(false)
      showToast('PDF 发票生成成功')
    } catch { /* 拦截器已提示 */ }
    finally { setExporting(false) }
  }

  if (access.ready && !allowed) {
    return <MobileDenied branch={access.branch} system={system} />
  }

  const total = visible.length

  return (
    <div className="mobrec-root">
      <div className="container">
        <div className="header">
          <div>
            <h1 id="page-title"> 手机出货记录 - {system.toUpperCase()}</h1>
          </div>
          <a
            className="back-button"
            href={`/inout?system=${system}`}
            onClick={(e) => { e.preventDefault(); navigate(`/inout?system=${system}`) }}
          >
            <i className="fas fa-arrow-left" />
            返回上一页
          </a>
        </div>

        {/* unified-header-row */}
        <div className="unified-header-row">
          <div className="date-controls">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label className="date-label">日期范围</label>
              <div style={{ position: 'relative' }}>
                <div className="date-range-picker" onClick={() => setCalOpen(!calOpen)}>
                  <i className="fas fa-calendar-alt" />
                  <span>{rangeDisplay}</span>
                </div>
                {calOpen && (
                  <div className="calendar-popup" style={{ display: 'block', position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 5000 }} onClick={e => e.stopPropagation()}>
                    <div className="calendar-header">
                      <button className="calendar-nav-btn" onClick={() => changeMonth(-1)}><i className="fas fa-chevron-left" /></button>
                      <div className="calendar-month-year">
                        <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}>
                          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i + 1}月</option>)}
                        </select>
                        <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))}>
                          {Array.from({ length: 7 }, (_, i) => today.getFullYear() - 3 + i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <button className="calendar-nav-btn" onClick={() => changeMonth(1)}><i className="fas fa-chevron-right" /></button>
                    </div>
                    <div className="calendar-weekdays">
                      {['日', '一', '二', '三', '四', '五', '六'].map(w => <div key={w} className="calendar-weekday">{w}</div>)}
                    </div>
                    <div className="calendar-days">
                      {calendarDays.map(({ date, other }, i) => (
                        <div key={i} className={dayClass(date, other)}
                          onClick={() => selectDate(date)}
                          onMouseEnter={() => { if (selStart && !selEnd) setPreviewDate(date) }}
                          onMouseLeave={() => setPreviewDate(null)}>
                          {date.getDate()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label className="date-label-with-icon">
                <i className="fas fa-clock" style={{ color: '#000000ff' }} />
                快速选择
              </label>
              <div className="dropdown">
                <button className="btn btn-secondary dropdown-toggle" onClick={() => setQuickOpen(!quickOpen)}>
                  <i className="fas fa-calendar-alt" />
                  <span>{quickLabel}</span>
                  <i className="fas fa-chevron-down" />
                </button>
                {quickOpen && (
                  <div className="dropdown-menu" style={{ display: 'block' }}>
                    {QUICK_KEYS.map((k, i) => (
                      <button key={k} className="dropdown-item" onClick={() => pickQuick(k)}>{QUICK_LABELS[i]}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="header-right-group">
            <div className="header-search">
              <span style={{ fontSize: 'clamp(8px, 0.74vw, 14px)', fontWeight: 600, color: '#000000ff', whiteSpace: 'nowrap' }}>搜索</span>
              <input type="text" className="unified-search-input" placeholder="输入关键字搜索..." value={kw} onChange={e => setKw(e.target.value)} />
            </div>

            <button className="btn btn-warning" onClick={() => {
              const t = fmtDay(new Date())
              const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
              setExportForm({
                startDate: rangeStart ? dmy(fmtDay(rangeStart)) : dmy(t),
                endDate: rangeEnd ? dmy(fmtDay(rangeEnd)) : dmy(t),
                system: system,
                invoiceDate: dmy(t),
                invoiceSuffix: '',
              })
              setExportOpen(true)
            }}>
              <i className="fas fa-download" />
              导出数据
            </button>

            <div className="header-stats">
              <span>总记录数: <span className="stat-value">{total}</span></span>
            </div>
          </div>
        </div>

        {/* 库存表格 */}
        <div className="table-container">
          <div className="table-scroll-container" ref={scrollRef} onScroll={e => setShowTop((e.target as HTMLDivElement).scrollTop > 300)}>
            <table className="stock-table" id="stock-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 100 }}>日期</th>
                  <th style={{ minWidth: 100 }}>货品编号</th>
                  <th className="product-name-col" style={{ minWidth: 200 }}>货品</th>
                  <th style={{ minWidth: 120 }}>出货</th>
                  <th style={{ minWidth: 100 }}>出货人</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: 20, color: '#6b7280', textAlign: 'center', width: '100%' }}>加载中...</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 20, color: '#6b7280', textAlign: 'center', width: '100%' }}>暂无数据</td></tr>
                ) : visible.map(record => {
                  const outQty = parseFloat(String(record.out_quantity ?? 0)) || 0
                  return (
                    <tr key={record.id}>
                      <td className="date-cell">{fmtCellDate(record.date)}</td>
                      <td><span>{record.code_number || '-'}</span></td>
                      <td><span>{record.product_name}</span></td>
                      <td><span className={outQty > 0 ? 'negative-value' : ''}>{fmtNumber(record.out_quantity)}</span></td>
                      <td><span>{record.receiver || '-'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 生成 PDF 发票弹窗（对齐旧 export-modal） */}
        {exportOpen && (
          <div className="export-modal" style={{ display: 'block' }} onClick={e => { if (e.target === e.currentTarget) setExportOpen(false) }}>
            <div className="export-modal-content">
              <button className="close-export-modal" onClick={() => setExportOpen(false)}>&times;</button>
              <h3>生成PDF发票</h3>

              <div className="export-form-group">
                <label htmlFor="exp-start">开始日期</label>
                <input type="text" id="exp-start" placeholder="DD/MM/YYYY" value={exportForm.startDate}
                  onChange={e => setExportForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="export-form-group">
                <label htmlFor="exp-end">结束日期</label>
                <input type="text" id="exp-end" placeholder="DD/MM/YYYY" value={exportForm.endDate}
                  onChange={e => setExportForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="export-form-group">
                <label htmlFor="exp-system">店面</label>
                <select id="exp-system" value={exportForm.system} onChange={e => setExportForm(f => ({ ...f, system: e.target.value }))}>
                  <option value="j1">J1</option>
                  <option value="j2">J2</option>
                  <option value="j3">J3</option>
                </select>
              </div>
              <div className="export-form-group">
                <label htmlFor="exp-inv-date">发票日期</label>
                <input type="text" id="exp-inv-date" placeholder="DD/MM/YYYY" value={exportForm.invoiceDate}
                  onChange={e => setExportForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
              <div className="export-form-group">
                <label htmlFor="exp-suffix">发票号码后三位 *</label>
                <input type="text" id="exp-suffix" placeholder="输入三位数字（例如：001）" maxLength={3} value={exportForm.invoiceSuffix}
                  onChange={e => setExportForm(f => ({ ...f, invoiceSuffix: e.target.value }))} />
                <small style={{ color: '#6b7280', fontSize: 12 }}>格式示例：J1-2510-001（店面-年月-序号）</small>
              </div>

              <div className="export-modal-actions">
                <button className="btn btn-secondary" onClick={() => setExportOpen(false)}>
                  <i className="fas fa-times" /> 取消
                </button>
                <button className="btn btn-success" onClick={confirmExport} disabled={exporting}>
                  <i className={exporting ? 'fas fa-spinner fa-spin' : 'fas fa-download'} /> 导出发票
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 回到顶部 */}
        {showTop && (
          <button className="back-to-top" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} title="回到顶部">
            <i className="fas fa-chevron-up" />
          </button>
        )}
      </div>
    </div>
  )
}
