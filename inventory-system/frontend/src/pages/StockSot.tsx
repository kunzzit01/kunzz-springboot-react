import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSot, deleteSot, getCodeNumbers, getPriceStock, getProducts, getSots, updateSot } from '../api'
import { useRealtime } from '../utils/useRealtime'
import { flashAfterRow, useRowHighlight } from '../utils/rowHighlight'
import '../styles/stocksot.css'
import { showToast } from '../utils/toast'

/** 货品异常：对齐线上 stocksot.php（Excel 模式，算式：total_price = quantity × price） */
const VIEW_NAMES: Record<string, string> = { list: '总库存', records: '进出货', remark: '货品备注', product: '货品种类', sot: '货品异常' }
const SPEC_OPTIONS = ['Tub', 'Kilo', 'Piece', 'Bottle', 'Box', 'Packet', 'Carton', 'Tin', 'Roll', 'Nos', 'mL', 'Glass']
const CATEGORY_OPTIONS = ['Service Line', 'Sake', 'Kitchen', 'Sushi Bar']
const SYSTEM_NAMES: Record<string, string> = { central: '中央', j1: 'J1', j2: 'J2', j3: 'J3' }
const QUICK_RANGES: Record<string, [Date, Date]> = {
  today: [new Date(), new Date()],
  yesterday: [new Date(Date.now() - 864e5), new Date(Date.now() - 864e5)],
  thisWeek: [(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()) })(), new Date()],
  lastWeek: [(() => { const d = new Date(); const m = d.getDate() - d.getDay() - 7; return new Date(d.getFullYear(), d.getMonth(), m) })(), (() => { const d = new Date(); const m = d.getDate() - d.getDay() - 1; return new Date(d.getFullYear(), d.getMonth(), m) })()],
  thisMonth: [(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })(), new Date()],
  lastMonth: [(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1) })(), (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 0) })()],
  thisYear: [(() => { const d = new Date(); return new Date(d.getFullYear(), 0, 1) })(), new Date()],
  lastYear: [(() => { const d = new Date(); return new Date(d.getFullYear() - 1, 0, 1) })(), (() => { const d = new Date(); return new Date(d.getFullYear() - 1, 11, 31) })()],
}
const QUICK_LABELS = ['今天', '昨天', '本周', '上周', '这个月', '上个月', '今年', '去年']
const QUICK_KEYS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear']
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayStr = () => fmtDate(new Date())

interface SotRow {
  id?: number
  date?: string
  productCode?: string
  productName?: string
  quantity?: number
  specification?: string
  price?: number
  totalPrice?: number
  category?: string
}

/** 自动补全下拉（combobox）——支持 { label, value }（货品显示 NAME (SUPPLIER)，对齐旧系统） */
function Combobox({ options, value, onChange, onSelect, placeholder, disabled }: {
  options: (string | { label: string; value: string })[]
  value: string
  onChange: (v: string) => void
  onSelect?: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const norm = useMemo(
    () => options.map(o => (typeof o === 'string' ? { label: o, value: o } : o)),
    [options],
  )
  const filtered = useMemo(
    // 对齐老系统：展示全部匹配项，不做条数截断；按 value（真实值）过滤
    () => norm.filter(o => !value || o.value.toLowerCase().includes(value.toLowerCase())),
    [norm, value],
  )
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 80 }}>
      <input className="excel-input text-input" placeholder={placeholder} value={value} disabled={disabled}
        style={{ width: '100%' }}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} />
      {open && !disabled && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff',
          border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          maxHeight: 200, overflow: 'auto', marginTop: 2, textAlign: 'left',
        }}>
          {filtered.length === 0 && <div style={{ padding: 8, color: '#9ca3af', fontSize: 14 }}>无匹配</div>}
          {filtered.map((o) => (
            <div key={o.value + '|' + o.label} onClick={() => { onChange(o.value); onSelect?.(o.value); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={o.label}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8f5eb')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>{o.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 价格下拉：选货品后加载价格+库存，支持手动输入（对齐线上 updatePriceOptions + handlePriceChange） */
function PriceSelect({ value, options, onSelect, onManual }: {
  value?: number | string
  options: { price: string; available_stock: number }[]
  onSelect: (v: string) => void
  onManual: () => void
}) {
  const [manual, setManual] = useState(false)
  const [manualVal, setManualVal] = useState('')
  const current = value !== undefined && value !== null && value !== '' ? Number(value).toFixed(5) : ''
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {manual ? (
        <input type="number" className="excel-input manual-price-input" min={0} step={0.00001} placeholder="输入价格"
          value={manualVal} autoFocus
          onChange={(e) => { setManualVal(e.target.value); if (e.target.value !== '') onSelect(e.target.value) }}
          onBlur={() => { if (!manualVal) setManual(false) }} />
      ) : (
        <select className="excel-select" value={current} onChange={(e) => {
          if (e.target.value === 'manual') { setManual(true); onManual(); return }
          onSelect(e.target.value)
        }}>
          <option value="">请选择价格</option>
          <option value="manual">手动输入价格</option>
          {options.map((o, i) => {
            const sel = current && Math.abs(Number(o.price) - Number(current)) < 0.00001
            const label = sel ? Number(o.price).toFixed(5) : `${Number(o.price).toFixed(5)} (库存: ${o.available_stock})`
            return <option key={i} value={o.price} selected={!!sel}>{label}</option>
          })}
          {current && !options.some(o => Math.abs(Number(o.price) - Number(current)) < 0.00001) && (
            <option value={current} selected>{current}</option>
          )}
        </select>
      )}
    </div>
  )
}

/** 日历弹窗（对齐线上 calendar-popup：月视图选择起止日期） */
function Calendar({ start, end, onSelect, onClose }: {
  start: string
  end: string
  onSelect: (start: string, end: string) => void
  onClose: () => void
}) {
  const [viewDate, setViewDate] = useState(new Date())
  const [pickStart, setPickStart] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // 定位到日期选择器下方（useLayoutEffect：绘制前定位，避免闪烁）
  useLayoutEffect(() => {
    const picker = document.querySelector('.sos-root .date-range-picker')
    if (picker) {
      const r = picker.getBoundingClientRect()
      setAnchor({ top: r.bottom + 4, left: r.left })
    }
  }, [])

  const days = useMemo(() => {
    const y = viewDate.getFullYear(), m = viewDate.getMonth()
    const first = new Date(y, m, 1).getDay()
    const total = new Date(y, m + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < first; i++) cells.push(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    return cells
  }, [viewDate])

  const clickDay = (d: number) => {
    const day = fmtDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), d))
    if (!pickStart) {
      setPickStart(day)
    } else {
      const s = pickStart <= day ? pickStart : day
      const e = pickStart <= day ? day : pickStart
      onSelect(s, e)
      onClose()
    }
  }

  const monthNav = (dir: number) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1))

  return (
    <div ref={ref} className="calendar-popup" style={{ top: anchor?.top || 60, left: anchor?.left || 20 }}
      onClick={(e) => e.stopPropagation()}>
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={() => monthNav(-1)}><i className="fas fa-chevron-left" /></button>
        <div className="calendar-month-year">
          <select value={viewDate.getMonth()} onChange={(e) => setViewDate(new Date(viewDate.getFullYear(), Number(e.target.value), 1))}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={viewDate.getFullYear()} onChange={(e) => setViewDate(new Date(Number(e.target.value), viewDate.getMonth(), 1))}>
            {Array.from({ length: 21 }, (_, i) => viewDate.getFullYear() - 10 + i).map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>
        <button className="calendar-nav-btn" onClick={() => monthNav(1)}><i className="fas fa-chevron-right" /></button>
      </div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map(w => <div key={w} className="calendar-weekday">{w}</div>)}
      </div>
      <div className="calendar-days">
        {days.map((d, i) => {
          if (d === null) return <div key={i} className="calendar-day empty" />
          const day = fmtDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), d))
          const selected = day === start || day === end || day === pickStart
          const inRange = pickStart && ((day >= pickStart && day <= (end > pickStart ? end : start)) || (day >= start && day <= end))
          return (
            <div key={i}
              className={'calendar-day' + (selected ? ' selected' : '') + (inRange && !selected ? ' in-range' : '')}
              onClick={() => clickDay(d)}>{d}</div>
          )
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#6b7280' }}>
        {pickStart ? `已选开始: ${pickStart}，请选择结束日期` : '选择开始日期'}
      </div>
    </div>
  )
}

export default function StockSot() {
  const navigate = useNavigate()
  const urlSystem = new URL(window.location.href).searchParams.get('system')
  const system = urlSystem && SYSTEM_NAMES[urlSystem] ? urlSystem : 'central'
  const [viewOpen, setViewOpen] = useState(false)
  const [rows, setRows] = useState<SotRow[]>([])
  const [newRows, setNewRows] = useState<SotRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<SotRow>({})
  const [kw, setKw] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // 默认日期范围 = 今天（对齐线上 initEnhancedDatePickers）
  const [dateRange, setDateRange] = useState({ start: todayStr(), end: todayStr() })
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickLabel, setQuickLabel] = useState('')
  const [calOpen, setCalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showTop, setShowTop] = useState(false)
  // 每行价格选项（对齐线上 updatePriceOptions）
  const [priceLists, setPriceLists] = useState<Record<string, { price: string; available_stock: number }[]>>({})
  const searchRef = useRef<HTMLInputElement>(null)

  const [productOptions, setProductOptions] = useState<{ label: string; value: string }[]>([])
  const [codeOptions, setCodeOptions] = useState<string[]>([])

  // 新增保存后定位高亮（按货品名）
  const { flash, isHl } = useRowHighlight((r: any) => String(r.productName))

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  const load = () =>
    getSots()
      .then((list) => setRows(list || []))
      .catch(() => {})
  useEffect(() => { load() }, [])
  // 全站实时：货品异常增删改（本端或其他用户）后自动刷新（9/3 补齐）
  useRealtime('*', () => load(), 1000, 3000)
  useEffect(() => {
    // 货品下拉：显示 NAME (SUPPLIER)，无供应商回退 NAME (CODE)（对齐旧系统）
    getProducts().then((list) => setProductOptions((list || []).map((p: any) => {
      const name = String(p?.product_name || '')
      const sup = String(p?.supplier || '').trim()
      const code = String(p?.product_code || '').trim()
      return { value: name, label: sup ? `${name} (${sup})` : code ? `${name} (${code})` : name }
    }))).catch(() => {})
    getCodeNumbers().then((list) => setCodeOptions((list || []).map((c: any) => c.code_number))).catch(() => {})
  }, [])

  // 回到顶部按钮
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setShowTop(window.pageYOffset > 150), 10)
    }
    window.addEventListener('scroll', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const w = document.querySelector('.sos-root .smartSearchWrapper')
      if (w && w.contains(t)) return
      if (!searchRef.current?.value) setSearchExpanded(false)
      // 点击快速选择按钮/菜单内部不关闭（对齐真实点击时序，避免点开即被关闭的闪烁）
      if (!t.closest('.quick-wrapper')) setQuickOpen(false)
      // 点击日期选择器/日历内部不关闭
      if (!t.closest('.calendar-popup') && !t.closest('.date-range-picker')) setCalOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  const filtered = useMemo(() => {
    const q = kw.toLowerCase()
    return rows.filter((r) => {
      if (dateRange.start && String(r.date || '') < dateRange.start) return false
      if (dateRange.end && String(r.date || '') > dateRange.end) return false
      if (!q) return true
      return (r.productName || '').toLowerCase().includes(q) ||
        (r.productCode || '').toLowerCase().includes(q)
    })
  }, [rows, kw, dateRange])

  /** 算式：total_price = quantity × price（对齐线上 calculateTotal） */
  const calcTotal = (r: SotRow) => {
    const q = Math.abs(parseFloat(String(r.quantity ?? 0))) || 0
    const p = parseFloat(String(r.price ?? 0)) || 0
    return q * p
  }
  /** 总异常金额 = Σ total_price（对齐线上 updateTotalAnomalyValueFromDOM） */
  const anomalyTotal = useMemo(() =>
    [...newRows, ...filtered].reduce((sum, r) => sum + calcTotal(r), 0),
  [newRows, filtered]) // eslint-disable-line react-hooks/exhaustive-deps

  const addRow = () => {
    const key = 'new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    setNewRows(prev => [...prev, {
      id: undefined, date: todayStr(), productCode: '', productName: '',
      quantity: 0, specification: '', price: 0, totalPrice: 0, category: '',
    }])
    setPriceLists(prev => ({ ...prev, [key]: [] }))
    // 创建空行后自动滚动到待填写位置
    setTimeout(() => {
      const sc = document.querySelector('.excel-container .table-scroll-container')
      const rows = document.querySelectorAll('.excel-container tbody tr.new-row')
      if (sc && rows.length) {
        const last = rows[rows.length - 1]
        sc.scrollTop = Math.max(0, (last as HTMLElement).offsetTop - (((document.querySelector('.excel-container thead') as HTMLElement | null)?.offsetHeight) || 40) - 8)
      }
    }, 200)
  }

  const setNew = (idx: number, patch: Partial<SotRow>) => {
    setNewRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const next = { ...r, ...patch }
      next.totalPrice = calcTotal(next)
      return next
    }))
  }

  /** 选产品后：自动填充编号 + 加载价格选项（对齐线上 updatePriceOptions） */
  const onPickProduct = async (key: string, idx: number, name: string, isNew = true) => {
    if (!name) return
    try {
      const list = await getProducts()
      const hit = (list || []).find((p: any) => p.product_name === name)
      const patch: Partial<SotRow> = {}
      if (hit?.product_code) patch.productCode = hit.product_code
      const priceList = await getPriceStock(name, undefined, 1)
      const opts = (priceList || []).map((p: any) => ({ price: String(p.price), available_stock: p.available_stock || 0 }))
      setPriceLists(prev => ({ ...prev, [key]: opts }))
      if (opts.length > 0) patch.price = Number(opts[0].price)
      if (isNew) setNew(idx, patch)
      else setEditDraft(prev => ({ ...prev, ...patch }))
    } catch { /* ignore */ }
  }

  const saveNew = async (idx: number) => {
    const r = newRows[idx]
    if (!r.productName || !r.quantity || !r.specification || !r.category) {
      showMsg('请填写完整：产品名、数量、规格、类型', 'error'); return
    }
    const savedName = r.productName
    try {
      await createSot({
        date: r.date || undefined, productCode: r.productCode || undefined,
        productName: r.productName, quantity: Math.abs(Number(r.quantity)),
        specification: r.specification, price: Number(r.price || 0),
        totalPrice: calcTotal(r), category: r.category,
      })
      setNewRows(prev => prev.filter((_, i) => i !== idx))
      await load()
      flashAfterRow('.excel-container .table-scroll-container', 'td:nth-child(4)', savedName, flash)
      showMsg('已保存异常记录')
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
  }

  /** 保存所有数据（对齐线上 saveAllData：保存所有新行） */
  const saveAll = async () => {
    if (saving) return
    const valid = newRows.filter(r => r.productName && r.quantity && r.specification && r.category)
    if (valid.length === 0) { showMsg('没有可保存的新记录', 'error'); return }
    setSaving(true)
    try {
      let count = 0
      for (const r of valid) {
        await createSot({
          date: r.date || undefined, productCode: r.productCode || undefined,
          productName: r.productName, quantity: Math.abs(Number(r.quantity)),
          specification: r.specification, price: Number(r.price || 0),
          totalPrice: calcTotal(r), category: r.category,
        })
        count++
      }
      setNewRows([])
      await load()
      if (valid.length) {
        flashAfterRow('.excel-container .table-scroll-container', 'td:nth-child(4)', String(valid[0].productName), flash)
      }
      showMsg(`已保存 ${count} 条记录`)
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
    finally { setSaving(false) }
  }

  const startEdit = (r: SotRow) => {
    setEditingId(Number(r.id))
    setEditDraft({ ...r })
    if (r.productName) {
      getPriceStock(r.productName, undefined, 1)
        .then((list) => setPriceLists(prev => ({ ...prev, ['edit']: (list || []).map((p: any) => ({ price: String(p.price), available_stock: p.available_stock || 0 })) })))
        .catch(() => {})
    }
  }
  const saveEdit = async () => {
    if (!editDraft.id) return
    try {
      await updateSot(Number(editDraft.id), {
        date: editDraft.date || undefined, productCode: editDraft.productCode || undefined,
        productName: editDraft.productName, quantity: Math.abs(Number(editDraft.quantity || 0)),
        specification: editDraft.specification, price: Number(editDraft.price || 0),
        totalPrice: calcTotal(editDraft), category: editDraft.category,
      })
      setEditingId(null)
      load()
      showMsg('已更新')
    } catch (e: any) { showMsg(e?.response?.data?.message || '更新失败', 'error') }
  }

  const remove = async (r: SotRow) => {
    if (!window.confirm(`确定要删除这行数据吗？删除后，相关库存会恢复！`)) return
    try { await deleteSot(Number(r.id)); load(); showMsg('记录已删除，相关库存已恢复') } catch (e: any) { showMsg(e?.response?.data?.message || '删除失败', 'error') }
  }

  const toggleBatch = () => {
    setBatchMode(!batchMode)
    setSelected(new Set())
  }
  const confirmBatchDelete = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`确定删除选中的 ${selected.size} 条异常记录？删除后，相关库存会恢复！`)) return
    try {
      for (const id of selected) await deleteSot(id)
      setBatchMode(false); setSelected(new Set()); load()
      showMsg(`已删除 ${selected.size} 条记录`)
    } catch { showMsg('批量删除失败', 'error') }
  }
  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  const pickQuick = (key: string) => {
    const [s, e] = QUICK_RANGES[key]
    setDateRange({ start: fmtDate(s), end: fmtDate(e) })
    setQuickLabel(QUICK_LABELS[QUICK_KEYS.indexOf(key)] || '')
    setQuickOpen(false)
  }

  const rowTotal = (r: SotRow) => {
    const q = Math.abs(parseFloat(String(r.quantity ?? 0))) || 0
    const p = parseFloat(String(r.price ?? 0)) || 0
    return q * p
  }

  const goView = (k: string) => {
    setViewOpen(false)
    if (k === 'list') navigate('/records?system=' + system)
    else if (k === 'records') navigate('/inout?system=' + system)
    else if (k === 'remark') navigate('/remark?system=' + system)
    else if (k === 'product') navigate('/products?system=' + system)
  }

  return (
    <div className="sos-root">
      <div className="container">
        <div className="header">
          <div><h1>货品异常</h1></div>
          <div className="controls">
            <div className="view-selector">
              <button className="selector-button" onClick={() => setViewOpen(!viewOpen)}>
                <span id="current-view">货品异常</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className={'selector-dropdown' + (viewOpen ? ' show' : '')}>
                {Object.entries(VIEW_NAMES).map(([k, v]) => (
                  <div key={k} className={'dropdown-item' + (k === 'sot' ? ' active' : '')} onClick={() => goView(k)}>{v}</div>
                ))}
              </div>
            </div>
            <button className="selector-button" style={{ justifyContent: 'center' }}>
              <span id="current-stock-type">{SYSTEM_NAMES[system] || '中央'}</span>
            </button>
          </div>
        </div>

        <div className="unified-header-row">
          <div className="header-summary">
            <div className="summary-title">总异常</div>
            <div className="summary-amount">
              <span className="currency-symbol">RM</span>
              <span className="value" id="total-anomaly-value">{anomalyTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="date-controls">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label className="date-label">日期范围</label>
              <div className="date-range-picker" onClick={() => setCalOpen(!calOpen)}>
                <i className="fas fa-calendar-alt" />
                <span>{dateRange.start ? `${dateRange.start} ~ ${dateRange.end}` : '选择日期范围'}</span>
              </div>
            </div>
            <div className="quick-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
              <label className="date-label"><i className="fas fa-clock" style={{ color: '#000' }} /> 快速选择</label>
              <button className="btn btn-secondary" onClick={() => setQuickOpen(!quickOpen)} style={{ whiteSpace: 'nowrap' }}>
                <i className="fas fa-calendar-alt" /> <span id="quick-select-text">{quickLabel || '时段'}</span> <i className="fas fa-chevron-down" />
              </button>
              {quickOpen && (
                <div className="quick-menu" style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 1000, background: '#fff',
                  border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)',
                  minWidth: 130, marginTop: 4, overflow: 'hidden',
                }}>
                  {QUICK_KEYS.map((k, i) => (
                    <button key={k} onClick={() => pickQuick(k)}
                      style={{ display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8f5eb')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>{QUICK_LABELS[i]}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="header-right-group">
            <div className="header-search">
              <div className={'smartSearchWrapper' + (searchExpanded ? ' expanded' : '')}
                onClick={(e) => { if (!searchExpanded) { e.stopPropagation(); setSearchExpanded(true); setTimeout(() => searchRef.current?.focus(), 200) } }}>
                <i className="fas fa-search smartSearch-icon"></i>
                <input ref={searchRef} type="text" className="smartSearch-input" placeholder="输入关键字搜索..."
                  onChange={(e) => setKw(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-success" onClick={addRow}><i className="fas fa-plus" /> 新增记录</button>
            <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
              {saving ? <><span className="loading" style={{ width: 14, height: 14, borderTopColor: '#fff' }} /> 保存中...</> : <><i className="fas fa-save" /> 保存数据</>}
            </button>
            <button className="btn btn-danger" onClick={toggleBatch}>
              <i className="fas fa-trash-alt" /> {batchMode ? '取消' : '批量删除'}
            </button>
            {batchMode && (
              <button className="btn btn-success" onClick={confirmBatchDelete}><i className="fas fa-check" /> 确认删除 ({selected.size})</button>
            )}
            <div className="header-stats">
              <span>总记录数: <span className="stat-value" id="total-records">{rows.length}</span></span>
            </div>
          </div>
        </div>

        <div className="excel-container">
          <div className="table-scroll-container">
            <table className="excel-table" id="excel-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 50 }}>序号</th>
                  <th style={{ minWidth: 100 }}>日期</th>
                  <th style={{ minWidth: 110 }}>货品编号</th>
                  <th style={{ minWidth: 170 }}>货品名字</th>
                  <th style={{ minWidth: 80 }}>数量</th>
                  <th style={{ minWidth: 100 }}>规格</th>
                  <th style={{ minWidth: 130 }}>单价</th>
                  <th style={{ minWidth: 100 }}>总价</th>
                  <th style={{ minWidth: 110 }}>货品类型</th>
                  <th style={{ minWidth: 90 }}>操作</th>
                </tr>
              </thead>
              <tbody id="excel-tbody">
                {newRows.map((r, idx) => {
                  const key = 'new-' + idx
                  return (
                    <tr key={key} className="new-row editing-row">
                      <td className="serial-number-cell">-</td>
                      <td><input type="date" className="excel-input datetime-input" value={r.date || ''} onChange={(e) => setNew(idx, { date: e.target.value })} /></td>
                      <td>
                        <Combobox options={codeOptions} value={r.productCode || ''} placeholder="输入或选择编号..."
                          onChange={(v) => setNew(idx, { productCode: v })} />
                      </td>
                      <td>
                        <Combobox options={productOptions} value={r.productName || ''} placeholder="输入或选择货品..."
                          onChange={(v) => setNew(idx, { productName: v })}
                          onSelect={(v) => onPickProduct(key, idx, v)} />
                      </td>
                      <td><input type="number" className="excel-input" min={0.01} step={0.01} value={r.quantity || ''} placeholder="0.00"
                        onChange={(e) => setNew(idx, { quantity: Number(e.target.value) })} /></td>
                      <td>
                        <select className="excel-select" value={r.specification || ''} onChange={(e) => setNew(idx, { specification: e.target.value })}>
                          <option value="">选择规格</option>{SPEC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td>
                        <PriceSelect value={r.price || ''} options={priceLists[key] || []}
                          onSelect={(v) => setNew(idx, { price: Number(v) })}
                          onManual={() => {}} />
                      </td>
                      <td><input className="excel-input" value={rowTotal(r).toFixed(2)} readOnly /></td>
                      <td>
                        <select className="excel-select" value={r.category || ''} onChange={(e) => setNew(idx, { category: e.target.value })}>
                          <option value="">选择类型</option>{CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="action-cell">
                        <button className="action-btn save-btn" onClick={() => saveNew(idx)} title="保存记录"><i className="fas fa-save" /></button>
                        <button className="action-btn delete-btn" onClick={() => setNewRows(prev => prev.filter((_, i) => i !== idx))} title="删除此行"><i className="fas fa-trash" /></button>
                      </td>
                    </tr>
                  )
                })}
                {filtered.map((r, idx) => {
                  const isEditing = editingId === Number(r.id)
                  return (
                    <tr key={r.id} className={(isEditing ? 'editing-row' : '') + (isHl(r) ? ' highlight-flash' : '')}>
                      <td className="serial-number-cell">{batchMode ? (
                        <input type="checkbox" className="batch-select-checkbox" checked={selected.has(Number(r.id))} onChange={() => toggleSelect(Number(r.id))} />
                      ) : (idx + 1)}</td>
                      <td>{isEditing
                        ? <input type="date" className="excel-input" value={editDraft.date || ''} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                        : (r.date || '-')}</td>
                      <td>{isEditing
                        ? <Combobox options={codeOptions} value={editDraft.productCode || ''} onChange={(v) => setEditDraft({ ...editDraft, productCode: v })} />
                        : (r.productCode || '-')}</td>
                      <td>{isEditing
                        ? <Combobox options={productOptions} value={editDraft.productName || ''} placeholder="输入或选择货品..."
                            onChange={(v) => setEditDraft({ ...editDraft, productName: v })}
                            onSelect={(v) => onPickProduct('edit', -1, v, false)} />
                        : <b>{r.productName}</b>}</td>
                      <td>{isEditing
                        ? <input type="number" className="excel-input" min={0.01} step={0.01} value={editDraft.quantity || ''} onChange={(e) => setEditDraft({ ...editDraft, quantity: Number(e.target.value) })} />
                        : Number(r.quantity || 0)}</td>
                      <td>{isEditing
                        ? <select className="excel-select" value={editDraft.specification || ''} onChange={(e) => setEditDraft({ ...editDraft, specification: e.target.value })}>
                            <option value="">-</option>{SPEC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        : (r.specification || '-')}</td>
                      <td>{isEditing
                        ? <PriceSelect value={editDraft.price || ''} options={priceLists['edit'] || []}
                            onSelect={(v) => setEditDraft({ ...editDraft, price: Number(v) })}
                            onManual={() => {}} />
                        : Number(r.price || 0).toFixed(2)}</td>
                      <td><input className="excel-input" value={isEditing ? calcTotal(editDraft).toFixed(2) : Number(r.totalPrice || 0).toFixed(2)} readOnly /></td>
                      <td>{isEditing
                        ? <select className="excel-select" value={editDraft.category || ''} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}>
                            <option value="">-</option>{CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        : (r.category || '-')}</td>
                      <td className="action-cell">
                        {isEditing ? (
                          <>
                            <button className="action-btn save-btn" onClick={saveEdit} title="保存记录"><i className="fas fa-save" /></button>
                            <button className="action-btn delete-btn" onClick={() => setEditingId(null)} title="取消"><i className="fas fa-times" /></button>
                          </>
                        ) : (
                          <>
                            <button className="action-btn edit-btn" onClick={() => startEdit(r)} title="编辑记录"><i className="fas fa-edit" /></button>
                            <button className="action-btn delete-btn" onClick={() => remove(r)} title="删除此行"><i className="fas fa-trash" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && newRows.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 40, color: '#6b7280' }}>暂无异常记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {calOpen && (
        <Calendar start={dateRange.start} end={dateRange.end}
          onSelect={(s, e) => setDateRange({ start: s, end: e })}
          onClose={() => setCalOpen(false)} />
      )}

      <button className={'back-to-top' + (showTop ? ' show' : '')} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="回到顶部">
        <i className="fas fa-chevron-up" />
      </button>

    </div>
  )
}
