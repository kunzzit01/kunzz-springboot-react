import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getMobileRecords, type MobileRecord } from '../api/mobile'
import { showToast } from '../utils/toast'
import { useMobileAccess, mobileLogout, MobileDenied } from '../utils/useMobileAccess'
import '../styles/mobile-stocklist.css'

/**
 * 手机出货记录（对齐旧系统 /jX/jXstockeditmobile.php「手机出货记录 - JX」的记录视图）
 * 桌面进出货「手机版」按钮的落点（对齐旧 mobile-selector → jXstockeditmobile）。
 * 功能：快速日期（今天/昨天/本周/上周/这个月/上个月/今年/去年，对齐旧 selectQuickRange）+
 *   日期范围 + 搜索（货品/编号）+ 记录列表（日期/货品编号/货品/出货(进货)/出货人）+ CSV 导出。
 * 权限：双层校验（branch + 权限树），与 /mobile/out 一致。
 */

const STORES = ['j1', 'j2', 'j3'] as const
const STORE_LABEL: Record<string, string> = { j1: 'J1', j2: 'J2', j3: 'J3' }

const QUICK_KEYS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear'] as const
const QUICK_LABELS = ['今天', '昨天', '本周', '上周', '这个月', '上个月', '今年', '去年']

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 对齐旧 selectQuickRange 的 8 档日期范围 */
function quickRange(key: (typeof QUICK_KEYS)[number]): { start: string; end: string; label: string } {
  const today = new Date()
  const endOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  switch (key) {
    case 'today': return { start: fmtDay(today), end: fmtDay(today), label: '今天' }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { start: fmtDay(y), end: fmtDay(y), label: '昨天' }
    }
    case 'thisWeek': {
      // 本周（周一到今天）
      const monday = new Date(today)
      const dow = monday.getDay()
      monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1))
      return { start: fmtDay(monday), end: fmtDay(today), label: '本周' }
    }
    case 'lastWeek': {
      // 上周（上周一到上周日）
      const lastSunday = new Date(today)
      const dow = lastSunday.getDay()
      lastSunday.setDate(lastSunday.getDate() - (dow === 0 ? 0 : dow) - 1)
      const lastMonday = new Date(lastSunday)
      lastMonday.setDate(lastSunday.getDate() - 6)
      return { start: fmtDay(lastMonday), end: fmtDay(lastSunday), label: '上周' }
    }
    case 'thisMonth': return { start: fmtDay(new Date(today.getFullYear(), today.getMonth(), 1)), end: fmtDay(endOf(today)), label: '这个月' }
    case 'lastMonth': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const e = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: fmtDay(s), end: fmtDay(e), label: '上个月' }
    }
    case 'thisYear': return { start: `${today.getFullYear()}-01-01`, end: fmtDay(today), label: '今年' }
    case 'lastYear': return { start: `${today.getFullYear() - 1}-01-01`, end: `${today.getFullYear() - 1}-12-31`, label: '去年' }
  }
}

const qty3 = (n?: number) => (n == null ? '0.000' : Number(n).toFixed(3))

export default function MobileRecords() {
  const [searchParams] = useSearchParams()
  const system = useMemo(() => {
    const s = (searchParams.get('system') || 'j1').toLowerCase()
    return (STORES as readonly string[]).includes(s) ? s : 'j1'
  }, [searchParams])

  const access = useMobileAccess()
  const allowed = access.ready && access.allowedSystems.includes(system)

  const [rows, setRows] = useState<MobileRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const init = quickRange('today')
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)
  const [quickLabel, setQuickLabel] = useState('今天')

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    try {
      const data = await getMobileRecords(system, start, end)
      setRows(data)
    } catch { /* 拦截器已提示 */ }
    setLoading(false)
  }, [system, start, end, allowed])

  useEffect(() => { load() }, [load])

  // 搜索（货品名/编号，实时；对齐旧 unified-filter）
  const visible = useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return rows
    return rows.filter(r =>
      (r.product_name || '').toLowerCase().includes(term) ||
      (r.code_number || '').toLowerCase().includes(term))
  }, [rows, search])

  const totalOut = useMemo(() => visible.reduce((s, r) => s + (Number(r.out_quantity) || 0), 0), [visible])

  const pickQuick = (key: (typeof QUICK_KEYS)[number]) => {
    const r = quickRange(key)
    setStart(r.start); setEnd(r.end); setQuickLabel(r.label)
  }

  /** CSV 导出（Excel 友好；发票 PDF 导出对齐后续） */
  const exportCsv = () => {
    if (visible.length === 0) { showToast('没有数据可导出', 'error'); return }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['日期', '时间', '货品编号', '货品', '规格', '进货', '出货', '单价', '出货人']
    const lines = [head.map(esc).join(',')]
    visible.forEach(r => lines.push([
      r.date, r.time, r.code_number || '', r.product_name, r.specification || '',
      qty3(r.in_quantity), qty3(r.out_quantity), r.price != null ? Number(r.price).toFixed(2) : '', r.receiver || '',
    ].map(esc).join(',')))
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mobile_records_${system.toUpperCase()}_${start.replace(/-/g, '')}_${end.replace(/-/g, '')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('CSV 已导出')
  }

  return (
    <div className="msl-page">
      {/* ===== 页头：退出 + 标题 + （日历钮占位与库存列表页一致） ===== */}
      <header className="msl-header">
        <button className="msl-logout" onClick={mobileLogout} aria-label="退出登录" title="退出登录">
          {IconLogout}
        </button>
        <h1 className="msl-title">手机出货记录 ({STORE_LABEL[system]})</h1>
        <div className="msl-header-right">
          <span className="msl-date">{rows.length > 0 ? `${visible.length} 条` : ''}</span>
          <button className="msl-cal-btn" onClick={exportCsv} aria-label="导出CSV" title="导出 CSV">
            {IconDownload}
          </button>
        </div>
      </header>

      {/* ===== 筛选区（吸顶：快速日期 + 范围 + 搜索） ===== */}
      <section className="msl-form">
        <div className="msl-selects-row">
          <div className="msl-select-group">
            <div className="msl-select-wrap">
              <select value={quickLabel} onChange={e => { const k = QUICK_KEYS[QUICK_LABELS.indexOf(e.target.value)]; if (k) pickQuick(k) }} aria-label="快速选择">
                <option value="" hidden>自选</option>
                {QUICK_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <span className="msl-select-icon" aria-hidden="true" />
            </div>
          </div>
          <div className="msl-select-group msl-date-range-group">
            <input type="date" className="msl-date-mini" value={start} onChange={e => { setStart(e.target.value); setQuickLabel('') }} aria-label="开始日期" />
            <span className="msl-date-sep">~</span>
            <input type="date" className="msl-date-mini" value={end} onChange={e => { setEnd(e.target.value); setQuickLabel('') }} aria-label="结束日期" />
          </div>
        </div>
        <div className="msl-search">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="按商品名称 / 编号搜索" aria-label="搜索" />
          <button className="msl-btn-search" onClick={() => { /* 实时过滤 */ }} aria-label="搜索">{IconSearch}</button>
        </div>
      </section>

      {/* stats */}
      <div className="msl-stats">
        <span>显示记录: <span className="msl-stat-value">{visible.length}</span></span>
        <span>出货合计: <span className="msl-stat-value">{totalOut.toFixed(3)}</span></span>
      </div>

      {!access.ready ? (
        <div className="msl-msg">加载中...</div>
      ) : !allowed ? (
        <MobileDenied branch={access.branch} system={system} />
      ) : (
        <>
          {loading && <div className="msl-msg">加载中...</div>}
          {!loading && visible.length === 0 && <div className="msl-msg">没有找到记录</div>}
          <div className="msl-list">
            {visible.map(r => (
              <div key={r.id} className="msl-row msl-rec-row">
                <div className="msl-rec-top">
                  <span className="msl-name">{r.product_name}</span>
                  <span className="msl-rec-date">{r.date} {r.time}</span>
                </div>
                <div className="msl-footer">
                  <span className="msl-meta">{r.code_number || '—'}{r.specification ? ` · ${r.specification}` : ''}</span>
                  {(Number(r.in_quantity) || 0) > 0 && (
                    <>
                      <span className="msl-sep" aria-hidden="true">|</span>
                      <span className="msl-qty-in">进货 {qty3(r.in_quantity)}</span>
                    </>
                  )}
                  {(Number(r.out_quantity) || 0) > 0 && (
                    <>
                      <span className="msl-sep" aria-hidden="true">|</span>
                      <span className="msl-qty-out">出货 {qty3(r.out_quantity)}</span>
                    </>
                  )}
                  {r.price != null && Number(r.price) > 0 && (
                    <>
                      <span className="msl-sep" aria-hidden="true">|</span>
                      <span className="msl-meta">RM {Number(r.price).toFixed(2)}</span>
                    </>
                  )}
                  <span className="msl-sep" aria-hidden="true">|</span>
                  <span className="msl-meta">{r.receiver || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* 图标（与 MobileOut 同风格内联 SVG） */
const IconLogout = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)
const IconSearch = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.2" y2="16.2" />
  </svg>
)
const IconDownload = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)
