import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStockSummary, getMinimums, getPriceChangeLogLatest, getPriceChangeLog, getStockPerms } from '../api'
import { FREEZER_OPTIONS } from './StockProducts'
import type { PriceLogEntry } from '../api'
import { useRealtime } from '../utils/useRealtime'
import '../styles/stocklist.css'
import { showToast } from '../utils/toast'
import { Modal } from 'antd'

interface SummaryItem {
  no?: number
  product_name?: string
  code_number?: string
  specification?: string
  total_stock?: number
  price?: number
  total_price?: number
  formatted_stock?: string
  formatted_price?: string
  formatted_total_price?: string
  type?: string
  price_raw?: number | string
  has_price_diff?: boolean
  /** 同货品多单价：合并展示（库存合并，单价变体明细） */
  price_count?: number
  price_variants?: { price: number; stock: number; total_price: number; formatted_stock?: string; formatted_price?: string; formatted_total_price?: string; code_nos?: string[] }[]
  /** 冰箱分类（台账 stock_data.freezer_category，多选逗号分隔；9/3 新增，仅选中类型后显示） */
  freezer_category?: string
  /** 位次（台账 stock_data.freezer_position；仅后台排序，绝不出现在 UI） */
  freezer_position?: number | null
}
interface SummaryData {
  summary: SummaryItem[]
  total_value: number
  formatted_total_value: string
  total_products: number
  type_stats?: Record<string, number>
  j1_supply_value?: number
  j2_supply_value?: number
  j3_supply_value?: number
}

const systems = [
  { key: 'central', label: '中央' },
  { key: 'j1', label: 'J1' },
  { key: 'j2', label: 'J2' },
  { key: 'j3', label: 'J3' },
]

const SYSTEM_NAMES: Record<string, string> = { central: '中央', j1: 'J1', j2: 'J2', j3: 'J3' }
const VIEW_NAMES: Record<string, string> = { list: '总库存', records: '进出货', remark: '货品备注', product: '货品种类', sot: '货品异常' }

// 类型过滤卡（对齐线上 J1/J2/J3 页面的 type-grid）
const typeCards: Record<string, { label: string; type: string; show: boolean }[]> = {
  central: [
    { label: 'Service Line', type: 'Service Line', show: true },
    { label: 'Sake', type: 'Sake', show: true },
    { label: 'Kitchen', type: 'Kitchen', show: true },
    { label: 'Sushi Bar', type: 'Sushi Bar', show: true },
  ],
  j1: [
    { label: 'Service Line', type: 'Service Line', show: true },
    { label: 'Sake', type: 'Sake', show: true },
    { label: 'Kitchen', type: 'Kitchen', show: true },
    { label: 'Sushi Bar', type: 'Sushi Bar', show: true },
  ],
  j2: [
    { label: 'Service Line', type: 'Service Line', show: true },
    { label: 'Sake', type: 'Sake', show: false },
    { label: 'Kitchen', type: 'Kitchen', show: true },
    { label: 'Sushi Bar', type: 'Sushi Bar', show: true },
  ],
  j3: [
    { label: 'Service Line', type: 'Service Line', show: true },
    { label: 'Sake', type: 'Sake', show: true },
    { label: 'Kitchen', type: 'Kitchen', show: true },
    { label: 'Sushi Bar', type: 'Sushi Bar', show: true },
  ],
}

const normalizeItemType = (type?: string) => {
  if (!type) return ''
  if (type === 'Drinks' || type === 'drinks') return 'Service Line'
  return type
}

// 无库存不展示（用户需求：凡是没库存的记录一律隐藏，Sake 同理）
const hasStock = (item: SummaryItem) => (parseFloat(String(item.total_stock)) || 0) !== 0

/**
 * 同名货品合并（用户需求：不同编码但同名的记录合并为一行，只出现一个货品名称）
 * - 分组键：product_name（trim + 忽略大小写）
 * - 库存/总价：各行相加；编号去重后用 " / " 连接（保留追溯线索）
 * - 规格一致则沿用，混合时置空（显示 '-'），小数位按是否全 Kilo 取 3/2 位
 * - 多单价：合并所有变体后按价格归并（同价累加库存），重算 price_count
 */
const mergeSummaryItems = (items: SummaryItem[]): SummaryItem[] => {
  const order: string[] = []
  const map = new Map<string, SummaryItem[]>()
  for (const it of items) {
    const key = (it.product_name || '').trim().toLowerCase() || String(it.no)
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key)!.push(it)
  }
  const out: SummaryItem[] = []
  for (const key of order) {
    const arr = map.get(key)!
    if (arr.length === 1) { out.push(arr[0]); continue }
    const base: SummaryItem = { ...arr[0] }
    // 编号合并（去重，保持出现顺序）
    const codes: string[] = []
    arr.forEach(a => { const c = (a.code_number || '').trim(); if (c && !codes.includes(c)) codes.push(c) })
    base.code_number = codes.join(' / ')
    // 规格：一致则沿用；混合置空（表格显示 '-'）
    const specs = Array.from(new Set(arr.map(a => (a.specification || '').trim()).filter(Boolean)))
    base.specification = specs.length === 1 ? specs[0] : ''
    // 数量与金额汇总
    base.total_stock = arr.reduce((s, a) => s + (parseFloat(String(a.total_stock)) || 0), 0)
    base.total_price = arr.reduce((s, a) => s + (parseFloat(String(a.total_price)) || 0), 0)
    const decimals = specs.length === 1 && specs[0].toLowerCase() === 'kilo' ? 3 : 2
    base.formatted_stock = base.total_stock.toFixed(decimals)
    base.formatted_total_price = base.total_price.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    // 价格变体归并（同价累加库存；保持首次出现顺序；记录每个价的编码来源）
    const pmap = new Map<number, { price: number; stock: number; total_price: number; code_nos: string[] }>()
    const porder: number[] = []
    arr.forEach(a => {
      const selfCode = (a.code_number || '').trim()
      ;(a.price_variants || []).forEach(v => {
        const p = Math.round((parseFloat(String(v.price)) || 0) * 100) / 100
        if (!pmap.has(p)) { pmap.set(p, { price: p, stock: 0, total_price: 0, code_nos: [] }); porder.push(p) }
        const e = pmap.get(p)!
        e.stock += parseFloat(String(v.stock)) || 0
        e.total_price += parseFloat(String(v.total_price)) || 0
        if (selfCode && !e.code_nos.includes(selfCode)) e.code_nos.push(selfCode)
      })
    })
    const variants = porder.map(p => {
      const e = pmap.get(p)!
      return {
        price: e.price, stock: e.stock, total_price: e.total_price, code_nos: e.code_nos,
        formatted_stock: e.stock.toFixed(decimals),
        formatted_price: p.toFixed(2),
        formatted_total_price: e.total_price.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      }
    })
    base.price_variants = variants
    base.price_count = variants.length
    base.has_price_diff = variants.length > 1
    // 归并后只剩一个单价 → 直接显示该价（无差价悬浮）
    if (variants.length === 1) { base.formatted_price = variants[0].formatted_price; base.has_price_diff = false; base.price_raw = undefined as unknown as number }
    out.push(base)
  }
  return out
}

const formatStockQuantity = (item: SummaryItem) => {
  const spec = (item.specification || '').trim().toLowerCase()
  const raw = parseFloat(String(item.total_stock))
  if (spec === 'kilo') {
    if (!isNaN(raw)) return raw.toFixed(3)
    return item.formatted_stock || '0.000'
  }
  return item.formatted_stock || '0.00'
}

// 渲染价格：无差异时直接显示；有差异时标记悬浮（8/23 线上修复：悬浮显示数据库原始单价，fixed 定位避免被表格裁剪）
const renderPriceRawTip = (item: SummaryItem) => {
  if (!item || !item.has_price_diff) return item.formatted_price
  const raw = parseFloat(String(item.price_raw))
  if (isNaN(raw)) return item.formatted_price
  // 最多保留 6 位小数，去掉多余尾零
  const rawStr = String(parseFloat(raw.toFixed(6)))
  return <span className="raw-price-hover" data-raw-price={rawStr}>{item.formatted_price}</span>
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


export default function StockRecords() {
  const [system, setSystem] = useState('central')
  // 页面权限（职员管理·权限设定→库存→系统选项）：null = 未配置（默认全部可用）；[] = 全部关闭（锁定）
  const [allowedSystems, setAllowedSystems] = useState<string[] | null>(null)
  const locked = allowedSystems !== null && allowedSystems.length === 0
  useEffect(() => {
    getStockPerms().then((p: any) => {
      const configured = p == null ? false : (p.configured ?? ((p.systems || []).length > 0 || (p.views || []).length > 0))
      if (!configured) return
      const allowed = (p.systems || []).map((s: string) => s.toLowerCase())
      setAllowedSystems(allowed)
      setSystem(prev => (allowed.includes(prev) ? prev : (systems.map(s => s.key).find(k => allowed.includes(k)) || prev)))
    }).catch(() => {})
  }, [])
  // 8/24：鼠标滚轮在供应值区域滚动即可切换显示类型卡（再滚恢复），带节流防连切
  const [showTypeCards, setShowTypeCards] = useState(false)
  const wheelLock = useRef(false)
  const onTypeWheel = (e: React.WheelEvent) => {
    if (wheelLock.current) return
    wheelLock.current = true
    setShowTypeCards(v => !v)
    setTimeout(() => { wheelLock.current = false }, 500)
  }
  const [viewOpen, setViewOpen] = useState(false)
  const [sysOpen, setSysOpen] = useState(false)
  const [data, setData] = useState<Record<string, SummaryData>>({})
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [typeSel, setTypeSel] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [lowStock, setLowStock] = useState<Record<string, Record<string, number>>>({})
  const [searchExpanded, setSearchExpanded] = useState<Record<string, boolean>>({})
  // 精确搜索（按系统独立）：产品名 = 关键字（不区分大小写），对齐进出货页 smartSearch 图标切换
  const [exactMatch, setExactMatch] = useState<Record<string, boolean>>({})
  // 改价日志：每货品最近一次改价（列展示）+ 弹窗历史（从旧到最新）
  const [priceLatest, setPriceLatest] = useState<Record<string, { date: string; price: number }>>({})
  const [logModal, setLogModal] = useState<{ name: string; entries: PriceLogEntry[]; loading: boolean } | null>(null)
  // 导出日期范围弹窗（对齐旧 live 系统 export-date-modal：默认本月，快捷 今天/本月/上月/全部）
  const [exportModal, setExportModal] = useState<{ sys: string } | null>(null)
  const [expStart, setExpStart] = useState('')
  const [expEnd, setExpEnd] = useState('')
  const [expQuick, setExpQuick] = useState<string>('this_month')
  const [exporting, setExporting] = useState(false)
  // 导出类型多选（默认全选 = 原行为）；选项 = 该系统 typeCards show 项 ∩ 实际有数据的类型
  // （对齐页面类型卡隐藏规则：该类型在 summary 里已无任何有库存行 → 不作为导出选项，如中央无 Sake）
  const [expTypes, setExpTypes] = useState<Set<string>>(new Set())
  const allExportTypes = (sys: string) => {
    const d = mergedData[sys]
    return (typeCards[sys] || []).filter(c => c.show && (d?.summary || []).some(it => normalizeItemType(it.type) === c.type && hasStock(it))).map(c => c.type)
  }
  const toggleExpType = (t: string) => setExpTypes(prev => {
    const n = new Set(prev)
    if (n.has(t)) n.delete(t); else n.add(t)
    return n
  })
  // 多单价展开（按行 no 记录展开状态）
  const [openVariants, setOpenVariants] = useState<Set<number>>(new Set())
  const toggleVariants = (no: number) => setOpenVariants(prev => {
    const n = new Set(prev)
    if (n.has(no)) n.delete(no); else n.add(no)
    return n
  })
  const searchRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const navigate = useNavigate()

  useRawPriceTooltip()

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  // 加载某系统数据
  const load = async (sys: string) => {
    setLoading(prev => ({ ...prev, [sys]: true }))
    try {
      const d = await getStockSummary(sys)
      setData(prev => ({ ...prev, [sys]: d }))
      setFilters(prev => ({ ...prev, [sys]: '' }))
      setTypeSel(prev => ({ ...prev, [sys]: new Set() }))
    } catch { /* ignore */ }
    setLoading(prev => ({ ...prev, [sys]: false }))
  }

  useEffect(() => { load('central'); load('j1'); load('j2'); load('j3'); }, [])

  // 改价日志：一次拉全量最近改价（按货品名匹配；失败静默，不影响页面）
  useEffect(() => {
    getPriceChangeLogLatest()
      .then(list => {
        const m: Record<string, { date: string; price: number }> = {}
        for (const e of list || []) m[String(e.productName || '').trim()] = { date: String(e.changeDate || ''), price: Number(e.newPrice) || 0 }
        setPriceLatest(m)
      })
      .catch(() => { /* ignore */ })
  }, [])

  /** 点击货品名：弹窗展示该货品从旧到最新的单价改动记录 */
  const openPriceLog = async (name: string) => {
    setLogModal({ name, entries: [], loading: true })
    try {
      const entries = await getPriceChangeLog(name)
      setLogModal({ name, entries: entries || [], loading: false })
    } catch {
      setLogModal({ name, entries: [], loading: false })
    }
  }
  /** 日期显示：列用 28/8/2026（d/m/yyyy），弹窗用 2026年8月28日 */
  const fmtDmy = (iso: string) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso || '')
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '-')
  }
  const fmtCn = (iso: string) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso || '')
    return m ? `${m[1]}年${m[2]}月${m[3]}日` : (iso || '-')
  }
  const fmtRm = (v: number | null | undefined) => 'RM' + (Number(v) || 0).toFixed(2)

  // 全站实时更新：只刷当前查看的系统（任何写入都广播 all → 当前视图刷新；切换系统时 switchSystem 会补拉）
  useRealtime(system, () => load(system))

  // 加载最低库存设置（8/24 修复：按系统分别加载，各分店设置独立，互不影响）
  // 同名产品多记录取最大，对齐线上 loadLowStockSettings；老库 product_name 含 HTML 实体需解码
  useEffect(() => {
    const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    Promise.all(['central', 'j1', 'j2', 'j3'].map((sys) =>
      getMinimums(sys).then((list) => {
        const map: Record<string, number> = {}
        list.forEach((m: any) => {
          const name = decode(String(m.productName || m.product_name || '').trim())
          const qty = parseFloat(String(m.minimumQuantity ?? m.minimum_quantity))
          if (name && !isNaN(qty)) {
            if (!map[name] || qty > map[name]) map[name] = qty
          }
        })
        return { sys, map }
      }).catch(() => ({ sys, map: {} as Record<string, number> })),
    )).then((results) => {
      const bySys: Record<string, Record<string, number>> = {}
      results.forEach(({ sys, map }) => { bySys[sys] = map })
      setLowStock(bySys)
    })
  }, [])

  // smartSearch：点击外部且输入为空时折叠（对齐线上 collapseSearch 逻辑）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      let changed = false
      setSearchExpanded(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(sys => {
          const wrapper = document.querySelector('#' + sys + '-page .smartSearchWrapper')
          if (wrapper && wrapper.contains(t)) return
          const input = searchRefs.current[sys]
          if (input && input.value) return // 有输入时保持展开
          if (next[sys]) { next[sys] = false; changed = true }
        })
        return next
      })
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // 视图切换（对齐线上：records/remark/product/sot 跳转到独立页面）
  const switchView = (view: string) => {
    setViewOpen(false)
    if (view === 'records') { navigate('/inout?system=' + system); return }
    if (view === 'remark') { navigate('/remark'); return }
    if (view === 'product') { navigate('/products'); return }
    if (view === 'sot') { navigate('/sot'); return }
  }

  const switchSystem = (sys: string) => {
    if (sys === system) { setSysOpen(false); return }
    setSystem(sys)
    const url = new URL(window.location.href)
    url.searchParams.set('system', sys)
    window.history.replaceState({}, '', url)
    setSysOpen(false)
    // 切换系统时总是重新拉取，保证看到最新数据（实时信号只刷当前视图）
    load(sys)
  }

  // URL 初始系统
  useEffect(() => {
    const r = new URL(window.location.href).searchParams.get('system')
    if (r && systems.some(s => s.key === r)) {
      setSystem(r)
      if (!data[r]) load(r)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 类型过滤切换
  const toggleType = (sys: string, type: string) => {
    setTypeSel(prev => {
      const s = new Set(prev[sys] || [])
      if (s.has(type)) s.delete(type)
      else s.add(type)
      return { ...prev, [sys]: s }
    })
  }

  // 同名货品展示层合并（不同编码同名 → 一行）；type_stats 卡片计数仍用后端原始值
  const mergedData = useMemo(() => {
    const m: Record<string, SummaryData> = {}
    Object.keys(data).forEach(k => {
      const merged: SummaryData = { ...data[k], summary: mergeSummaryItems(data[k].summary) }
      m[k] = merged
    })
    return m
  }, [data])

  // 过滤后的行（搜索 + 类型）；选中具体类型时：冰箱分类→位次→货品名 排序（9/3）
  // 兑底：多值 freezer 取首项按 FREEZER_OPTIONS 业务顺序（字母序会 C-1 跑到 K1 前）；未知 freezer 排已知名单后；
  //       无 freezer 排最后；position 数字排序、NULL/空/0 排该冰箱最后；重复 position 用货品名稳定兜底
  const filtered = useMemo(() => {
    const d = mergedData[system]
    if (!d) return []
    const kw = (filters[system] || '').toLowerCase()
    const sel = typeSel[system] || new Set<string>()
    const arr = d.summary.filter(item => {
      if (!hasStock(item)) return false // 无库存不展示
      const itemType = normalizeItemType(item.type)
      if (sel.size > 0 && !sel.has(itemType)) return false
      if (!kw) return true
      // 精确模式：只显示货品名称完全等于关键字的行（不区分大小写）
      if (exactMatch[system]) return (item.product_name || '').toLowerCase() === kw.trim()
      return (
        String(item.no || '').includes(kw) ||
        (item.product_name || '').toLowerCase().includes(kw) ||
        (item.code_number || '').toLowerCase().includes(kw) ||
        (item.specification || '').toLowerCase().includes(kw)
      )
    })
    if (sel.size > 0) {
      const UNKNOWN_BASE = FREEZER_OPTIONS.length
      const freezerRank = (fc?: string) => {
        const first = (fc || '').split(',')[0]?.trim() || ''
        if (!first) return UNKNOWN_BASE + 1 // 无冰箱分类 → 最后
        const i = FREEZER_OPTIONS.indexOf(first)
        return i === -1 ? UNKNOWN_BASE : i // 名单外的新 freezer → 已知名单之后（字母序稳定）
      }
      const posRank = (p?: number | null) => (p == null || p <= 0 ? Number.MAX_SAFE_INTEGER : p)
      arr.sort((a, b) => {
        const fa = freezerRank(a.freezer_category), fb = freezerRank(b.freezer_category)
        if (fa !== fb) return fa - fb
        const pa = posRank(a.freezer_position), pb = posRank(b.freezer_position)
        if (pa !== pb) return pa - pb
        return (a.product_name || '').localeCompare(b.product_name || '')
      })
    }
    return arr
  }, [mergedData, system, filters, typeSel, exactMatch])

  const cur = data[system]
  const curFiltered = filtered
  const typeStats = cur?.type_stats || {}
  const statOf = (sys: string, label: string) => {
    const stats = data[sys]?.type_stats || {}
    // 线上 type_stats 是 {type: value}；服务端返回原始 type 名
    const key = Object.keys(stats).find(k => normalizeItemType(k) === label)
    return key ? stats[key] : 0
  }
  const fmtMoney = (v?: number) => (v ?? 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ---- 导出日期范围（对齐旧 live 系统 export-date-modal：默认本月，快捷 今天/本月/上月/全部） ----
  const isoToday = () => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }
  const openExportModal = (sys: string) => {
    const t = new Date()
    const first = new Date(t.getFullYear(), t.getMonth(), 1)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setExpStart(iso(first)); setExpEnd(iso(t)); setExpQuick('this_month')
    setExpTypes(new Set(allExportTypes(sys)))
    setExportModal({ sys })
  }
  const quickSetDate = (type: string) => {
    const t = new Date()
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setExpQuick(type)
    if (type === 'today') { setExpStart(iso(t)); setExpEnd(iso(t)) }
    else if (type === 'this_month') { setExpStart(iso(new Date(t.getFullYear(), t.getMonth(), 1))); setExpEnd(iso(t)) }
    else if (type === 'last_month') {
      setExpStart(iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)))
      setExpEnd(iso(new Date(t.getFullYear(), t.getMonth(), 0)))
    } else if (type === 'all') { setExpStart(''); setExpEnd(iso(t)) }
  }
  const confirmExport = async () => {
    if (!exportModal) return
    const sys = exportModal.sys
    const start = expStart, end = expEnd
    if (!end) { showMsg('请选择结束日期', 'error'); return }
    if (start && start > end) { showMsg('开始日期不能晚于结束日期', 'error'); return }
    if (expTypes.size === 0) { showMsg('请至少选择一个导出类型', 'error'); return }
    // 全部（无开始日期且结束=今天）→ 用页面当前显示数据（对齐旧系统 usePageData）
    if (!start && (!end || end === isoToday())) { setExportModal(null); exportPDF(sys, undefined, undefined, expTypes); return }
    // 指定日期范围 → 从后端拉截至结束日期的库存余额（库存累积，start 仅用于 PDF 标注）
    setExporting(true)
    try {
      const d = await getStockSummary(sys, end)
      const items = (d.summary || []).filter(hasStock)
      setExportModal(null)
      await exportPDF(sys, { start, end }, items, expTypes)
    } catch { /* 拦截器已提示 */ }
    setExporting(false)
  }

  // 导出 PDF（对齐线上 stocklistall.js exportData -> generatePDF：标题/时间/记录数/日期范围/表头/列宽/最低库存/总计行/页脚）
  // range 非空 = 指定日期范围导出（items 来自后端截至 endDate 的汇总；PDF 标注 Date Range，对齐旧系统）
  const exportPDF = async (sys: string, range?: { start: string; end: string }, rangeItems?: SummaryItem[], typeSel?: Set<string>) => {
    let items = rangeItems || (sys === system ? curFiltered : (mergedData[sys]?.summary || []).filter(hasStock))
    if (items.length === 0) { showMsg('没有数据可导出', 'error'); return }
    // 类型多选过滤（normalizeItemType 统一 Drinks→Service Line）
    if (typeSel && typeSel.size > 0) {
      items = items.filter((it: SummaryItem) => typeSel.has(normalizeItemType(it.type)))
      if (items.length === 0) { showMsg('所选类型没有数据可导出', 'error'); return }
    }
    // J2 导出过滤掉 Sake 类型（对齐线上 performExport）
    if (sys === 'j2') {
      items = items.filter((it: SummaryItem) => it.type !== 'Sake')
      if (items.length === 0) { showMsg('没有数据可导出', 'error'); return }
    }
    try {
      const w = window as any
      if (!w.jspdf) { showMsg('PDF 库未加载', 'error'); return }
      const { jsPDF } = w.jspdf
      const doc = new jsPDF('landscape', 'mm', 'a4')

      // 标题（英文，对齐线上 systemNameMap）
      const systemNameMap: Record<string, string> = { central: 'Central', j1: 'J1', j2: 'J2', j3: 'J3' }
      const systemName = systemNameMap[sys] || sys.toUpperCase()
      doc.setFontSize(16)
      doc.setFont(undefined, 'bold')
      doc.text(`${systemName} Stock Summary Report`, 14, 15)

      // 导出时间 + 记录数
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      const exportTimeStr = new Date().toLocaleString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      })
      doc.text(`Export Time: ${exportTimeStr}`, 14, 22)
      doc.text(`Records: ${items.length}`, 200, 22)

      // 日期标注（对齐旧系统：指定开始日期 → Date Range；否则 As of Date）
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      const mdY = (iso: string) => {
        const mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso || '')
        return mt ? `${mt[2]}/${mt[3]}/${mt[1]}` : iso
      }
      if (range?.start) {
        doc.text(`Date Range: ${mdY(range.start)} - ${mdY(range.end || `${y}-${m}-${d}`)}`, 14, 28)
      } else {
        doc.text(`As of Date: ${mdY(range?.end || `${y}-${m}-${d}`)}`, 14, 28)
      }
      // 类型标注（仅选择了部分类型时显示）
      if (typeSel && typeSel.size > 0 && typeSel.size < allExportTypes(sys).length) {
        doc.text(`Types: ${[...typeSel].join(', ')}`, 200, 28)
      }

      // 表格数据（表头/列序/列宽 对齐线上）
      const tableData: (string | number)[][] = []
      let totalValue = 0
      items.forEach((it, index) => {
        if (!it) return
        const productName = (it.product_name || '').trim()
        const minimumQuantity = lowStock[sys]?.[productName] || 0
        let minimumStockDisplay = '-'
        if (minimumQuantity > 0) {
          const specification = (it.specification || '').trim().toLowerCase()
          minimumStockDisplay = specification === 'kilo'
            ? parseFloat(String(minimumQuantity)).toFixed(3)
            : parseFloat(String(minimumQuantity)).toFixed(2)
        }
        const totalPrice = parseFloat(String(it.total_price)) || 0
        totalValue += totalPrice
        tableData.push([
          (it.no || (index + 1)).toString(),
          it.product_name || '-',
          it.code_number || '-',
          minimumStockDisplay,
          it.formatted_stock || formatStockQuantity(it),
          it.specification || '-',
          it.formatted_price || '0.00',
          it.formatted_total_price || '0.00'
        ])
      })
      // 总计行（对齐线上）
      tableData.push(['', 'Total', '', '', '', '', '', `RM ${totalValue.toFixed(2)}`])

      ;(doc as any).autoTable({
        head: [['No.', 'Product Name', 'Code Number', 'Minimum Stock', 'Total Stock', 'Specification', 'Unit Price', 'Total Price']],
        body: tableData,
        startY: 34,
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', cellWidth: 'wrap' },
        headStyles: { fillColor: [99, 99, 99], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: 18 }, 1: { cellWidth: 55 }, 2: { cellWidth: 35 },
          3: { cellWidth: 28 }, 4: { cellWidth: 28 }, 5: { cellWidth: 25 },
          6: { cellWidth: 35 }, 7: { cellWidth: 35 }
        },
        margin: { top: 28, left: 14, right: 14 },
        didDrawPage: (data: any) => {
          doc.setFontSize(8)
          doc.text(`Page ${data.pageNumber}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' })
        }
      })

      doc.save(`${sys}_stock_summary_${y}${m}${d}.pdf`)
      showMsg('PDF 已导出')
    } catch (e) { console.error(e); showMsg('导出失败', 'error') }
  }

  // 设置最低库存跳转
  const goMinimum = () => navigate('/settings?view=minimum')


  const renderSystemPage = (sys: string) => {
    const d = mergedData[sys]
    const isCentral = sys === 'central'
    // 选中具体类型 → 显示「冰箱分类」列 + 启用冰箱/位次排序（9/3；未选=全部时保持原样）
    const showFridge = (typeSel[sys] || new Set<string>()).size > 0
    const cards = typeCards[sys] || []
    // 类型卡片隐藏规则：该类型在（同名合并+无库存隐藏后的）表格里已无任何行 → 卡片不展示
    const typeHasStock = (t: string) => (d?.summary || []).some(it => normalizeItemType(it.type) === t && hasStock(it))
    const sel = typeSel[sys] || new Set<string>()
    // 8/24 修复：低库存按产品名汇总检测（名字不管价格），且各系统独立（只用本系统 summary 数据）
    const productTotals: Record<string, number> = {}
    ;(d?.summary || []).forEach((it) => {
      const name = (it.product_name || '').trim()
      productTotals[name] = (productTotals[name] || 0) + (parseFloat(String(it.total_stock)) || 0)
    })
    const sysFiltered = sys === system ? curFiltered : (d ? d.summary.filter(it => hasStock(it) && (() => {
      const kw = (filters[sys] || '').toLowerCase()
      if (!kw) return true
      return (it.product_name || '').toLowerCase().includes(kw) || (it.code_number || '').toLowerCase().includes(kw)
    })()) : [])
    return (
      <div key={sys} id={sys + '-page'} className={'page-section' + (sys === system ? ' active' : '')} style={sys === system ? undefined : { display: 'none' }}>
        <div className="unified-header-row">
          <div className="header-summary">
            <div className="summary-title">总库存</div>
            <div className="summary-amount">
              <span className="currency-symbol">RM</span>
              <span className="value" id={sys + '-total-value'}>{d ? d.formatted_total_value : '0.00'}</span>
            </div>
          </div>

          <div className="type-grid-container">
            {/* 8/24：中央默认显示供应值；鼠标滑过该区域即显示类型卡（隐藏式，无按钮） */}
            {isCentral ? (
              <div className="type-hover-swap" onWheel={onTypeWheel} title="滚动鼠标滚轮切换类型统计">
                <div className="type-supply-cards" style={showTypeCards ? { display: 'none' } : { display: 'flex' }}>
                  <div className="type-grid-item">
                    <div className="grid-title">J1供应</div>
                    <div className="grid-value" id="central-j1-supply-value">{d ? fmtMoney(d.j1_supply_value) : '0.00'}</div>
                  </div>
                  <div className="type-grid-item">
                    <div className="grid-title">J2供应</div>
                    <div className="grid-value" id="central-j2-supply-value">{d ? fmtMoney(d.j2_supply_value) : '0.00'}</div>
                  </div>
                  <div className="type-grid-item">
                    <div className="grid-title">J3供应</div>
                    <div className="grid-value" id="central-j3-supply-value">{d ? fmtMoney(d.j3_supply_value) : '0.00'}</div>
                  </div>
                  <div className="type-scroll-hint" style={{ alignSelf: 'center', marginLeft: 4 }}>
                    <i className="fas fa-mouse" />
                  </div>
                </div>
                <div className="type-category-cards" style={showTypeCards ? { display: 'flex' } : { display: 'none' }}>
                  {cards.filter(c => c.show && typeHasStock(c.type)).map(c => (
                    <div key={c.type} className={'type-grid-item is-filterable' + (sel.has(c.type) ? ' is-active' : '')}
                      data-type={c.type} role="button" tabIndex={0} aria-pressed={sel.has(c.type)}
                      onClick={(e) => { toggleType(sys, c.type); e.stopPropagation() }}>
                      <div className="grid-title">{c.label}</div>
                      <div className={'grid-value' + (statOf(sys, c.type) < 0 ? ' negative' : '')}>
                        {fmtMoney(statOf(sys, c.type))}
                      </div>
                    </div>
                  ))}
                  <div className="type-scroll-hint" style={{ alignSelf: 'center', marginLeft: 4 }}>
                    <i className="fas fa-mouse" />
                  </div>
                </div>
              </div>
            ) : (
              cards.filter(c => c.show && typeHasStock(c.type)).map(c => (
                <div key={c.type} className={'type-grid-item is-filterable' + (sel.has(c.type) ? ' is-active' : '')}
                  data-type={c.type} role="button" tabIndex={0} aria-pressed={sel.has(c.type)}
                  onClick={() => toggleType(sys, c.type)}>
                  <div className="grid-title">{c.label}</div>
                  <div className={'grid-value' + (statOf(sys, c.type) < 0 ? ' negative' : '')} id={sys + '-' + c.type.toLowerCase().replace(/ /g, '-') + '-value'}>
                    {fmtMoney(statOf(sys, c.type))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="header-right-section">
            <div className="header-search">
              <div className={'smartSearchWrapper' + (searchExpanded[sys] ? ' expanded' : '')}
                onClick={(e) => { if (!searchExpanded[sys]) { e.stopPropagation(); setSearchExpanded(prev => ({ ...prev, [sys]: true })); setTimeout(() => searchRefs.current[sys]?.focus(), 200) } }}>
                {/* 左侧图标即搜索模式切换：放大镜=模糊 / 等号=精确（货品名完全等于关键字）；对齐进出货页 */}
                <span className="smartSearch-icon"
                  title={exactMatch[sys] ? '精确搜索：只显示货品名称完全等于关键字的行（点击切换为模糊）' : '模糊搜索：显示所有包含关键字的行（点击切换为精确）'}
                  onClick={(e) => { e.stopPropagation(); setExactMatch(prev => ({ ...prev, [sys]: !prev[sys] })); setSearchExpanded(p => ({ ...p, [sys]: true })); setTimeout(() => searchRefs.current[sys]?.focus(), 50) }}>
                  <i className={'fas ' + (exactMatch[sys] ? 'fa-equals' : 'fa-search')} style={{ color: exactMatch[sys] ? '#ff7b00' : '#9ca3af' }} />
                </span>
                <input ref={(el) => { searchRefs.current[sys] = el }} type="text" id={sys + '-unified-filter'} className="smartSearch-input"
                  placeholder={isCentral ? '输入关键字搜索...' : sys === 'j1' ? '搜索序号、货品编号、货品、库存数量、规格、单价、总价...' : '搜索货品名称、编号或规格单位...'}
                  value={filters[sys] || ''} onChange={(e) => setFilters(prev => ({ ...prev, [sys]: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-warning btn-expand" onClick={() => openExportModal(sys)} title="导出数据（可选择日期范围与类型）">
              <span className="btn-expand-icon"><i className="fas fa-download"></i></span>
              <span className="btn-expand-text">导出数据</span>
            </button>
            <button className="btn btn-primary btn-expand" onClick={goMinimum} title="设置最低库存">
              <span className="btn-expand-icon"><i className="fas fa-cog"></i></span>
              <span className="btn-expand-text">设置最低库存</span>
            </button>
            <div className="header-stats">
              <span>显示记录: <span className="stat-value" id={sys + '-displayed-records'}>{sysFiltered.length}</span></span>
              <span>总记录: <span className="stat-value" id={sys + '-total-records'}>{d ? d.total_products : 0}</span></span>
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-scroll-container">
            <table className="stock-table" id={sys + '-stock-table'}>
              <thead>
                <tr>
                  <th>序号.</th>
                  <th>货品编号</th>
                  <th>货品</th>
                  {showFridge && <th>冰箱分类</th>}
                  <th>最低库存</th>
                  <th>{isCentral ? '库存数量' : '库存总量'}</th>
                  <th>规格</th>
                  <th>单价</th>
                  <th>总价</th>
                </tr>
              </thead>
              <tbody id={sys + '-stock-tbody'}>
                {loading[sys] && (
                  <tr><td colSpan={showFridge ? 9 : 8} className="no-data" style={{ padding: 30, textAlign: 'center' }}>加载中...</td></tr>
                )}
                {!loading[sys] && sysFiltered.length === 0 && (
                  <tr><td colSpan={showFridge ? 9 : 8} className="no-data">
                    <i className="fas fa-inbox"></i>
                    <div>暂无{SYSTEM_NAMES[sys]}数据</div>
                  </td></tr>
                )}
                {sysFiltered.map((item, idx) => {
                  const stock = parseFloat(String(item.total_stock)) || 0
                  const price = parseFloat(String(item.total_price)) || 0
                  // 最低库存（8/24 修复：按系统取设置，各分店独立；同名多记录取最大）
                  const productName = (item.product_name || '').trim()
                  const minimumQuantity = lowStock[sys]?.[productName] || 0
                  const spec = (item.specification || '').trim().toLowerCase()
                  let minDisplay = '-'
                  if (minimumQuantity > 0) {
                    minDisplay = spec === 'kilo' ? minimumQuantity.toFixed(3) : minimumQuantity.toFixed(2)
                  }
                  // 低库存判定（8/24 修复：按产品名汇总总库存 vs 最低库存，不管价格/规格；各系统独立）
                  const productTotal = productTotals[productName] || 0
                  const diff = productTotal - minimumQuantity
                  const isLowStock = minimumQuantity > 0 && diff <= 0.001
                  const minClass = minimumQuantity > 0 ? 'minimum-stock-value' : 'zero-value'
                  const multi = (item.price_count || 0) > 1
                  const expanded = multi && openVariants.has(Number(item.no))
                  return (
                    <Fragment key={idx}>
                    <tr className={isLowStock ? 'low-stock-row' : ''}>
                      <td className="text-center">{idx + 1}</td>
                      <td className="text-center">{item.code_number || '-'}</td>
                      <td>
                        <strong
                          style={{ cursor: priceLatest[productName] ? 'pointer' : 'default' }}
                          title={priceLatest[productName]
                            ? `最近改价：${fmtDmy(priceLatest[productName].date)} ${fmtRm(priceLatest[productName].price)}
点击查看完整改价记录（从旧到最新）`
                            : undefined}
                          onClick={() => { if (priceLatest[productName]) openPriceLog(productName) }}
                        >
                          {item.product_name}
                          {priceLatest[productName] && <i className="fas fa-history" style={{ marginLeft: 5, fontSize: 11, color: '#f59e0b' }} />}
                        </strong>
                      </td>
                      {showFridge && <td className="text-center">{item.freezer_category || '-'}</td>}
                      <td className="stock-cell">
                        <div className={'currency-display ' + minClass}>
                          <span className="currency-symbol">&nbsp;</span>
                          <span className="currency-amount">{minDisplay}</span>
                        </div>
                      </td>
                      <td className="stock-cell">
                        <div className={'currency-display ' + (stock > 0 ? 'positive-value' : 'zero-value')}>
                          <span className="currency-symbol">&nbsp;</span>
                          <span className="currency-amount">{formatStockQuantity(item)}</span>
                        </div>
                      </td>
                      <td className="text-center">{item.specification || '-'}</td>
                      <td className="price-cell">
                        {multi ? (
                          <div className="multi-price-wrap">
                            <button className={'multi-price-btn' + (expanded ? ' expanded' : '')} onClick={() => toggleVariants(Number(item.no))}
                              title={expanded ? '点击收起各单价明细' : '点击展开各单价明细'}>
                              <span className="mpp-text">{expanded ? '收起明细' : '多个单价'}</span>
                              {!expanded && <span className="mpp-count">({item.price_count})</span>}
                              <i className={'fas fa-chevron-' + (expanded ? 'up' : 'down')} />
                            </button>
                          </div>
                        ) : (
                          <div className="currency-display">
                            <span className="currency-symbol">RM</span>
                            <span className="currency-amount">{renderPriceRawTip(item)}</span>
                          </div>
                        )}
                      </td>
                      <td className="price-cell">
                        <div className={'currency-display ' + (price > 0 ? 'positive-value' : 'zero-value')}>
                          <span className="currency-symbol">RM</span>
                          <span className="currency-amount">{item.formatted_total_price}</span>
                        </div>
                      </td>
                    </tr>
                    {expanded && (item.price_variants || []).map((v, vi) => {
                      const vspec = (item.specification || '').trim().toLowerCase()
                      const vraw = parseFloat(String(v.stock))
                      const vStockStr = vspec === 'kilo'
                        ? (!isNaN(vraw) ? vraw.toFixed(3) : (v.formatted_stock || '0.000'))
                        : (v.formatted_stock || Number(v.stock).toFixed(2))
                      return (
                      <tr className="price-variant-subrow" key={'v' + vi}>
                        <td className="text-center"></td>
                        <td className="text-center pv-muted" title={(v.code_nos && v.code_nos.length > 1 ? '此单价由多个编号构成：' : '来源编号：') + ((v.code_nos && v.code_nos.join(' / ')) || '')}>{(v.code_nos && v.code_nos.length ? v.code_nos.join(' / ') : item.code_number) || '-'}</td>
                        <td><span className="pv-caret">└</span> {item.product_name}</td>
                        {showFridge && <td className="text-center pv-muted">-</td>}
                        <td className="stock-cell"><span className="pv-muted">-</span></td>
                        <td className="stock-cell">
                          <div className={'currency-display ' + (parseFloat(String(v.stock)) > 0 ? 'positive-value' : 'zero-value')}>
                            <span className="currency-symbol">&nbsp;</span>
                            <span className="currency-amount">{vStockStr}</span>
                          </div>
                        </td>
                        <td className="text-center pv-muted">{item.specification || '-'}</td>
                        <td className="price-cell">
                          <div className="currency-display">
                            <span className="currency-symbol">RM</span>
                            <span className="currency-amount">{v.formatted_price || Number(v.price).toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="price-cell">
                          <div className={'currency-display ' + (parseFloat(String(v.total_price)) > 0 ? 'positive-value' : 'zero-value')}>
                            <span className="currency-symbol">RM</span>
                            <span className="currency-amount">{v.formatted_total_price || Number(v.total_price).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                    </Fragment>
                  )
                })}
                {!loading[sys] && sysFiltered.length > 0 && (
                  <tr className="total-row">
                    <td colSpan={showFridge ? 8 : 7} className="text-right" style={{ textAlign: 'right', paddingRight: 15 }}>总计:</td>
                    <td className="price-cell">
                      <div className="currency-display">
                        <span className="currency-symbol">RM</span>
                        <span className="currency-amount" style={{ fontWeight: 700 }}>{fmtMoney(sysFiltered.reduce((s, it) => s + (parseFloat(String(it.total_price)) || 0), 0))}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stl-root">
      <div className="container">
        <div className="header">
          <div>
            <h1 id="page-title">总库存 - {SYSTEM_NAMES[system]}</h1>
          </div>
          <div className="controls">
            <div className="view-selector">
              <button className="selector-button" onClick={() => setViewOpen(!viewOpen)}>
                <span id="current-view">总库存</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className="selector-dropdown" id="view-selector-dropdown" style={{ display: viewOpen ? 'block' : 'none' }}>
                {Object.entries(VIEW_NAMES).map(([k, v]) => (
                  <div key={k} className={'dropdown-item' + (k === 'list' ? ' active' : '')} onClick={() => switchView(k)}>{v}</div>
                ))}
              </div>
            </div>
            <div className="system-selector">
              <button className="selector-button" onClick={() => setSysOpen(!sysOpen)}>
                <span id="current-system">{SYSTEM_NAMES[system]}</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className="selector-dropdown" id="selector-dropdown" style={{ display: sysOpen ? 'block' : 'none' }}>
                {(locked ? [] : (allowedSystems == null ? systems : systems.filter(s => allowedSystems.includes(s.key)))).map(s => (
                  <div key={s.key} className={'dropdown-item' + (s.key === system ? ' active' : '')} onClick={() => switchSystem(s.key)}>{s.label}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div id="alert-container"></div>

        {locked && (
          <div className="sio-perm-locked">
            <i className="fas fa-lock" /> 无权限访问：权限设定已关闭全部系统（中央/J1/J2/J3）。如需使用请联系管理员开通。
          </div>
        )}
        {!locked && systems.filter(s => allowedSystems == null || allowedSystems.includes(s.key)).map(s => renderSystemPage(s.key))}
      </div>

      {/* 改价历史弹窗：从旧到最新（对齐需求：8月28日2026 - RM xx） */}
      <Modal
        open={!!logModal}
        onCancel={() => setLogModal(null)}
        footer={null}
        title={<span>改价记录 — {logModal?.name}</span>}
        width={460}
      >
        {logModal?.loading && <div style={{ padding: '18px 0', color: '#6b7280' }}>加载中...</div>}
        {!logModal?.loading && (logModal?.entries.length || 0) === 0 && (
          <div style={{ padding: '18px 0', color: '#6b7280' }}>该货品暂无改价记录（在「货品种类」更改单价后会自动记录）</div>
        )}
        {!logModal?.loading && (logModal?.entries.length || 0) > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {(logModal?.entries || []).map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 2px', borderBottom: i < (logModal?.entries.length || 0) - 1 ? '1px dashed #e5e7eb' : 'none' }}>
                <span style={{ color: '#374151' }}>{fmtCn(e.changeDate)}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  {e.oldPrice != null && <span style={{ color: '#9ca3af', fontSize: 12, textDecoration: 'line-through' }}>{fmtRm(e.oldPrice)}</span>}
                  <span style={{ fontWeight: 700, color: '#c2410c' }}>{fmtRm(e.newPrice)}</span>
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>共 {logModal?.entries.length} 条 · 从旧到最新</div>
          </div>
        )}
      </Modal>

      {/* 导出日期范围弹窗（对齐旧 live 系统：默认本月 + 快捷按钮 + 结束日期必填） */}
      <Modal open={!!exportModal} onCancel={() => setExportModal(null)} footer={null} width={460} centered
        title={<span style={{ fontSize: 16 }}>选择导出日期范围与类型</span>}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {[['today', '今天'], ['this_month', '本月'], ['last_month', '上月'], ['all', '全部']].map(([k, label]) => (
            <button key={k} onClick={() => quickSetDate(k)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                border: '1.5px solid ' + (expQuick === k ? '#ff5c00' : '#d1d5db'),
                background: expQuick === k ? '#fff0e6' : '#fff',
                color: expQuick === k ? '#c2410c' : '#374151',
                fontWeight: expQuick === k ? 700 : 500,
                transition: 'all 0.15s',
              }}>{label}</button>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>导出类型（可多选，默认全选）</span>
            <button onClick={() => exportModal && setExpTypes(new Set(allExportTypes(exportModal.sys)))}
              style={{ border: 'none', background: 'none', color: '#ff5c00', fontSize: 12.5, cursor: 'pointer', fontWeight: 600, padding: 0 }}>全选</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(exportModal ? allExportTypes(exportModal.sys) : []).map(t => (
              <button key={t} onClick={() => toggleExpType(t)}
                style={{
                  padding: '7px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5,
                  border: '1.5px solid ' + (expTypes.has(t) ? '#ff5c00' : '#d1d5db'),
                  background: expTypes.has(t) ? '#fff0e6' : '#fff',
                  color: expTypes.has(t) ? '#c2410c' : '#374151',
                  fontWeight: expTypes.has(t) ? 700 : 500,
                  transition: 'all 0.15s',
                }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#374151' }}>
            <span style={{ width: 64 }}>开始日期</span>
            <input type="date" max={isoToday()} value={expStart}
              onChange={(e) => { setExpStart(e.target.value); setExpQuick('') }}
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#374151' }}>
            <span style={{ width: 64 }}>结束日期</span>
            <input type="date" max={isoToday()} value={expEnd}
              onChange={(e) => { setExpEnd(e.target.value); setExpQuick('') }}
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 14 }} />
          </label>
        </div>
        <div style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 16, lineHeight: 1.6 }}>
          库存为累积计算：导出的是截至结束日期的库存余额；选开始日期时 PDF 会标注日期范围；类型只勾选部分时 PDF 会标注 Types
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setExportModal(null)}
            style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}>取消</button>
          <button disabled={exporting} onClick={confirmExport}
            style={{ padding: '9px 24px', borderRadius: 10, border: 'none', background: '#ff5c00', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            {exporting ? '导出中...' : '确认导出'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
