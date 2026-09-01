import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { createStockInout, checkStockInout, deleteStockInout, exportBranchExcel, getCodeNumbers, getInvoiceData, getMe, getPriceBatches, getPriceStock, getProductDefaultPrice, getProducts,
  getRemarkCodes, getShippers, getStaff, getStockInout, restoreStockInout, updateStockInout, type CheckInoutResult } from '../api'
import { useRowHighlight } from '../utils/rowHighlight'
import { generateInvoiceNumber, generateInvoicePdf } from '../utils/invoicePdf'
import { useRealtime } from '../utils/useRealtime'
import type { StockInout } from '../types'
import '../styles/stockinout.css'
import ModalClose from '../components/ModalClose'
import AiAssistant from '../components/AiAssistant'
import { showToast } from '../utils/toast'

/** 进出货管理：完整对齐 stockeditall.php（unified-header-row + 日历 + 行内新增 + HIFO + 批量操作 + 导出弹窗） */
const SYSTEMS = [
  { key: 'central', label: '中央' },
  { key: 'j1', label: 'J1' },
  { key: 'j2', label: 'J2' },
  { key: 'j3', label: 'J3' },
]
const VIEW_NAMES: Record<string, string> = { list: '总库存', records: '进出货', remark: '货品备注', product: '货品种类', sot: '货品异常' }
const SPEC_OPTIONS = ['Tub', 'Kilo', 'Piece', 'Bottle', 'Box', 'Packet', 'Carton', 'Tin', 'Roll', 'Nos', 'mL', 'Glass']
const TYPE_OPTIONS = ['Service Line', 'Sake', 'Kitchen', 'Sushi Bar']
const PAGE_SIZE = 20000 // 对齐旧系统：一次性加载日期范围内全部记录（虚拟滚动渲染）
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const fmtNum = (v: any) => {
  const n = parseFloat(String(v ?? ''))
  if (isNaN(n) || n === 0) return '0.000'
  return n.toFixed(3)
}
const fmtMoney = (v: any) => {
  const n = parseFloat(String(v ?? ''))
  if (isNaN(n)) return '0.00'
  return n.toFixed(2)
}

// 渲染价格：显示 2 位小数，若原始单价（数据库精度）与显示价有差异则标记悬浮（8/23 线上修复）
const renderPriceRawTip = (rawVal: any) => {
  const raw = parseFloat(String(rawVal ?? ''))
  if (isNaN(raw)) return fmtMoney(rawVal || 0)
  const dispStr = fmtMoney(raw)
  const rounded = Math.round(raw * 100) / 100
  if (Math.abs(raw - rounded) < 0.0001) return dispStr
  const rawStr = String(parseFloat(raw.toFixed(6)))
  return <span className="raw-price-hover" data-raw-price={rawStr}>{dispStr}</span>
}

// 悬浮提示：fixed 定位到 body，避免被表格滚动容器 overflow 裁剪或与表头 z-index 冲突（8/23 线上修复）
function useRawPriceTooltip() {
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const el = t && t.closest ? t.closest('.raw-price-hover') : null
      if (!el) return
      const raw = el.getAttribute('data-raw-price')
      if (!raw) return
      let tip = document.getElementById('raw-price-tooltip') as HTMLElement | null
      if (!tip) {
        tip = document.createElement('div')
        tip.id = 'raw-price-tooltip'
        tip.className = 'raw-price-pop-fixed'
        document.body.appendChild(tip)
      }
      tip.textContent = 'RM ' + raw
      tip.style.display = 'block'
      const r = el.getBoundingClientRect()
      const tipW = tip.offsetWidth
      const tipH = tip.offsetHeight
      let left = r.left + r.width / 2 - tipW / 2
      left = Math.max(4, Math.min(left, window.innerWidth - tipW - 4))
      tip.style.left = left + 'px'
      if (r.top - tipH - 8 >= 0) {
        tip.style.top = (r.top - tipH - 8) + 'px'
      } else {
        tip.style.top = (r.bottom + 8) + 'px'
      }
    }
    const onOut = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t && t.closest && t.closest('.raw-price-hover')) {
        const tip = document.getElementById('raw-price-tooltip')
        if (tip) tip.style.display = 'none'
      }
    }
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.getElementById('raw-price-tooltip')?.remove()
    }
  }, [])
}

const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 自动补全下拉（对齐线上 combobox）
 *  下拉菜单通过 portal 渲染到 body 并 fixed 定位，避免被表格滚动容器 overflow 裁剪；
 *  输入框底部空间不足时自动向上展开（对齐旧系统 calculateDropdownPosition）。 */
type ComboOption = string | { label: string; value: string }

function Combobox({ options, value, onChange, onSelect, placeholder, style, disabled }: {
  options: ComboOption[]
  value: string
  onChange: (v: string) => void
  onSelect?: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [focusAll, setFocusAll] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; up: boolean; maxH: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  // 选项归一化：纯字符串或 { label, value }（货品显示 NAME (SUPPLIER)、编号显示 CODE (NAME)，对齐旧系统）
  const norm = useMemo(
    () => options.map(o => (typeof o === 'string' ? { label: o, value: o } : o)),
    [options],
  )
  const filtered = useMemo(
    // 对齐旧系统：展示全部匹配项（可滚动），不做条数截断；按 value（真实值）过滤
    () => norm.filter(o => !(focusAll ? '' : value) || o.value.toLowerCase().includes((focusAll ? '' : value).toLowerCase())),
    [norm, value, focusAll],
  )
  const close = () => setOpen(false)
  // 计算下拉位置：基于输入框 viewport 坐标（fixed 定位），下方空间不足（约 220px）时向上展开。
  // 向上展开用 bottom 定位（选单底部贴住输入框顶部，按实际高度自然贴合，无估算缝隙）
  const computePos = (): { top?: number; bottom?: number; left: number; width: number; up: boolean; maxH: number } | null => {
    const input = ref.current?.querySelector('input')
    if (!input) return null
    const r = input.getBoundingClientRect()
    const DROP_H = 220
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    let up: boolean
    if (below >= DROP_H) up = false
    else if (above >= DROP_H) up = true
    else up = above > below
    // 宽度按最长选项内容自适应（对齐旧系统 min-width 200 / max-width 400），选项不换行
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    let w = Math.max(r.width, 200)
    if (ctx) {
      // 与选项字体一致（15px，视力友好）
      ctx.font = '15px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
      for (const o of filtered) w = Math.max(w, ctx.measureText(o.label).width + 36)
    }
    const width = Math.min(400, w)
    // 向上时按可用空间限高避免超出视口顶
    if (up) return { bottom: window.innerHeight - r.top + 4, left: r.left, width, up, maxH: Math.min(200, Math.max(60, above)) }
    return { top: r.bottom + 2, left: r.left, width, up, maxH: 200 }
  }
  const openDropdown = () => { setPos(computePos()); setOpen(true) }
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      // 点击输入框包裹层或 portal 下拉内都不关闭
      if (ref.current?.contains(t) || dropRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])
  // 打开期间滚动 → 跟随输入框重新定位（不关闭，避免选单被滚动误关）
  useEffect(() => {
    if (!open) return
    const h = () => setPos(computePos())
    window.addEventListener('scroll', h, true)
    const sc = ref.current?.closest('.table-scroll-container') as HTMLElement | null
    sc?.addEventListener('scroll', h)
    return () => {
      window.removeEventListener('scroll', h, true)
      sc?.removeEventListener('scroll', h)
    }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 80, ...style }}>
      <input className="table-input text-input" placeholder={placeholder} value={value} disabled={disabled}
        style={{ width: '100%', paddingRight: value && !disabled ? 22 : 8 }}
        onChange={(e) => { setFocusAll(false); onChange(e.target.value); openDropdown() }}
        onFocus={(e) => { e.target.select(); setFocusAll(false); openDropdown() }} />
      {/* 清除按钮：点击后清空当前值（方便更换货品/编号） */}
      {value && !disabled && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onChange(''); openDropdown() }}
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 4px', zIndex: 2 }}
          title="清除">×</button>
      )}
      {open && !disabled && pos && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', left: pos.left, width: pos.width, zIndex: 9999,
          top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto',
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          maxHeight: pos.maxH, overflow: 'auto', textAlign: 'left',
        }}>
          {filtered.length === 0 && <div style={{ padding: 8, color: '#9ca3af', fontSize: 14 }}>无匹配</div>}
          {filtered.map((o, i) => (
            <div key={o.value + '-' + i} onClick={() => { setFocusAll(false); onChange(o.value); onSelect?.(o.value); close() }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={o.label}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8f5eb')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>{o.label}</div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

interface NewRow {
  key: string
  date: string
  codeNumber: string
  productName: string
  inQty: string
  outQty: string
  target: string
  specification: string
  price: string
  priceMode: string
  type: string
  remarkChecked: boolean
  remarkPrefix: string
  remarkSuffix: string
  receiver: string
  remark: string
  hifoBase?: string
  /** 货品供应商（选货品时记录，明确进货时自动填入并锁死） */
  supplier?: string
  /** 该行自己的价格/库存选项（各新增行独立，避免互相覆盖） */
  stockOptions?: { price: string; available_stock: number }[]
}

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
const QUICK_KEYS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear']
const QUICK_LABELS = ['今天', '昨天', '本周', '上周', '这个月', '上个月', '今年', '去年']

export default function StockInout() {
  useRawPriceTooltip()
  // 从 URL 读取初始系统（对齐 ?system=j3）
  const urlSystem = new URL(window.location.href).searchParams.get('system')
  const [system, setSystem] = useState(urlSystem && SYSTEMS.some(s => s.key === urlSystem) ? urlSystem : 'central')
  const [viewOpen, setViewOpen] = useState(false)
  const [sysOpen, setSysOpen] = useState(false)
  const [rows, setRows] = useState<StockInout[]>([])
  // 新增保存后定位高亮（按 id）
  const { flash, isHl } = useRowHighlight((r: any) => String(r.id))
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [kw, setKw] = useState('') // 输入框即时值
  const [searchKw, setSearchKw] = useState('') // 防抖后的搜索词（300ms，对齐旧系统 setupRealTimeSearch）
  const [exactMatch, setExactMatch] = useState(false) // 精确搜索：产品名 = 关键字（不区分大小写）
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 默认日期范围 = 今天（对齐线上：默认加载今日记录）
  const [dateRange, setDateRange] = useState({ start: fmtDate(new Date()), end: fmtDate(new Date()) })
  // 多行编辑：同时可编辑多行，每行独立的草稿与价格选项（互不覆盖）
  const [editingIds, setEditingIds] = useState<Set<number>>(new Set())
  const [editDrafts, setEditDrafts] = useState<Record<number, Record<string, string>>>({})
  const [editPriceOptions, setEditPriceOptions] = useState<Record<number, { price: string; available_stock: number }[]>>({})
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // 进出货检查弹窗（8/24 新增：Search Bar + 日期 + IN/OUT 总额）
  const [checkOpen, setCheckOpen] = useState(false)
  const [checkForm, setCheckForm] = useState({ name: '', start: fmtDate(new Date()), end: fmtDate(new Date()) })
  const [checkResult, setCheckResult] = useState<CheckInoutResult | null>(null)
  const [checkLoading, setCheckLoading] = useState(false)
  const [newRows, setNewRows] = useState<NewRow[]>([])
  // 弹窗
  const [calOpen, setCalOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickLabel, setQuickLabel] = useState('')
  const [rowsModal, setRowsModal] = useState(false)
  const [rowsForm, setRowsForm] = useState({ date: fmtDate(new Date()), count: '1', remark: '' })
  const [exportOpen, setExportOpen] = useState(false)
  const [exportForm, setExportForm] = useState({ start: '', end: '', system: '', invoiceDate: '', invoiceSuffix: '', includeIn: true, includeOut: true })
  // 保存中标志（防连点/防重复提交，对齐旧系统 batchSaveNewRows 的 disabled + spinner）
  const [saving, setSaving] = useState(false)
  // 删除撤销（对齐旧系统 undoDelete：删除后 10 秒内可撤销，Ctrl+Shift+Z）
  const [undo, setUndo] = useState<{ ids: number[]; count: number } | null>(null)
  const undoTimer = useRef<number | null>(null)
  const [showTop, setShowTop] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const [productOptions, setProductOptions] = useState<{ label: string; value: string }[]>([])
  const [codeOptions, setCodeOptions] = useState<{ label: string; value: string }[]>([])
  const [shipperOptions, setShipperOptions] = useState<string[]>([])
  // 创建人昵称映射（对齐旧系统 resolveCreatedByNicknames：nickname > username_cn > username）
  const [nicknameMap, setNicknameMap] = useState<Map<string, string>>(new Map())
  const [currentUser, setCurrentUser] = useState('')
  const newRowCounter = useRef(0)
  // 虚拟滚动（对齐 VIRTUAL_SCROLL_THRESHOLD=80）
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const ROW_HEIGHT = 37
  const VIRTUAL_THRESHOLD = 80
  // 日历状态
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calStart, setCalStart] = useState<Date | null>(null)
  const [calEnd, setCalEnd] = useState<Date | null>(null)
  const [calPreview, setCalPreview] = useState<Date | null>(null)

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  // 实时搜索（对齐旧系统 setupRealTimeSearch：300ms 防抖 + 搜索后回到第一页）
  const onSearchInput = (v: string) => {
    setKw(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchKw(v)
      setPage(0)
    }, 300)
  }

  const load = (p: number) =>
    getStockInout({
      page: p, size: PAGE_SIZE,
      targetSystem: system === 'central' ? undefined : system,
      keyword: searchKw || undefined,
      exactMatch: exactMatch || undefined,
      startDate: dateRange.start || undefined,
      endDate: dateRange.end || undefined,
    })
      .then((res) => { setRows(res.items); setTotal(res.total); return res.items })
      .catch(() => [] as StockInout[])
  useEffect(() => { load(page) }, [page, system, searchKw, exactMatch, dateRange.start, dateRange.end]) // eslint-disable-line react-hooks/exhaustive-deps

  // 全站实时更新：收到当前系统变更信号自动刷新（节流 3s + 尾部补刷；编辑行/弹窗打开时暂停）
  useRealtime(system, () => load(page), 1000, 3000, () =>
    editingIds.size > 0 || viewOpen || checkOpen || rowsModal || exportOpen || sysOpen)

  useEffect(() => {
    // 货品下拉：显示 NAME (SUPPLIER)，无供应商回退 NAME (CODE)（对齐旧系统 generateComboboxOptions）
    getProducts().then((list) => setProductOptions((list || []).map((p: any) => {
      const name = String(p?.product_name || '')
      const sup = String(p?.supplier || '').trim()
      const code = String(p?.product_code || '').trim()
      return { value: name, label: sup ? `${name} (${sup})` : code ? `${name} (${code})` : name }
    }))).catch(() => {})
    // 编号下拉：显示 CODE (NAME)（对齐旧系统）
    getCodeNumbers().then((list) => setCodeOptions((list || []).map((c: any) => {
      const code = String(c?.code_number || '')
      const name = String(c?.product_name || '').trim()
      return { value: code, label: name ? `${code} (${name})` : code }
    }))).catch(() => {})
    getShippers().then((list) => setShipperOptions(list || [])).catch(() => {})
    // 当前登录用户（用于 created_by / deleted_by，对齐旧系统存 username）
    getMe().then((u) => setCurrentUser(u?.username || '')).catch(() => {})
    // 用户名 → 昵称映射（创建人列展示昵称，对齐旧系统 stockeditapi.php resolveCreatedByNicknames）
    getStaff().then((list) => {
      const m = new Map<string, string>()
      ;(list || []).forEach((u: any) => {
        if (u?.username) m.set(u.username, u.displayName || u.nickname || u.usernameCn || u.username)
      })
      setNicknameMap(m)
    }).catch(() => {})
    const h = () => setShowTop(window.scrollY > 150)
    window.addEventListener('scroll', h)
    // smartSearch：点击外部且输入为空时折叠（对齐 collapseSmartSearch）
    const outClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // 点击日历弹窗或日期选择器外部时关闭日历
      const calPopup = document.querySelector('.sio-root .calendar-popup')
      if (calPopup && !t.closest('.calendar-popup') && !t.closest('.date-range-picker')) setCalOpen(false)
      // 点击快速选择（时段）菜单外部时关闭
      const qd = document.querySelector('.sio-root .quick-dropdown')
      if (qd && !t.closest('.quick-dropdown')) setQuickOpen(false)
      const w = document.querySelector('.sio-root .header-search .smartSearchWrapper')
      if (w && w.contains(t)) return
      if (!searchInputRef.current?.value) setSearchExpanded(false)
    }
    document.addEventListener('click', outClick)
    return () => {
      window.removeEventListener('scroll', h)
      document.removeEventListener('click', outClick)
    }
  }, [])

  // ---- 快捷键（对齐旧系统 stockeditall.js 全局快捷键：Ctrl+S 保存、Ctrl+Shift+Z 撤销、Ctrl+D 批量删除、Ctrl+A 加行、Ctrl+Shift+A 新增弹窗） ----
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    shortcutRef.current = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const isInput = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)
      // 弹窗/日历内不抢快捷键（对齐旧系统 isShortcutBlockedInput）
      const inBlocked = !!active?.closest('.modal-overlay, .calendar-popup, .sio-undo-bar')
      const inTable = !!active?.closest('.stock-table tbody')
      if (!(e.ctrlKey || e.metaKey)) return
      // A. 撤销删除 (Ctrl+Shift+Z)
      if (e.shiftKey && (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); e.stopPropagation()
        undoDelete(); return
      }
      // A2. 批量删除 (Ctrl+D)：未开启→进入批量模式；已开启→确认删除
      if (!e.shiftKey && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        if (batchMode) confirmBatchDelete(); else toggleBatch()
        return
      }
      // A3. 打开新增记录弹窗 (Ctrl+Shift+A)
      if (e.shiftKey && (e.code === 'KeyA' || e.key === 'a' || e.key === 'A')) {
        if (!isInput) { e.preventDefault(); showDateRowsModal() }
        return
      }
      // A4. 新增一行 (Ctrl+A)：表格内可连续按，不抢焦点
      if (!e.shiftKey && (e.code === 'KeyA' || e.key === 'a' || e.key === 'A')) {
        if (!inBlocked && (!isInput || inTable)) {
          e.preventDefault(); e.stopPropagation()
          appendNewRow()
        }
        return
      }
      // B. 保存 (Ctrl+S)：有编辑中行→逐行保存全部；有待保存新增行→批量保存
      if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        if (editingIds.size > 0) { saveAllEdits(); return }
        if (newRows.length > 0) saveNewRows()
      }
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.ctrlKey || e.metaKey) shortcutRef.current(e) }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  const fmtCN = (d: string) => {
    const [y, m, dd] = d.split('-')
    return `${y}年${m}月${dd}日`
  }
  const fmtDayAbbr = (d?: string) => {
    if (!d) return '-'
    const dt = new Date(d + 'T00:00:00')
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${dt.getDate()} ${MON[dt.getMonth()]}`
  }
  const useVirtual = rows.length > VIRTUAL_THRESHOLD && newRows.length === 0
  const virtual = useMemo(() => {
    if (!useVirtual) return { startIdx: 0, endIdx: rows.length, spacerTop: 0, spacerBottom: 0 }
    const containerH = scrollRef.current?.clientHeight || 600
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 8)
    const endIdx = Math.min(rows.length, Math.ceil((scrollTop + containerH) / ROW_HEIGHT) + 8)
    return {
      startIdx, endIdx,
      spacerTop: startIdx * ROW_HEIGHT,
      spacerBottom: (rows.length - endIdx) * ROW_HEIGHT,
    }
  }, [rows.length, useVirtual, scrollTop])
  const totalOf = (r: StockInout) => {
    const inQ = parseFloat(String(r.inQuantity ?? 0)) || 0
    const outQ = parseFloat(String(r.outQuantity ?? 0)) || 0
    const price = parseFloat(String(r.price ?? 0)) || 0
    return (inQ - outQ) * price
  }
  const typeLabel = (t?: string) => (t === 'Drinks' ? 'Service Line' : t) || '-'
  // 创建人昵称（对齐旧系统：username → nickname 展示）
  const nickOf = (u?: string) => {
    if (!u) return '-'
    return nicknameMap.get(u) || u
  }

  // ---- 日历（对齐 calendar-popup） ----
  const datePickerRef = useRef<HTMLDivElement>(null)
  const [calPos, setCalPos] = useState<{ top: number; left: number } | null>(null)
  const openCalendar = () => {
    const s = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : new Date()
    const e = dateRange.end ? new Date(dateRange.end + 'T00:00:00') : new Date()
    setCalStart(s); setCalEnd(e)
    setCalYear(s.getFullYear()); setCalMonth(s.getMonth())
    // 对齐旧系统 toggleCalendar：基于 date-range-picker 的位置动态定位（下方 8px）
    // 小屏防溢出：弹窗左缘不超出视口（左对齐输入框，靠右时夹紧）
    const rect = datePickerRef.current?.getBoundingClientRect()
    if (rect) {
      const popupW = 300
      let left = rect.left
      if (left + popupW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popupW - 8)
      setCalPos({ top: rect.bottom + 8, left })
    }
    setCalOpen(true)
  }
  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth, 1)
    const startWeek = first.getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const prevDays = new Date(calYear, calMonth, 0).getDate()
    const cells: { d: number; y: number; m: number; other: boolean }[] = []
    for (let i = startWeek - 1; i >= 0; i--) cells.push({ d: prevDays - i, y: calYear, m: calMonth - 1, other: true })
    for (let d = 1; d <= daysInMonth; d++) cells.push({ d, y: calYear, m: calMonth, other: false })
    let rem = cells.length % 7
    if (rem !== 0) for (let d = 1; d <= 7 - rem; d++) cells.push({ d, y: calYear, m: calMonth + 1, other: true })
    return cells
  }, [calYear, calMonth])
  const inRange = (y: number, m: number, d: number) => {
    const t = new Date(y, m, d).getTime()
    const s = calStart?.getTime()
    const p = calPreview?.getTime()
    if (s && p) return t > Math.min(s, p) && t < Math.max(s, p)
    return false
  }
  const pickDay = (y: number, m: number, d: number) => {
    const date = new Date(y, m, d)
    if (!calStart || (calStart && calEnd)) {
      setCalStart(date); setCalEnd(null); setCalPreview(null)
    } else {
      if (date < calStart) { setCalEnd(calStart); setCalStart(date) } else setCalEnd(date)
      setCalPreview(null)
      // 完成后关闭并应用
      const s = date < calStart ? date : calStart
      const e = date < calStart ? calStart : date
      setCalOpen(false)
      setDateRange({ start: fmtDate(s), end: fmtDate(e) })
      setPage(0)
    }
  }
  const pickQuick = (key: string) => {
    const [s, e] = QUICK_RANGES[key]
    setDateRange({ start: fmtDate(s), end: fmtDate(e) })
    setQuickLabel(QUICK_LABELS[QUICK_KEYS.indexOf(key)] || '')
    setQuickOpen(false); setPage(0)
  }

  // ---- 新增记录（对齐 date-rows-modal → 行内新增） ----
  const dateInputRef = useRef<HTMLInputElement>(null)
  // 备注 placeholder（对齐旧系统：中央保持原样，J1/J2/J3 改为“输入备注（发票号码/损耗）”）
  const remarkPlaceholder = system === 'central' ? '输入备注（可选）' : '输入备注（发票号码/损耗）'
  const closeRowsModal = () => {
    setRowsModal(false)
    setRowsForm(prev => ({ ...prev, remark: '' })) // 对齐旧系统 closeDateRowsModal：关闭时清空备注
  }
  const showDateRowsModal = () => {
    setRowsForm({ date: fmtDate(new Date()), count: '1', remark: '' })
    setRowsModal(true)
    // 对齐旧系统 showDateRowsModal：聚焦到日期输入框
    setTimeout(() => dateInputRef.current?.focus(), 100)
  }
  const createMultipleRows = () => {
    const selectedDate = rowsForm.date
    const rowsCount = parseInt(rowsForm.count) || 0
    // 对齐旧系统 createMultipleRows 输入验证
    if (!selectedDate) { showMsg('请选择日期', 'error'); return }
    if (!rowsCount || rowsCount < 1 || rowsCount > 50) { showMsg('请输入有效的行数（1-50）', 'error'); return }
    const n = Math.min(Math.max(rowsCount, 1), 50)
    const newOnes: NewRow[] = []
    for (let i = 0; i < n; i++) {
      newOnes.push({
        key: 'new-' + Date.now() + '-' + (newRowCounter.current++),
        date: selectedDate, codeNumber: '', productName: '',
        inQty: '', outQty: '', target: system, specification: '', price: '', priceMode: 'manual',
        type: '', remarkChecked: false, remarkPrefix: '', remarkSuffix: '', receiver: '', remark: rowsForm.remark,
      })
    }
    setNewRows(prev => [...prev, ...newOnes])
    setRowsModal(false)
    // 对齐旧系统 createMultipleRows：成功创建 N 行 toast
    showMsg(`成功创建 ${n} 行记录`)
    // 创建空行后自动滚动到待填写位置
    setTimeout(() => {
      const sc = scrollRef.current
      const newRow = document.querySelector('#stock-table tbody tr.new-row')
      if (sc && newRow) {
        sc.scrollTop = Math.max(0, (newRow as HTMLElement).offsetTop - (((document.querySelector('#stock-table thead') as HTMLElement | null)?.offsetHeight) || 40) - 8)
      }
    }, 200)
  }
  /** 快速追加一行（快捷键 Ctrl+A，对齐旧系统 appendNewStockRow） */
  const appendNewRow = () => {
    const row: NewRow = {
      key: 'new-' + Date.now() + '-' + (newRowCounter.current++),
      date: fmtDate(new Date()), codeNumber: '', productName: '',
      inQty: '', outQty: '', target: system, specification: '', price: '', priceMode: 'manual',
      type: '', remarkChecked: false, remarkPrefix: '', remarkSuffix: '', receiver: '', remark: '',
    }
    setNewRows(prev => [...prev, row])
    setTimeout(() => {
      const sc = scrollRef.current
      const newRow = document.querySelector('#stock-table tbody tr.new-row')
      if (sc && newRow) {
        sc.scrollTop = Math.max(0, (newRow as HTMLElement).offsetTop - (((document.querySelector('#stock-table thead') as HTMLElement | null)?.offsetHeight) || 40) - 8)
      }
    }, 200)
  }
  const patchNew = (key: string, patch: Partial<NewRow>) => {
    setNewRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r))
  }
  const computePrefix = (name: string) => {
    const clean = (name || '').trim().toUpperCase()
    const words = clean.split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    const alnum = (s: string) => (s.replace(/[^\p{L}\p{N}]/gu, ''))
    if (words.length === 1) return alnum(words[0]).substring(0, 2)
    return (alnum(words[0])[0] || '') + (alnum(words[1])[0] || '')
  }
  const onPickProduct = async (key: string, name: string) => {
    if (!name) return
    const row = newRows.find(r => r.key === key)
    try {
      const list = await getProducts()
      const hit = (list || []).find((p: any) => p.product_name === name)
      const autoCode = hit ? hit.product_code || '' : (row?.codeNumber || '')
      // 选择货品后：若有出库数量则按该数量加载价格+库存，否则加载全部价格（对齐旧系统）
      const reqQty = row && parseFloat(row.outQty) > 0 ? parseFloat(row.outQty) : 0
      const priceList = await getPriceStock(name, autoCode || undefined, reqQty || undefined, system)
      // 每行独立保存价格/库存选项（避免多行新增时互相覆盖）
      // 对齐旧系统 handleProductChange：选货品后自动补全编号/规格/类型/价格
      const spec = (hit && hit.specification) ? hit.specification : (row?.specification || '')
      let cat = (hit && hit.category) ? hit.category : (row?.type || '')
      if (cat === 'Drinks' || (cat && cat.toLowerCase() === 'service line')) cat = 'Service Line'
      // 方向决定价格模式：进货 → 手动单价（货品种类有单价则抓取，无则 0.00）；出货/未填数量 → 下拉（HIFO/自行选价）
      const isIncoming = parseFloat(row?.inQty || '0') > 0
      if (isIncoming) {
        const dp = await fetchDefaultPrice(name, autoCode || undefined)
        patchNew(key, {
          codeNumber: autoCode, remarkPrefix: computePrefix(name),
          specification: spec,
          type: cat || row?.type || '',
          supplier: hit?.supplier ? String(hit.supplier) : '',
          stockOptions: priceList || [],
          price: dp !== null ? dp : '0.00',
          priceMode: 'manual',
        })
      } else {
        patchNew(key, {
          codeNumber: autoCode, remarkPrefix: computePrefix(name),
          specification: spec,
          type: cat || row?.type || '',
          supplier: hit?.supplier ? String(hit.supplier) : '',
          stockOptions: priceList || [],
          price: '',
          priceMode: 'batch', // 出货：显示价格下拉（无库存显示「暂无库存价格」+ 手动输入选项，对齐旧系统）
        })
      }
    } catch { /* ignore */ }
  }
  /** 选择编号后自动回填货品（对齐旧系统 handleCodeNumberChange：code → 货品名/规格/类型/供应商/价格） */
  const onPickCode = async (key: string, code: string) => {
    if (!code) return
    const row = newRows.find(r => r.key === key)
    try {
      const list = await getProducts()
      const hit = (list || []).find((p: any) => String(p.product_code || '').toUpperCase() === String(code).toUpperCase())
      const name = hit?.product_name ? String(hit.product_name) : (row?.productName || '')
      if (!name) return
      // 与 onPickProduct 同款：按出库数量加载价格+库存
      const reqQty = row && parseFloat(row.outQty) > 0 ? parseFloat(row.outQty) : 0
      const priceList = await getPriceStock(name, code || undefined, reqQty || undefined, system)
      const spec = hit?.specification ? String(hit.specification) : (row?.specification || '')
      let cat = hit?.category ? String(hit.category) : (row?.type || '')
      if (cat === 'Drinks' || (cat && cat.toLowerCase() === 'service line')) cat = 'Service Line'
      // 方向决定价格模式：进货 → 手动单价（货品种类有单价则抓取，无则 0.00）；出货/未填数量 → 下拉
      const isIncoming = parseFloat(row?.inQty || '0') > 0
      if (isIncoming) {
        const dp = await fetchDefaultPrice(name, code || undefined)
        patchNew(key, {
          productName: name,
          codeNumber: code,
          remarkPrefix: computePrefix(name),
          specification: spec,
          type: cat || row?.type || '',
          supplier: hit?.supplier ? String(hit.supplier) : (row?.supplier || ''),
          stockOptions: priceList || [],
          price: dp !== null ? dp : '0.00',
          priceMode: 'manual',
          receiver: hit?.supplier ? String(hit.supplier) : row?.receiver,
        })
      } else {
        patchNew(key, {
          productName: name,
          codeNumber: code,
          remarkPrefix: computePrefix(name),
          specification: spec,
          type: cat || row?.type || '',
          supplier: hit?.supplier ? String(hit.supplier) : (row?.supplier || ''),
          stockOptions: priceList || [],
          price: '',
          priceMode: 'batch', // 出货：显示价格下拉（无库存显示「暂无库存价格」+ 手动输入选项，对齐旧系统）
          receiver: parseFloat(row?.inQty || '0') > 0 && hit?.supplier ? String(hit.supplier) : row?.receiver,
        })
      }
    } catch { /* ignore */ }
  }
  /** 编辑行：按货品种类（第一次新增创建货品保存的资料）自动回填 —— 与新增行 onPickProduct/onPickCode 同一套逻辑：
   *  编号、规格、类型、供应商；进货 → 抓取货品默认单价（无则 0.00）并把收货单位锁为供应商；
   *  出货 → 清空单价进入价格批次下拉模式，并按出货数量加载价格+库存选项 */
  const applyProductToEdit = async (id: number, hit: any, name: string, code: string) => {
    const draft = editDrafts[id] || {}
    let cat = String(hit.category || '')
    if (cat === 'Drinks' || (cat && cat.toLowerCase() === 'service line')) cat = 'Service Line'
    const sup = hit.supplier ? String(hit.supplier) : ''
    const outQ = parseFloat(draft.outQuantity || '0') || 0
    const inQ = parseFloat(draft.inQuantity || '0') || 0
    const patch: Record<string, string> = {
      productName: name,
      codeNumber: code,
      specification: hit.specification ? String(hit.specification) : (draft.specification || ''),
      type: cat || draft.type || '',
      supplier: sup,
    }
    if (inQ > 0) {
      // 进货：单价抓取货品种类默认单价（8/23 同款），收货单位自动填入供应商（锁死）
      const dp = await fetchDefaultPrice(name, code || undefined)
      patch.price = dp !== null ? dp : '0.00'
      patch.priceMode = 'manual'
      if (sup) patch.receiver = sup
    } else if (outQ > 0) {
      // 出货：切换货品后旧单价失效 → 清空进入价格批次下拉（无库存显示「暂无库存价格」+ 手动输入）
      patch.price = ''
      patch.priceMode = 'batch'
      try {
        const list = await getPriceStock(name, code || undefined, outQ, system)
        setEditPriceOptions(prev => ({ ...prev, [id]: list || [] }))
      } catch { setEditPriceOptions(prev => ({ ...prev, [id]: [] })) }
    }
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }
  /** 编辑模式：选择货品 → 按货品种类自动回填（对齐新增行 onPickProduct） */
  const onEditPickProduct = async (id: number, name: string) => {
    if (!name) return
    try {
      const list = await getProducts()
      const hit = (list || []).find((p: any) => p.product_name === name)
      if (!hit) return
      await applyProductToEdit(id, hit, name, hit.product_code || (editDrafts[id] || {}).codeNumber || '')
    } catch { /* ignore */ }
  }
  /** 编辑模式：选择编号 → 按货品种类自动回填货品名及全部关联资料（对齐新增行 onPickCode） */
  const onEditPickCode = async (id: number, code: string) => {
    if (!code) return
    try {
      const list = await getProducts()
      const hit = (list || []).find((p: any) => String(p.product_code || '').toUpperCase() === String(code).toUpperCase())
      if (!hit?.product_name) return
      await applyProductToEdit(id, hit, String(hit.product_name), code)
    } catch { /* ignore */ }
  }
  /** 编辑行：进货数量变化 → 单价自动抓取：优先货品种类默认单价，无则回退 HIFO 最高单价 */
  const handleEditInQty = async (id: number, v: string) => {
    const draft = editDrafts[id] || {}
    setEditDrafts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        inQuantity: v,
        outQuantity: parseFloat(v) > 0 ? '0' : prev[id].outQuantity,
        // 进货 → 收货单位（供应商列）自动填入货品供应商（对齐新增行 handleInQty）
        receiver: parseFloat(v) > 0 && prev[id].supplier ? prev[id].supplier : prev[id].receiver,
      },
    }))
    if (draft.productName && parseFloat(v) > 0) {
      const dp = await fetchDefaultPrice(draft.productName, draft.codeNumber || undefined)
      setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], price: dp !== null ? dp : '0.00' } }))
    }
  }
  /** HIFO 拆行（对齐 hifoAutoSplit） */
  /** 进货默认单价：优先货品种类里维护的 price，无则返回 null（回退 HIFO 最高单价） */
  const fetchDefaultPrice = async (productName: string, codeNumber?: string): Promise<string | null> => {
    try {
      const dp = await getProductDefaultPrice(productName, codeNumber)
      // 单价 0 也是合法单价（RM0 货品需要记录）
      if (dp !== null && dp !== undefined && Number(dp) >= 0) return String(dp)
    } catch { /* ignore */ }
    return null
  }
  /** 进货数量变化（互斥 + 单价自动抓取：货品种类有单价则抓取，无单价则 0.00） */
  /** 编辑行：出货数量变化 → 互斥 + 按该数量重新加载价格+库存选项（对齐新增行 handleOutQty，不拆行） */
  const handleEditOutQty = (id: number, v: string) => {
    const draft = editDrafts[id] || {}
    setEditDrafts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        outQuantity: v,
        inQuantity: parseFloat(v) > 0 ? '0' : prev[id].inQuantity,
        priceMode: parseFloat(v) > 0 ? 'batch' : prev[id].priceMode,
      },
    }))
    if (draft.productName && parseFloat(v) > 0) {
      getPriceStock(draft.productName, draft.codeNumber || undefined, parseFloat(v), system)
        .then((list) => { if (list && list.length) setEditPriceOptions(prev => ({ ...prev, [id]: list })) })
        .catch(() => {})
    }
  }
  const handleInQty = async (key: string, v: string) => {
    const row = newRows.find(r => r.key === key)
    patchNew(key, {
      inQty: v,
      outQty: parseFloat(v) > 0 ? '0' : row?.outQty || '',
      // 中央进货：收货单位默认中央（对齐旧系统）
      target: system === 'central' && parseFloat(v) > 0 ? 'central' : row?.target || '',
      // 明确进货 → 自动填入货品供应商（锁死）
      receiver: parseFloat(v) > 0 && row?.supplier ? row.supplier : row?.receiver,
    })
    // 进货数量变化 → 单价自动抓取（所有系统生效）：有单价用货品种类单价，无单价显示 0.00
    if (row && row.productName && parseFloat(v) > 0) {
      const dp = await fetchDefaultPrice(row.productName, row.codeNumber || undefined)
      patchNew(key, { price: dp !== null ? dp : '0.00', priceMode: 'manual' })
    }
  }
  const handleOutQty = async (key: string, v: string) => {
    const row = newRows.find(r => r.key === key)
    patchNew(key, {
      outQty: v,
      inQty: parseFloat(v) > 0 ? '0' : row?.inQty || '',
      // 中央出货数量为 0（含进货行）→ 收货单位锁死为中央（对齐旧系统 handleNewRowOutQuantityChange）
      target: system === 'central' ? (parseFloat(v) > 0 ? (row?.target || '') : 'central') : row?.target || '',
      // 出货 → 价格下拉模式（无库存显示「暂无库存价格」+ 手动输入选项，对齐旧系统）
      priceMode: parseFloat(v) > 0 ? 'batch' : row?.priceMode || 'manual',
    })
    // 出库数量变化 → 用该数量重新加载价格+库存列表（对齐旧系统 loadNewRowProductPricesWithStock，所有系统生效）
    if (row && row.productName && parseFloat(v) > 0) {
      getPriceStock(row.productName, row.codeNumber || undefined, parseFloat(v), system)
        .then((list) => { if (list && list.length) patchNew(key, { stockOptions: list }) })
        .catch(() => {})
    }
    if (!row || parseFloat(v) <= 0) return
    if (!row.productName) return
    setNewRows(prev => prev.filter(r => !(r.hifoBase === key)))
    const outQty = parseFloat(v) || 0
    try {
      const batches = await getPriceBatches(row.productName, row.codeNumber || undefined, system)
      if (!batches || batches.length === 0) return
      const totalStock = batches.reduce((s, b) => s + b.available_stock, 0)
      if (outQty > totalStock) {
        showMsg(`总库存不足！需要 ${outQty}，可用 ${totalStock.toFixed(3)}`, 'error'); return
      }
      if (batches[0].available_stock >= outQty) {
        patchNew(key, { price: batches[0].price, priceMode: 'batch' }); return
      }
      let remaining = outQty
      const splitRows: { key: string; price: string; qty: string }[] = []
      for (let i = 0; i < batches.length && remaining > 0; i++) {
        const b = batches[i]
        const deduct = Math.min(remaining, b.available_stock)
        remaining = Math.round((remaining - deduct) * 1000) / 1000
        if (i === 0) patchNew(key, { outQty: String(deduct), price: b.price, priceMode: 'batch' })
        else splitRows.push({ key: 'new-' + Date.now() + '-' + (newRowCounter.current++), price: b.price, qty: String(deduct) })
      }
      if (splitRows.length > 0) {
        const base = row
        setNewRows(prev => {
          const idx = prev.findIndex(r => r.key === key)
          const next = [...prev]
          next.splice(idx + 1, 0, ...splitRows.map(sr => ({
            ...base, key: sr.key, outQty: sr.qty, price: sr.price, priceMode: 'batch' as string, inQty: '0', hifoBase: key,
          })))
          return next
        })
        showMsg(`已自动拆分为 ${splitRows.length + 1} 行（HIFO 最高价先出）`, 'success')
      }
    } catch { /* ignore */ }
  }
  /** 批量保存新增行（对齐 batchSaveNewRows） */
  const saveNewRows = async () => {
    if (saving) return // 防连点/重复提交
    if (newRows.length === 0) { showMsg('没有需要保存的新记录', 'info'); return }
    setSaving(true)
    try {
      // ====== 校验（对齐旧系统 batchSaveNewRows）======
      // 完全空行跳过；有内容的行必须：货品/规格/收货人齐全、数量非负且至少一项>0、
      // 货品与编号必须存在于货品种类、中央出货必须选择目标单位、单价合法
      const valid: NewRow[] = []
      for (const row of newRows) {
        const inQ0 = parseFloat(row.inQty || '0') || 0
        const outQ0 = parseFloat(row.outQty || '0') || 0
        const priceStr0 = (row.price ?? '').toString().trim()
        const completelyEmpty = !row.productName && inQ0 === 0 && outQ0 === 0 && !row.specification && !row.receiver
          && priceStr0 === '' && !row.remark && !row.remarkChecked
        if (completelyEmpty) continue
        if (!row.productName || !row.specification || !row.receiver) {
          showMsg('请确保所有行都填写了货品名称、规格单位和收货人', 'error'); return
        }
        if (inQ0 < 0 || outQ0 < 0) { showMsg('行记录中存在负数数量', 'error'); return }
        if (inQ0 <= 0 && outQ0 <= 0) { showMsg('每行记录必须至少填入一项进货或出货数量', 'error'); return }
        // 下拉可手输，防手输不存在的货品/编号（对齐旧系统 saveNewRecord 存在性校验）
        if (productOptions.length > 0 && !productOptions.some(o => o.value === row.productName)) {
          showMsg('货品名称不存在，请从下拉列表中选择有效的货品', 'error'); return
        }
        if (row.codeNumber && codeOptions.length > 0 && !codeOptions.some(o => o.value === row.codeNumber)) {
          showMsg('货品编号不存在，请从下拉列表中选择有效的编号', 'error'); return
        }
        if (outQ0 > 0 && system === 'central' && !row.target) {
          showMsg('当有出库数量时，请选择目标系统（J1、J2或J3）', 'error'); return
        }
        if (priceStr0 === '' || isNaN(parseFloat(priceStr0)) || parseFloat(priceStr0) < 0) {
          showMsg(`货品 [${row.productName}] 单价不能为空且不能小于0`, 'error'); return
        }
        valid.push(row)
      }
      if (valid.length === 0) { showMsg('没有需要保存的新记录', 'info'); return }
      // 8/23 修复：库存校验已由后端在事务内完成，前端不再逐个请求 getPriceStock，
      // 避免保存时产生大量请求（请求风暴）。
      // 备注码查询缓存（同一产品只查一次，避免重复请求）
      const remarkCodesCache = new Map<string, string[]>()
      const savedIds: number[] = []
      for (const row of valid) {
        const inQ = parseFloat(row.inQty || '0') || 0
        const outQ = parseFloat(row.outQty || '0') || 0
        const isIncoming = inQ > 0
        const isOutgoing = outQ > 0
        // 验证单价：不能为空且不能小于0（对齐旧系统 saveNewRowRecord；0 合法，RM0 需要记录）
        const priceStr = (row.price ?? '').toString().trim()
        if (priceStr === '' || isNaN(parseFloat(priceStr)) || parseFloat(priceStr) < 0) {
          showMsg(`货品 [${row.productName}] 单价不能为空且不能小于0`, 'error'); return
        }
        // 备注编号（对齐旧系统：前缀-编号 拼接）——前缀和编号都填写才算完整编号，否则视为未填写（触发自动生成）
        const remarkNumber = row.remarkChecked && row.remarkPrefix && row.remarkSuffix
          ? `${row.remarkPrefix.toUpperCase()}-${row.remarkSuffix.toUpperCase()}` : undefined
        // 出货备注校验（8/23 修复：仅 Central 系统有在库备注码；同一产品只查询一次）
        if (isOutgoing && row.productName && system === 'central') {
          let codes = remarkCodesCache.get(row.productName)
          if (codes === undefined) {
            codes = (await getRemarkCodes(row.productName)) || []
            remarkCodesCache.set(row.productName, codes)
          }
          if (codes.length > 0) {
            if (!remarkNumber) {
              showMsg(`货品 [${row.productName}] 有备注编码在库，出货时请填写备注编号`, 'error'); return
            }
            if (!codes.includes(remarkNumber)) {
              showMsg(`备注编号 [${remarkNumber}] 不在库中，有效编号：${codes.slice(0, 5).join(', ')}`, 'error'); return
            }
          }
        }
        const created = await createStockInout({
          date: row.date || undefined,
          time: new Date().toTimeString().slice(0, 5), // 对齐旧系统：保存时取当前时间（time 非空）
          productName: row.productName, codeNumber: row.codeNumber || undefined,
          inQuantity: inQ || undefined,
          outQuantity: outQ || undefined,
          specification: row.specification || undefined,
          price: row.price !== '' ? Number(row.price) : undefined,
          receiver: row.receiver || undefined, remark: row.remark || undefined, type: row.type || undefined,
          productRemarkChecked: row.remarkChecked,
          remarkNumber,
          // 进货 + 勾选备注 → 由后端自动生成编号（对齐旧系统 needGenerateCode）
          needGenerateCode: isIncoming && row.remarkChecked && !remarkNumber ? true : undefined,
          prefix: isIncoming && row.remarkChecked ? (row.remarkPrefix || computePrefix(row.productName)) : undefined,
          targetSystem: system === 'central' ? (row.target || undefined) : system,
          createdBy: currentUser || undefined,
        }, system === 'central' ? 'central' : system)
        if (created?.id) savedIds.push(Number(created.id))
      }
      setNewRows([])
      const items = await load(page)
      setTimeout(() => {
        if (savedIds.length) {
          const idx = items.findIndex((r: StockInout) => savedIds.includes(Number(r.id)))
          if (idx >= 0) {
            const top = Math.max(0, idx * ROW_HEIGHT - 60)
            if (scrollRef.current) scrollRef.current.scrollTop = top
            setScrollTop(top)
            flash(String(savedIds[0]))
          }
        }
      }, 100)
      showMsg(`成功保存 ${valid.length} 条记录`)
    } catch (e: any) { showMsg(e?.response?.data?.message || e?.message || '保存失败', 'error') }
    finally { setSaving(false) }
  }
  const removeNew = (key: string) => setNewRows(prev => prev.filter(r => r.key !== key))

  // ---- 编辑（支持多行同时编辑：每行独立草稿/价格选项） ----
  const cancelEdit = (id: number) => {
    setEditingIds(prev => { const n = new Set(prev); n.delete(id); return n })
    setEditDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
    setEditPriceOptions(prev => { const n = { ...prev }; delete n[id]; return n })
  }
  const startEdit = (r: StockInout) => {
    const id = Number(r.id)
    if (editingIds.has(id)) return // 已在编辑中
    const isOut = parseFloat(String(r.outQuantity ?? 0)) > 0
    const draft: Record<string, string> = {
      date: String(r.date || ''), time: String(r.time || ''), codeNumber: String(r.codeNumber || ''), productName: String(r.productName || ''),
      inQuantity: String(r.inQuantity ?? ''), outQuantity: String(r.outQuantity ?? ''), specification: String(r.specification || ''),
      price: String(r.price ?? ''), receiver: String(r.receiver || ''), remark: String(r.remark || ''), type: String(r.type || ''),
      targetSystem: String(r.targetSystem || ''), remarkNumber: String(r.remarkNumber || ''), productRemarkChecked: r.productRemarkChecked ? '1' : '0',
      // 出库行先按批量价格模式，价格选项加载后按是否匹配修正（匹配→batch 下拉；否则→manual 输入框显示手输价）
      priceMode: isOut ? 'batch' : 'manual',
    }
    setEditingIds(prev => new Set(prev).add(id))
    setEditDrafts(prev => ({ ...prev, [id]: draft }))
    // 编辑模式下出库：加载 HIFO 价格批次（对齐 createNewRowPriceSelectWithStock）
    if (isOut && r.productName) {
      getPriceStock(r.productName, r.codeNumber || undefined, 1, system)
        .then((list) => {
          const l = list || []
          setEditPriceOptions(prev => ({ ...prev, [id]: l }))
          setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], priceMode: l.some(p => parseFloat(String(p.price)) === parseFloat(String(prev[id].price))) ? 'batch' : 'manual' } }))
        })
        .catch(() => setEditPriceOptions(prev => ({ ...prev, [id]: [] })))
    } else {
      setEditPriceOptions(prev => ({ ...prev, [id]: [] }))
    }
  }
  /** 保存单行编辑（无防连点守卫，供 saveEdit / saveAllEdits 调用） */
  const doSaveEdit = async (id: number) => {
    const editDraft = editDrafts[id]
    if (!editDraft) return
    try {
      const outQ = parseFloat(editDraft.outQuantity || '0') || 0
      // 验证单价：不能为空且不能小于0（对齐旧系统；0 合法，RM0 需要记录）
      const editPriceStr = (editDraft.price ?? '').toString().trim()
      if (editPriceStr === '' || isNaN(parseFloat(editPriceStr)) || parseFloat(editPriceStr) < 0) {
        showMsg('单价不能为空且不能小于0', 'error'); return
      }
      // 货品备注校验（对齐旧系统 saveRecord：勾选货品备注时必须填写备注编号）
      // 放宽：进货记录编辑补勾选（当初漏勾/漏填）时编号留空 → 传 needGenerateCode 由后端自动生码
      // 编号展示拆为 前缀-后缀，仅前缀无后缀（如 "AB-"）视为待自动生成
      const rnRaw = (editDraft.remarkNumber || '').trim()
      const dashIdx = rnRaw.indexOf('-')
      const suffixPart = dashIdx >= 0 ? rnRaw.slice(dashIdx + 1).trim() : rnRaw
      const editIsIncoming = (parseFloat(editDraft.inQuantity || '0') || 0) > 0
      const needGenCode = editIsIncoming && editDraft.productRemarkChecked === '1' && !suffixPart
      if (editDraft.productRemarkChecked === '1' && !suffixPart && !needGenCode) {
        showMsg('货品备注已勾选时，请填写完整备注编号（前缀-编号）', 'error'); return
      }
      // 原记录的备注编号（用于判断是否保持原编号；保持时跳过「在库」校验——
      // 该编号可能已被本记录自身消耗，对齐后端 updateInout 与旧系统编辑行为）
      const origRow = rows.find(r => Number(r.id) === id)
      const origRemark = origRow ? String(origRow.remarkNumber || '').trim().toUpperCase() : ''
      // 出货备注校验（8/23 修复：仅 Central 系统有在库备注码，分店查 central 表无意义）
      if (outQ > 0 && editDraft.productName && system === 'central') {
        const codes = await getRemarkCodes(editDraft.productName)
        const rn = (editDraft.remarkNumber || '').trim().toUpperCase()
        if ((codes || []).length > 0) {
          if (!rn) {
            // 编号为空：原记录已有编号则保留（不拦截）；否则要求填写
            if (!origRemark) {
              showMsg(`货品 [${editDraft.productName}] 有备注编码在库，出货时请填写备注编号`, 'error'); return
            }
          } else if (rn !== origRemark && !codes.includes(rn)) {
            showMsg(`备注编号 [${rn}] 不在库中，有效编号：${codes.slice(0, 5).join(', ')}`, 'error'); return
          }
        }
      }
      // ====== 数量/存在性/目标单位校验（对齐旧系统 saveRecord）======
      const inQ = parseFloat(editDraft.inQuantity || '0') || 0
      if (inQ < 0 || outQ < 0) { showMsg('数量不能为负数', 'error'); return }
      if (inQ <= 0 && outQ <= 0) { showMsg('进货或出货数量必须至少填入一项大于 0', 'error'); return }
      if (editDraft.productName && productOptions.length > 0 && !productOptions.some(o => o.value === editDraft.productName)) {
        showMsg('货品名称不存在，请从下拉列表中选择有效的货品', 'error'); return
      }
      if (editDraft.codeNumber && codeOptions.length > 0 && !codeOptions.some(o => o.value === editDraft.codeNumber)) {
        showMsg('货品编号不存在，请从下拉列表中选择有效的编号', 'error'); return
      }
      if (outQ > 0 && system === 'central' && !(editDraft.targetSystem || '').trim()) {
        showMsg('当有出库数量时，请选择目标系统（J1、J2或J3）', 'error'); return
      }
      // 编辑出货库存校验（对齐旧系统 saveRecord）：可用库存 = 现有库存 + 原本该记录的出库数量
      // （仅当货品名称和价格都未变时才归还原出库数量；RM0 单价出货跳过校验，对齐旧系统）
      if (outQ > 0 && parseFloat(editDraft.price) > 0 && editDraft.productName) {
        try {
          const batches = await getPriceBatches(editDraft.productName, editDraft.codeNumber || undefined, system)
          const totalStock = (batches || []).reduce((s, b) => s + b.available_stock, 0)
          const sameProductPrice = !!origRow && origRow.productName === editDraft.productName
            && parseFloat(String(origRow.price ?? 0)) === parseFloat(editDraft.price)
          const actualAvailable = totalStock + (sameProductPrice ? (parseFloat(String(origRow!.outQuantity ?? 0)) || 0) : 0)
          if (outQ > actualAvailable) {
            showMsg(['j1', 'j2', 'j3'].includes(system)
              ? '库存显示不足'
              : `库存不足！当前可用库存 (修改前): ${actualAvailable}，请求修改为出库: ${outQ}`, 'error'); return
          }
        } catch { /* 库存查询失败不拦截保存，避免误拦 */ }
      }
      await updateStockInout(id, {
        date: editDraft.date || undefined,
        time: editDraft.time || new Date().toTimeString().slice(0, 5), // time 非空（jXstockedit_data 表 time NOT NULL）
        codeNumber: editDraft.codeNumber || undefined,
        productName: editDraft.productName, inQuantity: editDraft.inQuantity !== '' ? Number(editDraft.inQuantity) : undefined,
        outQuantity: editDraft.outQuantity !== '' ? Number(editDraft.outQuantity) : undefined,
        specification: editDraft.specification || undefined, price: editDraft.price !== '' ? Number(editDraft.price) : undefined,
        receiver: editDraft.receiver || undefined, remark: editDraft.remark || undefined,
        type: editDraft.type || undefined, remarkNumber: needGenCode ? undefined : (editDraft.remarkNumber || undefined),
        needGenerateCode: needGenCode || undefined,
        // 出货可改目标单位；进货/无出货 → 锁死中央（对齐新行与旧系统）
        targetSystem: outQ > 0 ? (editDraft.targetSystem || undefined) : 'central',
        productRemarkChecked: editDraft.productRemarkChecked === '1',
      }, system === 'central' ? undefined : system)
      setEditingIds(prev => { const n = new Set(prev); n.delete(id); return n })
      setEditDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
      setEditPriceOptions(prev => { const n = { ...prev }; delete n[id]; return n })
      load(page); showMsg('记录更新成功')
    } catch (e: any) { showMsg(e?.response?.data?.message || e?.message || '保存失败', 'error') }
  }
  /** 保存单行（带防连点守卫，供行内保存按钮使用） */
  const saveEdit = async (id: number) => {
    if (saving) return
    if (!editDrafts[id]) return
    setSaving(true)
    try { await doSaveEdit(id) } finally { setSaving(false) }
  }
  /** 保存全部编辑中行（Ctrl+S，逐行调用；任一行校验失败只拦截该行，不影响其他行） */
  const saveAllEdits = async () => {
    if (saving || editingIds.size === 0) return
    setSaving(true)
    try { for (const id of Array.from(editingIds)) await doSaveEdit(id) } finally { setSaving(false) }
  }
  const remove = async (r: StockInout) => {
    if (!window.confirm(`确定删除记录：${r.productName}（${r.date}）？`)) return
    try {
      await deleteStockInout(Number(r.id), currentUser || 'demo', system === 'central' ? undefined : system)
      load(page); showMsg('已删除')
      showUndoBar([Number(r.id)])
    } catch { showMsg('删除失败', 'error') }
  }

  // ---- 删除撤销（对齐旧系统 undoDelete / showUndoBar：删除后 10 秒内可撤销） ----
  const hideUndoBar = () => {
    if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null }
    setUndo(null)
  }
  const showUndoBar = (ids: number[]) => {
    if (!ids.length) return
    setUndo({ ids, count: ids.length })
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), 10000)
  }
  const undoDelete = async () => {
    if (!undo || undo.ids.length === 0) return
    try {
      await restoreStockInout(undo.ids, system === 'central' ? undefined : system)
      hideUndoBar()
      load(page)
      showMsg(`已撤销删除 ${undo.count} 条记录`)
    } catch { showMsg('撤销失败', 'error') }
  }

  // ---- 批量删除 ----
  const toggleBatch = () => { setBatchMode(!batchMode); setSelected(new Set()) }

  // ---- 货品进出货统计（弹窗）：货品名 100% 精确匹配（对齐 kunzztest 货品统计做法） ----
  const openCheck = () => {
    setCheckForm({ name: '', start: dateRange.start || fmtDate(new Date()), end: dateRange.end || fmtDate(new Date()) })
    setCheckResult(null)
    setCheckOpen(true)
  }
  const doCheck = async () => {
    const name = (checkForm.name || '').trim()
    if (!name) { showMsg('请输入货品名称', 'error'); return }
    if (!checkForm.start || !checkForm.end) { showMsg('请选择开始和结束日期', 'error'); return }
    if (checkForm.start > checkForm.end) { showMsg('开始日期不能晚于结束日期', 'error'); return }
    setCheckLoading(true)
    try {
      const r = await checkStockInout({
        productName: name,
        startDate: checkForm.start,
        endDate: checkForm.end,
        system: system === 'central' ? 'central' : system,
      })
      setCheckResult(r)
    } catch (e: any) { showMsg(e?.response?.data?.message || e?.message || '查询失败', 'error') }
    setCheckLoading(false)
  }
  const confirmBatchDelete = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`确定删除选中的 ${selected.size} 条记录？`)) return
    try {
      const ids = [...selected]
      for (const id of ids) await deleteStockInout(id, currentUser || 'demo', system === 'central' ? undefined : system)
      setBatchMode(false); setSelected(new Set()); load(page)
      showMsg(`已删除 ${ids.length} 条记录`)
      showUndoBar(ids)
    } catch { showMsg('批量删除失败', 'error') }
  }

  // ---- 导出（对齐 export-modal） ----
  const openExport = () => {
    const t = fmtDate(new Date())
    setExportForm({ start: t, end: t, system: system === 'central' ? '' : system, invoiceDate: t, invoiceSuffix: '', includeIn: true, includeOut: true })
    setExportOpen(true)
  }
  const doExport = async () => {
    // 兼容 DD/MM/YYYY 与 YYYY-MM-DD 两种格式（openExport 默认填 YYYY-MM-DD）
    const dmy = (v: string) => {
      const s = v.trim()
      const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) // DD/MM/YYYY
      if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
      const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/) // YYYY-MM-DD
      if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
      return ''
    }
    if (!exportForm.start || !exportForm.end) { showMsg('请选择开始和结束日期', 'error'); return }
    if (system === 'central' && !exportForm.system) { showMsg('请选择店面', 'error'); return }
    if (system === 'central' && !/^\d{3}$/.test(exportForm.invoiceSuffix)) {
      showMsg('发票号码后三位必填（三位数字，如 001）', 'error'); return
    }
    const sd = dmy(exportForm.start)
    const ed = dmy(exportForm.end)
    if (!sd || !ed) { showMsg('日期格式需为 DD/MM/YYYY', 'error'); return }
    try {
      if (system === 'central') {
        // 中央 → invoice PDF（对齐旧系统 confirmExport：出库数据 + 发票模板）
        const target = exportForm.system
        if (!(window as any).PDFLib) { showMsg('PDF 库未加载', 'error'); return }
        const invoiceNumber = generateInvoiceNumber(target, exportForm.invoiceDate || ed, exportForm.invoiceSuffix)
        const rows = await getInvoiceData(target, sd, ed)
        await generateInvoicePdf(rows as any[], sd, ed, target, invoiceNumber, exportForm.invoiceDate || ed)
      } else {
        // 分店 → PDF（对齐旧系统 export_branch_stock_excel.php 内容：jXstockinout_data 入库，8 列）
        const blob = await exportBranchExcel(system, sd, ed)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = system.toUpperCase() + '_stock_' + sd.replace(/-/g, '') + '_to_' + ed.replace(/-/g, '') + '.pdf'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
      setExportOpen(false)
      showMsg(system === 'central' ? 'PDF 发票生成成功' : 'Excel 导出成功')
    } catch { /* 拦截器已提示 */ }
  }

  return (
    <div className="sio-root">
      <div className="container">
        <div className="header">
          <div><h1>进出货 - {SYSTEMS.find(s => s.key === system)?.label}</h1></div>
          <div className="controls">
            <div className="mobile-selector" style={{ display: system === 'central' ? 'none' : 'inline-flex' }}>
              <a className="selector-button" href={`/m/inout?system=${system}`}
                onClick={(e) => { e.preventDefault(); navigate(`/m/inout?system=${system}`) }}>手机版</a>
            </div>
            <div className="view-selector">
              <button className="selector-button" onClick={() => setViewOpen(!viewOpen)}>
                <span id="current-view">进出货</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className={'selector-dropdown' + (viewOpen ? ' show' : '')}>
                {Object.entries(VIEW_NAMES).map(([k, v]) => (
                  <div key={k} className={'dropdown-item' + (k === 'records' ? ' active' : '')}
                    onClick={() => { setViewOpen(false); if (k === 'list') navigate('/records?system=' + system); else if (k === 'remark') navigate('/remark'); else if (k === 'product') navigate('/products'); else if (k === 'sot') navigate('/sot') }}>{v}</div>
                ))}
              </div>
            </div>
            <div className="system-selector">
              <button className="selector-button" onClick={() => setSysOpen(!sysOpen)}>
                <span id="current-system">{SYSTEMS.find(s => s.key === system)?.label}</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className={'selector-dropdown' + (sysOpen ? ' show' : '')}>
                {SYSTEMS.map(s => (
                  <div key={s.key} className={'dropdown-item' + (s.key === system ? ' active' : '')}
                    onClick={() => {
                      setSysOpen(false); setSystem(s.key); setPage(0); setNewRows([])
                      // 同步 URL，刷新后保持所选分店（对齐旧系统 ?system=jX）
                      const base = window.location.pathname.split('?')[0]
                      window.history.replaceState(null, '', s.key === 'central' ? base : base + '?system=' + s.key)
                    }}>{s.label}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* unified-header-row（对齐 stockeditall.php） */}
        <div className="unified-header-row">
          <div className="date-controls">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label className="date-label">日期范围</label>
              <div className="date-range-picker" ref={datePickerRef} onClick={openCalendar}>
                <i className="fas fa-calendar-alt"></i>
                <span>{dateRange.start && dateRange.end ? `${fmtCN(dateRange.start)} - ${fmtCN(dateRange.end)}` : '选择日期范围'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label className="date-label-with-icon"><i className="fas fa-clock" style={{ color: '#000' }} /> 快速选择</label>
              <div className="dropdown quick-dropdown">
                <button className="btn btn-secondary dropdown-toggle" onClick={() => setQuickOpen(!quickOpen)}>
                  <i className="fas fa-calendar-alt" /> {quickLabel || '时段'} <i className="fas fa-chevron-down" />
                </button>
                {quickOpen && (
                  <div className="dropdown-menu" style={{ left: 0, right: 'auto' }}>
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
              <div className={'smartSearchWrapper' + (searchExpanded ? ' expanded' : '')}
                onClick={(e) => { e.stopPropagation(); setSearchExpanded(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}>
                {/* 左侧图标即搜索模式切换：放大镜=模糊（含关键字全部匹配）/ 等号=精确（产品名完全等于关键字）；点击同时展开输入框 */}
                <span className="smartSearch-icon"
                  title={exactMatch ? '精确搜索：只显示产品名完全等于关键字的记录（点击切换为模糊）' : '模糊搜索：显示所有包含关键字的记录（点击切换为精确）'}
                  onClick={(e) => { e.stopPropagation(); setExactMatch(!exactMatch); setPage(0); setSearchExpanded(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}>
                  <i className={'fas ' + (exactMatch ? 'fa-equals' : 'fa-search')} style={{ color: exactMatch ? '#ff7b00' : '#9ca3af' }} />
                </span>
                <input ref={searchInputRef} type="text" className="smartSearch-input" placeholder="输入关键字搜索..." value={kw}
                  onChange={(e) => onSearchInput(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-success" onClick={showDateRowsModal}><i className="fas fa-plus" /> 新增记录</button>
            <button className="btn btn-secondary" onClick={openCheck} title="按货品名称统计进出货"><i className="fas fa-chart-bar" /> 货品统计</button>
            <button className="btn btn-warning" onClick={openExport}><i className="fas fa-download" /> 导出数据</button>
            <div className="batch-actions" style={{ display: 'flex', gap: 8 }}>
              {newRows.length >= 2 && (
                <button className="btn btn-primary" onClick={saveNewRows} disabled={saving}>
                  {saving ? <><i className="fas fa-spinner fa-spin"></i> 保存中...</> : <><i className="fas fa-save" /> 批量保存 ({newRows.length})</>}
                </button>
              )}
              <button className={'btn ' + (batchMode ? 'btn-secondary' : 'btn-danger')} onClick={toggleBatch}>
                <i className="fas fa-trash-alt" /> {batchMode ? '取消批量' : '批量删除'}
              </button>
              {batchMode && (
                <button className="btn btn-success" disabled={selected.size === 0} onClick={confirmBatchDelete}><i className="fas fa-check" /> 确认删除 ({selected.size})</button>
              )}
              {batchMode && (
                <button className="btn btn-secondary" onClick={toggleBatch}><i className="fas fa-times" /> 取消</button>
              )}
            </div>
            <div className="header-stats">
              <span>总记录数: <span className="stat-value">{total}</span></span>
            </div>
          </div>
        </div>

        {/* 库存表格（16 列中文表头，对齐 stockeditall.php） */}
        <div className="table-container">
          <div className="table-scroll-container" ref={scrollRef} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
            <table className="stock-table" id="stock-table">
              {/* 全列自适应：按百分比锁列宽（不横向滚动）；小屏字体经 clamp 自动缩小 */}
              <colgroup>
                <col style={{ width: '7%' }} /><col style={{ width: '7%' }} /><col style={{ width: '11%' }} />
                <col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '7%' }} />
                <col style={{ width: '6%' }} /><col style={{ width: '7%' }} /><col style={{ width: '7%' }} />
                <col style={{ width: '5%' }} /><col style={{ width: '5%' }} /><col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} /><col style={{ width: '9%' }} /><col style={{ width: '4%' }} /><col style={{ width: '5%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ minWidth: 100 }}>日期</th>
                  <th style={{ minWidth: 100 }}>货品编号</th>
                  <th className="product-name-col">货品</th>
                  <th style={{ minWidth: 80 }}>进货</th>
                  <th style={{ minWidth: 80 }}>出货</th>
                  <th style={{ minWidth: 100 }}>收货单位</th>
                  <th style={{ minWidth: 100 }}>规格</th>
                  <th style={{ minWidth: 100 }}>单价</th>
                  <th style={{ minWidth: 100 }}>总价</th>
                  <th style={{ minWidth: 80 }}>类型</th>
                  <th style={{ minWidth: 80 }}>货品备注</th>
                  <th style={{ minWidth: 100 }}>备注编号</th>
                  <th className="receiver-col">供应商/出货人</th>
                  <th style={{ minWidth: 100 }}>备注</th>
                  <th style={{ minWidth: 60 }}>创建人</th>
                  <th style={{ minWidth: 80 }}>{batchMode ? '选择' : '操作'}</th>
                </tr>
              </thead>
              <tbody>
                {useVirtual && virtual.spacerTop > 0 && (
                  <tr className="virtual-spacer" aria-hidden="true">
                    <td colSpan={16} style={{ height: virtual.spacerTop, padding: 0, border: 'none', lineHeight: 0 }} />
                  </tr>
                )}
                {rows.slice(useVirtual ? virtual.startIdx : 0, useVirtual ? virtual.endIdx : undefined).map((r) => {
                  const inQ = parseFloat(String(r.inQuantity ?? 0)) || 0
                  const outQ = parseFloat(String(r.outQuantity ?? 0)) || 0
                  const price = parseFloat(String(r.price ?? 0)) || 0
                  const totalV = (inQ - outQ) * price
                  const isEditing = editingIds.has(Number(r.id))
                  const editDraft = editDrafts[Number(r.id)] || {}
                  const rowPriceOptions = editPriceOptions[Number(r.id)] || []
                  // 编辑出库时：把当前价格数值匹配到价格下拉的某个 option（对齐旧系统 refreshEditPriceSelect）
                  const editPriceMatch = rowPriceOptions.find(p => parseFloat(String(p.price)) === parseFloat(String(editDraft.price)))
                  const editPriceValue = editPriceMatch ? editPriceMatch.price : editDraft.price
                  const patchEdit = (patch: Record<string, string>) => setEditDrafts(prev => ({ ...prev, [Number(r.id)]: { ...prev[Number(r.id)], ...patch } }))
                  return (
                    <tr key={r.id} className={(isEditing ? 'editing-row' : '') + (isHl(r) ? ' highlight-flash' : '')}>
                      <td>{isEditing ? <input type="date" className="table-input" value={editDraft.date || ''} onChange={(e) => patchEdit({ date: e.target.value })} /> : fmtDayAbbr(r.date)}</td>
                      <td>{isEditing
                        ? <Combobox options={codeOptions} value={editDraft.codeNumber || ''} onChange={(v) => patchEdit({ codeNumber: v })} onSelect={(v) => onEditPickCode(Number(r.id), v)} style={{ width: '100%', minWidth: 0 }} />
                        : (r.codeNumber || '-')}</td>
                      <td>{isEditing
                        ? <Combobox options={productOptions} value={editDraft.productName || ''} onChange={(v) => patchEdit({ productName: v })} onSelect={(v) => onEditPickProduct(Number(r.id), v)} style={{ width: '100%', minWidth: 0 }} />
                        : <b>{r.productName}</b>}</td>
                      <td>{isEditing
                        ? <input type="number" className="table-input" min={0} step="0.001" value={editDraft.inQuantity || ''}
                            disabled={parseFloat(editDraft.outQuantity || '0') > 0} /* 对齐旧系统 enforceQuantityMutex */
                            onChange={(e) => handleEditInQty(Number(r.id), e.target.value)} />
                        : <span style={{ color: inQ > 0 ? '#10b981' : '#6b7280', fontWeight: inQ > 0 ? 600 : 400 }}>{fmtNum(inQ)}</span>}</td>
                      <td>{isEditing
                        ? <input type="number" className="table-input" min={0} step="0.001" value={editDraft.outQuantity || ''}
                            disabled={parseFloat(editDraft.inQuantity || '0') > 0} /* 对齐旧系统 enforceQuantityMutex */
                            onChange={(e) => handleEditOutQty(Number(r.id), e.target.value)} />
                        : <span className={outQ > 0 ? 'negative-value' : ''}>{outQ > 0 ? fmtNum(outQ) : fmtNum(0)}</span>}</td>
                      <td>{isEditing
                        ? (system === 'central' ? (
                            <select className="table-select" value={parseFloat(editDraft.outQuantity || '0') > 0 ? (editDraft.targetSystem || '') : 'central'}
                              disabled={parseFloat(editDraft.outQuantity || '0') <= 0}
                              onChange={(e) => patchEdit({ targetSystem: e.target.value })}>
                              <option value="">请选择</option>
                              <option value="j1">J1</option><option value="j2">J2</option><option value="j3">J3</option><option value="central">中央</option>
                            </select>
                          ) : <span>{system.toUpperCase()}</span>)
                        : (r.targetSystem ? r.targetSystem.toUpperCase() : '-')}</td>
                      <td>{isEditing
                        ? <select className="table-select" value={editDraft.specification || ''} onChange={(e) => patchEdit({ specification: e.target.value })}>
                            <option value="">-</option>{SPEC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        : (r.specification || '-')}</td>
                      <td>
                        <div className="currency-display">
                          <span className="currency-symbol">RM</span>
                          {isEditing && parseFloat(editDraft.outQuantity || '0') > 0 && parseFloat(editDraft.inQuantity || '0') === 0 && editDraft.priceMode !== 'manual' ? (
                            <select className="table-select" style={{ width: '100%' }} value={editPriceValue}
                              onChange={(e) => patchEdit({ price: e.target.value === 'manual' ? '' : e.target.value, priceMode: e.target.value === 'manual' ? 'manual' : 'batch' })}>
                              {/* 对齐旧系统：显示所有价格选项，库存不足的标注 (库存:X, 不足)；无库存显示「暂无库存价格」+ 手动输入 */}
                              <option value="">{rowPriceOptions.length ? '请选择价格' : '暂无库存价格'}</option>
                              <option value="manual">手动输入价格</option>
                              {rowPriceOptions.map(p => {
                                const enough = (parseFloat(editDraft.outQuantity || '0') || 0) <= 0 || p.available_stock >= (parseFloat(editDraft.outQuantity || '0') || 0)
                                return <option key={p.price} value={p.price}>{Number(p.price).toFixed(3)} (库存:{p.available_stock}{enough ? '' : ', 不足'})</option>
                              })}
                            </select>
                          ) : isEditing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'wrap', rowGap: 2 }}>
                              <input type="number" className="table-input" style={{ flex: '1 1 auto', width: 60, minWidth: 0 }} step="0.00001" value={editDraft.price || ''} onChange={(e) => patchEdit({ price: e.target.value, priceMode: 'manual' })} />
                              {/* 无库存提示：出货且无可用价格/库存批次时，用户需自行输入价格（对齐旧系统） */}
                              {parseFloat(editDraft.outQuantity || '0') > 0 && !rowPriceOptions.length && (
                                <span title="该货品当前无库存，可自行输入价格" style={{ color: '#dc2626', fontSize: 11, whiteSpace: 'nowrap', fontWeight: 600 }}>无库存</span>
                              )}
                            </div>
                          ) : (
                            <span className="currency-amount">{renderPriceRawTip(r.price)}</span>
                          )}
                        </div>
                      </td>
                      <td className={'calculated-cell ' + (totalV < 0 ? 'negative-value negative-parentheses' : '')}>
                        <div className={'currency-display' + (totalV < 0 ? ' negative-value negative-parentheses' : '')}>
                          <span className="currency-symbol">RM</span>
                          <span className="currency-amount">{fmtMoney(Math.abs(totalV))}</span>
                        </div>
                      </td>
                      <td className="type-cell">{isEditing
                        ? <select className="table-select" value={editDraft.type || ''} onChange={(e) => patchEdit({ type: e.target.value })}>
                            <option value="">-</option>{TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        : typeLabel(r.type)}</td>
                      <td>{isEditing
                        ? <input type="checkbox" className="remark-checkbox" checked={editDraft.productRemarkChecked === '1'} onChange={(e) => patchEdit({ productRemarkChecked: e.target.checked ? '1' : '0', remarkNumber: e.target.checked && !(editDraft.remarkNumber || '').trim() ? computePrefix(editDraft.productName || '') + '-' : editDraft.remarkNumber })} />
                        : <input type="checkbox" className="remark-checkbox" checked={!!r.productRemarkChecked} disabled />}</td>
                      <td>{isEditing ? (() => {
                        // 对齐新增行展示：前缀-编号 组合框；纯进货编号禁用（placeholder 自动），由后端生码；出货可手填
                        const rn = editDraft.remarkNumber || ''
                        const dash = rn.indexOf('-')
                        const pre = dash > 0 ? rn.slice(0, dash) : rn
                        const suf = dash > 0 ? rn.slice(dash + 1) : ''
                        const checked = editDraft.productRemarkChecked === '1'
                        const hasOut = parseFloat(editDraft.outQuantity || '0') > 0
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', overflow: 'hidden', opacity: checked ? 1 : 0.5 }}>
                            <input className="table-input" style={{ width: 30, textAlign: 'center', border: 'none' }} placeholder="前缀" disabled={!checked}
                              value={pre} onChange={(e) => patchEdit({ remarkNumber: e.target.value.toUpperCase() + '-' + suf })} />
                            <span style={{ color: '#6b7280', fontWeight: 700 }}>-</span>
                            <input className="table-input" style={{ width: 42, textAlign: 'center', border: 'none', color: checked && !hasOut ? '#9ca3af' : undefined }}
                              placeholder={checked && !hasOut ? '自动' : '编号'}
                              disabled={!checked || !hasOut}
                              value={suf} onChange={(e) => patchEdit({ remarkNumber: pre + '-' + e.target.value.toUpperCase() })} />
                          </div>
                        )
                      })() : (r.remarkNumber || '-')}</td>
                      <td>{isEditing
                        ? <Combobox options={shipperOptions} value={editDraft.receiver || ''} onChange={(v) => patchEdit({ receiver: v })}
                            disabled={parseFloat(editDraft.inQuantity || '0') > 0} style={{ width: '100%', minWidth: 0 }} />
                        : (r.receiver || '-')}</td>
                      <td>{isEditing ? <input className="table-input" value={editDraft.remark || ''} onChange={(e) => patchEdit({ remark: e.target.value })} /> : (r.remark || '-')}</td>
                      <td className="created-user" title={`${r.createdBy || '-'}\n创建时间: ${r.createdAt ? String(r.createdAt).replace('T', ' ').substring(0, 19) : '-'}`}>{nickOf(r.createdBy)}</td>
                      <td>
                        {batchMode ? (
                          <input type="checkbox" className="batch-select-checkbox"
                            checked={selected.has(Number(r.id))}
                            onChange={(e) => {
                              const s = new Set(selected)
                              if (e.target.checked) s.add(Number(r.id)); else s.delete(Number(r.id))
                              setSelected(s)
                            }} />
                        ) : isEditing ? (
                          <>
                            <button className="action-btn save-btn" onClick={() => saveEdit(Number(r.id))} title={saving ? '保存中...' : '保存'} disabled={saving}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-save')} /></button>
                            <button className="action-btn delete-btn" onClick={() => cancelEdit(Number(r.id))} title="取消"><i className="fas fa-times" /></button>
                          </>
                        ) : (
                          <>
                            <button className="action-btn edit-btn" onClick={() => startEdit(r)} title="编辑"><i className="fas fa-edit" /></button>
                            <button className="action-btn delete-btn" onClick={() => remove(r)} title="删除"><i className="fas fa-trash" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {useVirtual && virtual.spacerBottom > 0 && (
                  <tr className="virtual-spacer" aria-hidden="true">
                    <td colSpan={16} style={{ height: virtual.spacerBottom, padding: 0, border: 'none', lineHeight: 0 }} />
                  </tr>
                )}
                {/* 行内新增（对齐 addNewRowWithDate）：始终追加到表格底部 */}
                {!batchMode && newRows.map((nr) => (
<tr key={nr.key} className="new-row">
                    <td><input type="date" className="table-input" value={nr.date} onChange={(e) => patchNew(nr.key, { date: e.target.value })} /></td>
                    <td><Combobox options={codeOptions} value={nr.codeNumber} placeholder="编号"
                      onChange={(v) => patchNew(nr.key, { codeNumber: v })}
                      onSelect={(v) => onPickCode(nr.key, v)} /></td>
                    <td><Combobox options={productOptions} value={nr.productName} placeholder="货品"
                      onChange={(v) => patchNew(nr.key, { productName: v })}
                      onSelect={(v) => onPickProduct(nr.key, v)} /></td>
                    <td><input type="number" className="table-input" min={0} step="0.001" placeholder="0" value={nr.inQty}
                      disabled={parseFloat(nr.outQty) > 0} /* 对齐旧系统 enforceQuantityMutex：出>0 时禁用进货 */
                      onChange={(e) => handleInQty(nr.key, e.target.value)} /></td>
                    <td><input type="number" className="table-input" min={0} step="0.001" placeholder="0" value={nr.outQty}
                      disabled={parseFloat(nr.inQty) > 0} /* 对齐旧系统 enforceQuantityMutex：进>0 时禁用出货 */
                      onChange={(e) => handleOutQty(nr.key, e.target.value)} /></td>
                    <td>
                      {system === 'central' ? (
                        <select className="table-select" value={nr.target}
                          disabled={parseFloat(nr.outQty) <= 0}
                          onChange={(e) => patchNew(nr.key, { target: e.target.value })}>
                          <option value="">请选择</option>
                          <option value="j1">J1</option><option value="j2">J2</option><option value="j3">J3</option><option value="central">中央</option>
                        </select>
                      ) : <span>{system.toUpperCase()}</span>}
                    </td>
                    <td>
                      <select className="table-select" value={nr.specification} onChange={(e) => patchNew(nr.key, { specification: e.target.value })}>
                        <option value="">请选择规格</option>{SPEC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="currency-display">
                        <span className="currency-symbol">RM</span>
                        {nr.productName && parseFloat(nr.outQty) > 0 && nr.priceMode !== 'manual' ? (
                          <select className="table-select" style={{ width: '100%' }} value={nr.price}
                            onChange={(e) => patchNew(nr.key, { price: e.target.value === 'manual' ? '' : e.target.value, priceMode: e.target.value === 'manual' ? 'manual' : 'batch' })}>
                            {/* 对齐旧系统：显示所有价格选项，不管库存是否足够；不足的标注 (库存:X, 不足)；无库存显示「暂无库存价格」+ 手动输入 */}
                            <option value="">{(nr.stockOptions || []).length ? '请选择价格' : '暂无库存价格'}</option>
                            <option value="manual">手动输入价格</option>
                            {(nr.stockOptions || []).map(p => {
                              const enough = (parseFloat(nr.outQty) || 0) <= 0 || p.available_stock >= (parseFloat(nr.outQty) || 0)
                              return <option key={p.price} value={p.price}>{Number(p.price).toFixed(3)} (库存:{p.available_stock}{enough ? '' : ', 不足'})</option>
                            })}
                          </select>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'wrap', rowGap: 2 }}>
                            <input type="number" className="table-input" style={{ flex: '1 1 auto', width: 50, minWidth: 0 }} step="0.00001" placeholder="0.00"
                              value={nr.price} onChange={(e) => patchNew(nr.key, { price: e.target.value, priceMode: 'manual' })} />
                            {/* 无库存提示：出货且无可用价格/库存批次时，用户需自行输入价格（对齐旧系统） */}
                            {nr.productName && parseFloat(nr.outQty) > 0 && !(nr.stockOptions || []).length && (
                              <span title="该货品当前无库存，可自行输入价格" style={{ color: '#dc2626', fontSize: 11, whiteSpace: 'nowrap', fontWeight: 600 }}>无库存</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="calculated-cell">
                      <div className="currency-display">
                        <span className="currency-symbol">RM</span>
                        <span className="currency-amount">{fmtMoney(Math.abs(((parseFloat(nr.inQty) || 0) - (parseFloat(nr.outQty) || 0)) * (parseFloat(nr.price) || 0)))}</span>
                      </div>
                    </td>
                    <td>
                      <select className="table-select" value={nr.type} disabled={system === 'central'}
                        onChange={(e) => patchNew(nr.key, { type: e.target.value })}>
                        <option value="">请选择类型</option>{TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" className="remark-checkbox" checked={nr.remarkChecked}
                      onChange={(e) => patchNew(nr.key, { remarkChecked: e.target.checked, remarkPrefix: e.target.checked ? nr.remarkPrefix || computePrefix(nr.productName) : '' })} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', overflow: 'hidden', opacity: nr.remarkChecked ? 1 : 0.5 }}>
                        <input className="table-input" style={{ width: 30, textAlign: 'center', border: 'none' }} placeholder="前缀" disabled={!nr.remarkChecked}
                          value={nr.remarkPrefix} onChange={(e) => patchNew(nr.key, { remarkPrefix: e.target.value.toUpperCase() })} />
                        <span style={{ color: '#6b7280', fontWeight: 700 }}>-</span>
                        {/* 对齐旧系统：进货时编号由后端自动生成（输入框禁用），出货时手动填写 */}
                        <input className="table-input" style={{ width: 42, textAlign: 'center', border: 'none', color: !(parseFloat(nr.outQty || '0') > 0) && nr.remarkChecked ? '#9ca3af' : undefined }}
                          placeholder={nr.remarkChecked && !(parseFloat(nr.outQty || '0') > 0) ? '自动' : '编号'}
                          disabled={!nr.remarkChecked || !(parseFloat(nr.outQty || '0') > 0)}
                          value={nr.remarkSuffix} onChange={(e) => patchNew(nr.key, { remarkSuffix: e.target.value.toUpperCase() })} />
                      </div>
                    </td>
                    <td><Combobox options={shipperOptions} value={nr.receiver} placeholder="请输入或选择收货人"
                      disabled={parseFloat(nr.inQty) > 0}
                      onChange={(v) => patchNew(nr.key, { receiver: v })} /></td>
                    <td><input className="table-input" placeholder="备注" value={nr.remark} onChange={(e) => patchNew(nr.key, { remark: e.target.value })} /></td>
                    <td className="created-user">-</td>
                    <td>
                      <button className="action-btn save-btn" onClick={() => saveNewRows()} title={saving ? '保存中...' : '保存'} disabled={saving}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-save')} /></button>
                      <button className="action-btn delete-btn" onClick={() => removeNew(nr.key)} title="取消"><i className="fas fa-times" /></button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && newRows.length === 0 && (
                  <tr><td colSpan={16} style={{ padding: 20, color: '#6b7280' }}>暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 新增记录弹窗（对齐 date-rows-modal：白底黑标题 + 2px 黑边 + Enter 创建） */}
      {rowsModal && (
        <div className="modal-overlay" onClick={closeRowsModal}>
          <div className="modal-content sio-rows-modal-content" onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // 对齐旧系统 date-rows-modal：弹窗内按 Enter 直接创建记录（button 上除外，避免双触发）
              if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName !== 'BUTTON') {
                e.preventDefault()
                createMultipleRows()
              }
            }}>
            <div className="modal-header">
              <h3 className="modal-title">新增记录</h3>
              <button type="button" className="modal-close" onClick={closeRowsModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="sio-selected-date">选择日期 *</label>
                <input ref={dateInputRef} type="date" id="sio-selected-date" className="form-input" value={rowsForm.date}
                  onChange={(e) => setRowsForm({ ...rowsForm, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="sio-rows-count">要创建的行数 *</label>
                <input type="number" id="sio-rows-count" className="form-input" min={1} max={50} value={rowsForm.count}
                  onChange={(e) => setRowsForm({ ...rowsForm, count: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="sio-new-record-remark">备注</label>
                <input type="text" id="sio-new-record-remark" className="form-input" placeholder={remarkPlaceholder} value={rowsForm.remark}
                  onChange={(e) => setRowsForm({ ...rowsForm, remark: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal btn-modal-secondary" onClick={closeRowsModal}>取消</button>
              <button className="btn-modal btn-modal-primary" onClick={createMultipleRows}><i className="fas fa-plus" /> 创建记录</button>
            </div>
          </div>
        </div>
      )}

      {/* 导出弹窗（对齐 export-modal：DD/MM/YYYY）；宽度由 CSS 自适应（小屏不溢出） */}
      {exportOpen && (
        <div className="modal-overlay" onClick={() => setExportOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-file-excel" /> 生成Excel</h2>
              <ModalClose onClick={() => setExportOpen(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>开始日期</label>
                <input type="text" className="form-input" placeholder="DD/MM/YYYY" value={exportForm.start}
                  onChange={(e) => setExportForm({ ...exportForm, start: e.target.value })} />
                <small style={{ color: '#6b7280', fontSize: 12 }}>可以选择过去或未来的日期</small>
              </div>
              <div className="form-group">
                <label>结束日期</label>
                <input type="text" className="form-input" placeholder="DD/MM/YYYY" value={exportForm.end}
                  onChange={(e) => setExportForm({ ...exportForm, end: e.target.value })} />
                <small style={{ color: '#6b7280', fontSize: 12 }}>可以选择过去或未来的日期</small>
              </div>
              {system === 'central' && (
                <>
                  <div className="form-group">
                    <label>店面</label>
                    <select className="form-input" value={exportForm.system} onChange={(e) => setExportForm({ ...exportForm, system: e.target.value })}>
                      <option value="">请选择系统</option>
                      <option value="j1">J1</option><option value="j2">J2</option><option value="j3">J3</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>发票日期</label>
                    <input type="text" className="form-input" placeholder="DD/MM/YYYY" value={exportForm.invoiceDate}
                      onChange={(e) => setExportForm({ ...exportForm, invoiceDate: e.target.value })} />
                    <small style={{ color: '#6b7280', fontSize: 12 }}>可以选择过去或未来的日期</small>
                  </div>
                  <div className="form-group">
                    <label>发票号码后三位 *</label>
                    <input type="text" className="form-input" maxLength={3} placeholder="输入三位数字（例如：001）" value={exportForm.invoiceSuffix}
                      onChange={(e) => setExportForm({ ...exportForm, invoiceSuffix: e.target.value.replace(/\D/g, '') })} />
                    <small style={{ color: '#6b7280', fontSize: 12 }}>格式示例：J1-2510-001（店面-年月-序号）</small>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setExportOpen(false)}><i className="fas fa-times" /> 取消</button>
              <button className="btn btn-success" onClick={doExport}><i className="fas fa-download" /> 导出Excel</button>
            </div>
          </div>
        </div>
      )}

      {/* 货品进出货统计弹窗（对齐 kunzztest：货品名 100% 精确匹配，统计进货/出货总额） */}
      {checkOpen && (
        <div className="modal-overlay" onClick={() => setCheckOpen(false)}>
          <div className="modal-content product-summary-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-chart-bar" /> 货品进出货统计</h3>
              <ModalClose onClick={() => setCheckOpen(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>货品名称 *</label>
                <div className="product-summary-search">
                  <input type="text" id="product-summary-name" className="form-input" list="product-summary-name-list" placeholder="输入完整货品名称..." autoComplete="off"
                    value={checkForm.name} onChange={(e) => setCheckForm({ ...checkForm, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doCheck() } }} />
                  <datalist id="product-summary-name-list">
                    {productOptions.map((o) => <option key={o.value + '|' + o.label} value={o.value} />)}
                  </datalist>
                </div>
                <small className="product-summary-hint">须与货品名称完全一致，才会纳入统计</small>
              </div>
              <div className="product-summary-date-row">
                <div className="form-group">
                  <label>开始日期 *</label>
                  <input type="date" className="form-input" value={checkForm.start}
                    onChange={(e) => setCheckForm({ ...checkForm, start: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>结束日期 *</label>
                  <input type="date" className="form-input" value={checkForm.end}
                    onChange={(e) => setCheckForm({ ...checkForm, end: e.target.value })} />
                </div>
              </div>
              <div className="product-summary-results">
                <div className="product-summary-stat stat-in">
                  <span className="product-summary-stat-label"><i className="fas fa-arrow-down" /> 进货总额 (IN)</span>
                  <span className="product-summary-stat-value">{checkResult ? fmtNum(checkResult.in_total) : '-'}</span>
                </div>
                <div className="product-summary-stat stat-out">
                  <span className="product-summary-stat-label"><i className="fas fa-arrow-up" /> 出货总额 (OUT)</span>
                  <span className="product-summary-stat-value">{checkResult ? fmtNum(checkResult.out_total) : '-'}</span>
                </div>
                <div className="product-summary-stat stat-net">
                  <span className="product-summary-stat-label"><i className="fas fa-balance-scale" /> 净进出货 (IN - OUT)</span>
                  <span className="product-summary-stat-value">
                    {checkResult ? fmtNum(checkResult.total ?? ((checkResult.in_total || 0) - (checkResult.out_total || 0))) : '-'}
                  </span>
                </div>
              </div>
              {checkResult && (checkResult.in_value || checkResult.out_value) && (
                <div className="product-summary-values">
                  <span>进货金额：<b className="val-in">RM {fmtMoney(checkResult.in_value)}</b></span>
                  <span>出货金额：<b className="val-out">RM {fmtMoney(checkResult.out_value)}</b></span>
                  <span>总价（进货 - 出货）：<b className={'val-total' + (((parseFloat(String(checkResult.in_value)) || 0) - (parseFloat(String(checkResult.out_value)) || 0)) < 0 ? ' neg' : '')}>RM {fmtMoney((parseFloat(String(checkResult.in_value)) || 0) - (parseFloat(String(checkResult.out_value)) || 0))}</b></span>
                </div>
              )}
              {checkResult && checkResult.records && checkResult.records.length > 0 && (
                <div className="product-summary-detail">
                  <div className="product-summary-detail-title">进出明细（共 {checkResult.record_count} 条）</div>
                  <div className="product-summary-detail-scroll">
                    <table className="product-summary-detail-table">
                      <thead>
                        <tr><th>日期</th><th>类型</th><th className="num">进货</th><th className="num">出货</th><th className="num">单价</th><th>收货单位/出货人</th><th>备注</th></tr>
                      </thead>
                      <tbody>
                        {checkResult.records.map((r, i) => (
                          <tr key={i}>
                            <td className="date-cell nowrap">
                              <div className="detail-date">{r.date}</div>
                              {r.time && <div className="detail-time">{r.time}</div>}
                            </td>
                            <td className="type-cell">{r.type || ''}</td>
                            <td className="num cell-in">{Number(r.in_quantity) > 0 ? fmtNum(r.in_quantity) : ''}</td>
                            <td className="num cell-out">{Number(r.out_quantity) > 0 ? fmtNum(r.out_quantity) : ''}</td>
                            <td className="num">{fmtMoney(r.price)}</td>
                            <td className="receiver-cell">{r.receiver || ''}</td>
                            <td className="remark">{r.remark || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="product-summary-meta" id="product-summary-meta">
                {checkLoading ? '查询中...' : checkResult
                  ? (checkResult.record_count === 0
                    ? `未找到货品「${checkForm.name.trim()}」在 ${checkForm.start} 至 ${checkForm.end} 的记录`
                    : `货品「${checkForm.name.trim()}」共 ${checkResult.record_count} 条记录（名称 100% 匹配）`)
                  : ''}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCheckOpen(false)}><i className="fas fa-times" /> 取消</button>
              <button className="btn btn-primary" onClick={doCheck} disabled={checkLoading}>
                <i className={'fas ' + (checkLoading ? 'fa-spinner fa-spin' : 'fa-search')} /> 查询
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 日历弹窗（对齐 calendar-popup） */}
      {calOpen && (
        <div className="calendar-popup" style={calPos || { top: 120, left: 24 }}>
          <div className="calendar-header">
            <button className="calendar-nav-btn" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) } else setCalMonth(calMonth - 1) }}><i className="fas fa-chevron-left" /></button>
            <div className="calendar-month-year">
              <select value={calMonth} onChange={(e) => setCalMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={calYear} onChange={(e) => setCalYear(Number(e.target.value))}>
                {Array.from({ length: new Date().getFullYear() - 2021 }, (_, i) => 2022 + i).map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
            </div>
            <button className="calendar-nav-btn" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) } else setCalMonth(calMonth + 1) }}><i className="fas fa-chevron-right" /></button>
          </div>
          <div className="calendar-weekdays">
            {['日', '一', '二', '三', '四', '五', '六'].map(w => <div key={w} className="calendar-weekday">{w}</div>)}
          </div>
          <div className="calendar-days">
            {calDays.map((c, i) => {
              const date = new Date(c.y, c.m, c.d)
              const t = date.getTime()
              const isStart = calStart && t === calStart.getTime() && !c.other
              const isEnd = calEnd && t === calEnd.getTime() && !c.other
              const isRange = !c.other && ((calStart && calEnd && t > calStart.getTime() && t < calEnd.getTime()) || inRange(c.y, c.m, c.d))
              const isToday = !c.other && t === new Date().setHours(0, 0, 0, 0)
              return (
                <div key={i}
                  className={'calendar-day' + (c.other ? ' other-month' : '') + (isToday ? ' today' : '') + (isStart ? ' start-date' : '') + (isEnd ? ' end-date' : '') + (isRange ? ' in-range' : '')}
                  onClick={() => pickDay(c.y, c.m, c.d)}
                  onMouseEnter={() => { if (calStart && !calEnd) setCalPreview(date) }}>
                  {c.d}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 回到顶部 */}
      {showTop && (
        <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="回到顶部">
          <i className="fas fa-chevron-up" />
        </button>
      )}

      {undo && (
        <div className="sio-undo-bar">
          <span>已删除 {undo.count} 条记录</span>
          <button type="button" onClick={undoDelete}>撤销 <span className="sio-undo-shortcut">(Ctrl+Shift+Z)</span></button>
        </div>
      )}

      {/* 本地 AI 助手聊天球（查询问答 + 进出货草稿确认） */}
      <AiAssistant system={system} onSaved={() => { load(page) }} />

    </div>
  )
}
