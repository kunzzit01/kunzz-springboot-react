import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStockSummary, getMinimums } from '../api'
import { useRealtime } from '../utils/useRealtime'
import '../styles/stocklist.css'

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
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [lowStock, setLowStock] = useState<Record<string, Record<string, number>>>({})
  const [searchExpanded, setSearchExpanded] = useState<Record<string, boolean>>({})
  const searchRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const navigate = useNavigate()

  useRawPriceTooltip()

  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

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

  // 过滤后的行（搜索 + 类型）
  const filtered = useMemo(() => {
    const d = data[system]
    if (!d) return []
    const kw = (filters[system] || '').toLowerCase()
    const sel = typeSel[system] || new Set<string>()
    return d.summary.filter(item => {
      const itemType = normalizeItemType(item.type)
      if (sel.size > 0 && !sel.has(itemType)) return false
      if (!kw) return true
      return (
        String(item.no || '').includes(kw) ||
        (item.product_name || '').toLowerCase().includes(kw) ||
        (item.code_number || '').toLowerCase().includes(kw) ||
        (item.specification || '').toLowerCase().includes(kw)
      )
    })
  }, [data, system, filters, typeSel])

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

  // 导出 PDF（对齐线上 stocklistall.js exportData -> generatePDF：标题/时间/记录数/日期/表头/列宽/最低库存/总计行/页脚 完全一致）
  const exportPDF = async (sys: string) => {
    let items = sys === system ? curFiltered : (data[sys]?.summary || [])
    if (items.length === 0) { showMsg('没有数据可导出', 'error'); return }
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

      // 截至日期（当前导出为页面数据，等同旧系统"全部/今天"场景）
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      doc.text(`As of Date: ${m}/${d}/${y}`, 14, 28)

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
    const d = data[sys]
    const isCentral = sys === 'central'
    const cards = typeCards[sys] || []
    const sel = typeSel[sys] || new Set<string>()
    // 8/24 修复：低库存按产品名汇总检测（名字不管价格），且各系统独立（只用本系统 summary 数据）
    const productTotals: Record<string, number> = {}
    ;(d?.summary || []).forEach((it) => {
      const name = (it.product_name || '').trim()
      productTotals[name] = (productTotals[name] || 0) + (parseFloat(String(it.total_stock)) || 0)
    })
    const sysFiltered = sys === system ? curFiltered : (d ? d.summary.filter(it => {
      const kw = (filters[sys] || '').toLowerCase()
      if (!kw) return true
      return (it.product_name || '').toLowerCase().includes(kw) || (it.code_number || '').toLowerCase().includes(kw)
    }) : [])
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
                  {cards.filter(c => c.show).map(c => (
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
              cards.filter(c => c.show).map(c => (
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
                <i className="fas fa-search smartSearch-icon"></i>
                <input ref={(el) => { searchRefs.current[sys] = el }} type="text" id={sys + '-unified-filter'} className="smartSearch-input"
                  placeholder={isCentral ? '输入关键字搜索...' : sys === 'j1' ? '搜索序号、货品编号、货品、库存数量、规格、单价、总价...' : '搜索货品名称、编号或规格单位...'}
                  value={filters[sys] || ''} onChange={(e) => setFilters(prev => ({ ...prev, [sys]: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-warning btn-expand" onClick={() => exportPDF(sys)} title="导出数据">
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
                  <th>最低库存</th>
                  <th>{isCentral ? '库存数量' : '库存总量'}</th>
                  <th>规格</th>
                  <th>单价</th>
                  <th>总价</th>
                </tr>
              </thead>
              <tbody id={sys + '-stock-tbody'}>
                {loading[sys] && (
                  <tr><td colSpan={8} className="no-data" style={{ padding: 30, textAlign: 'center' }}>加载中...</td></tr>
                )}
                {!loading[sys] && sysFiltered.length === 0 && (
                  <tr><td colSpan={8} className="no-data">
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
                  return (
                    <tr key={idx} className={isLowStock ? 'low-stock-row' : ''}>
                      <td className="text-center">{idx + 1}</td>
                      <td className="text-center">{item.code_number || '-'}</td>
                      <td><strong>{item.product_name}</strong></td>
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
                        <div className="currency-display">
                          <span className="currency-symbol">RM</span>
                          <span className="currency-amount">{renderPriceRawTip(item)}</span>
                        </div>
                      </td>
                      <td className="price-cell">
                        <div className={'currency-display ' + (price > 0 ? 'positive-value' : 'zero-value')}>
                          <span className="currency-symbol">RM</span>
                          <span className="currency-amount">{item.formatted_total_price}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!loading[sys] && sysFiltered.length > 0 && (
                  <tr className="total-row">
                    <td colSpan={7} className="text-right" style={{ textAlign: 'right', paddingRight: 15 }}>总计:</td>
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
                {systems.map(s => (
                  <div key={s.key} className={'dropdown-item' + (s.key === system ? ' active' : '')} onClick={() => switchSystem(s.key)}>{s.label}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div id="alert-container"></div>

        {systems.map(s => renderSystemPage(s.key))}
      </div>

      {toast && (
        <div className="toast-container" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 10000 }}>
          <div className={'toast show toast-' + toast.type}>
            <span className="toast-icon">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : toast.type === 'info' ? 'ℹ' : '⚠'}</span>
            <span className="toast-content">{toast.msg}</span>
            <span className="toast-progress"></span>
          </div>
        </div>
      )}
    </div>
  )
}
