import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStockRemarkAnalysis } from '../api'
import type { RemarkProduct, RemarkVariant } from '../api'
import '../styles/stockremark.css'

/** 货品备注：对齐线上 stockremark?system=central（stockremark.php + stockremark.js + stockremark.css） */
const VIEW_NAMES: Record<string, string> = { list: '总库存', records: '进出货', remark: '货品备注', product: '货品种类', sot: '货品异常' }

const SYSTEM_NAMES: Record<string, string> = { central: '中央', j1: 'J1', j2: 'J2', j3: 'J3' }

export default function RemarkAnalysis() {
  const navigate = useNavigate()
  // 从 URL 读取系统（对齐 ?system=central）
  const urlSystem = new URL(window.location.href).searchParams.get('system')
  const system = urlSystem && SYSTEM_NAMES[urlSystem] ? urlSystem : 'central'
  const [viewOpen, setViewOpen] = useState(false)
  const [products, setProducts] = useState<RemarkProduct[]>([])
  const [filtered, setFiltered] = useState<RemarkProduct[]>([])
  const [kw, setKw] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [showTop, setShowTop] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 固定排序顺序（对齐线上 sortProducts）
  const sortProducts = useCallback((list: RemarkProduct[]) => {
    const order = [
      'salmon', 'salmon belly 10pcs', 'salmon head 10pcs', 'salmon belly 10pcs (p)',
      'salmon head 10pcs (p)', 'hamachi fillet mika', 'a5 awagyu', 'maguro blue fin',
    ]
    const idx = (name: string) => {
      const n = (name || '').toLowerCase().trim()
      // 从长到短匹配，更具体的名称优先
      for (let i = order.length - 1; i >= 0; i--) {
        if (n.includes(order[i])) return i
      }
      return -1
    }
    return [...list].sort((a, b) => {
      const ia = idx(a.product_name || '')
      const ib = idx(b.product_name || '')
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return (a.product_name || '').localeCompare(b.product_name || '')
    })
  }, [])

  const load = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const d = await getStockRemarkAnalysis()
      const sorted = sortProducts(d.products || [])
      setProducts(sorted)
      setFiltered(sorted)
      if (sorted.length === 0) showMsg('当前没有发现多价格货品', 'info')
      else showMsg(`发现 ${sorted.length} 个货品有多个价格`, 'success')
    } catch {
      setProducts([])
      setFiltered([])
      showMsg('获取数据失败，请检查连接', 'error')
    } finally {
      setLoading(false)
    }
  }, [loading, sortProducts])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 10 分钟自动刷新（对齐线上）
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load() }, 600000)
    return () => clearInterval(t)
  }, [load])

  // 防抖搜索（对齐线上 300ms）
  const search = (v: string) => {
    setKw(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      const q = v.toLowerCase()
      setFiltered(q ? products.filter(p => (p.product_name || '').toLowerCase().includes(q)) : [...products])
    }, 300)
  }
  const reset = () => {
    setKw('')
    if (searchTimer.current) clearTimeout(searchTimer.current)
    setFiltered([...products])
    showMsg('搜索条件已重置', 'info')
  }

  // 备注编号自然排序（SA-9 < SA-10）
  const naturalSort = (a: string, b: string) => {
    const pa = a.match(/(\d+|\D+)/g) || []
    const pb = b.match(/(\d+|\D+)/g) || []
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const ca = pa[i] || ''
      const cb = pb[i] || ''
      if (/^\d+$/.test(ca) && /^\d+$/.test(cb)) {
        const diff = parseInt(ca, 10) - parseInt(cb, 10)
        if (diff !== 0) return diff
      } else {
        const c = ca.localeCompare(cb, 'zh-CN', { numeric: true })
        if (c !== 0) return c
      }
    }
    return 0
  }

  // 卡片统计（对齐线上：kilo 显示总量；SALMON BELLY/HEAD 10PCS 显示 数量*10；否则只显示总数）
  const statsOf = (p: RemarkProduct) => {
    const hasKilo = (p.variants || []).some(v => {
      const s = (v.specification || '').toLowerCase()
      return s.includes('kilo') || s.includes('kg')
    })
    const name = (p.product_name || '').toLowerCase().trim()
    const needsPieces = name === 'salmon belly 10pcs' || name === 'salmon head 10pcs'
    if (hasKilo) {
      return <div className="card-stats"><span><span className="card-stats-icon">#</span> 总数: {(p.variants || []).length}</span><span><span className="card-stats-icon">⚖️</span> 总量: {p.total_quantity}</span></div>
    }
    if (needsPieces) {
      return <div className="card-stats"><span><span className="card-stats-icon">#</span> 总数: {(p.variants || []).length}</span><span><span className="card-stats-icon">📦</span> 总量: {(p.variants || []).length * 10}</span></div>
    }
    return <div className="card-stats"><span><span className="card-stats-icon">#</span> 总数: {(p.variants || []).length}</span></div>
  }

  // CSV 导出（对齐线上 exportData：Product Name, Rank, Code Number, Stock, Unit Price）
  const exportCSV = () => {
    if (filtered.length === 0) { showMsg('没有数据可导出', 'error'); return }
    const headers = ['Product Name', 'Rank', 'Code Number', 'Stock', 'Unit Price']
    let csv = headers.join(',') + '\n'
    filtered.forEach(p => {
      (p.variants || []).forEach((v, i) => {
        const row = [`"${p.product_name || ''}"`, i + 1, v.code_number || '', v.formatted_quantity ?? String(v.current_stock ?? ''), v.formatted_price || String(v.price ?? '')]
        csv += row.join(',') + '\n'
      })
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stock_price_analysis_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    showMsg('数据导出成功', 'success')
  }

  // 快捷键：Ctrl+F 聚焦搜索，Esc 重置（对齐线上）
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); inputRef.current?.focus() }
      if (e.key === 'Escape') reset()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  // 回到顶部按钮（滚动 >150px 显示，对齐线上）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setShowTop(window.pageYOffset > 150), 10)
    }
    window.addEventListener('scroll', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [])

  // 卡片任意位置滚动表格：鼠标在卡片上时始终拦截页面滚动（对齐线上 wheel handler）
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const card = (e.target as HTMLElement)?.closest('.product-group')
      if (!card) return
      const wrapper = card.querySelector('.table-wrapper')
      if (!wrapper) return
      e.preventDefault()
      wrapper.scrollTop += e.deltaY
    }
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])

  // 点击外部关闭视图下拉（对齐线上 document click handler）
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (viewOpen && !(e.target as HTMLElement)?.closest('.view-selector')) setViewOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [viewOpen])

  return (
    <div className="remark-page">
      <div className="remark-header">
        <h1>货品备注</h1>
        <div className="remark-controls">
          <div className="remark-search">
            <i className="fas fa-search" />
            <input
              ref={inputRef}
              placeholder="输入关键字搜索..."
              value={kw}
              onChange={(e) => search(e.target.value)}
            />
          </div>
          <div className="view-selector">
            <button className="selector-button" onClick={() => setViewOpen(!viewOpen)}>
              <span id="current-view">货品备注</span>
              <i className="fas fa-chevron-down" />
            </button>
            <div className={'selector-dropdown' + (viewOpen ? ' show' : '')}>
              {Object.entries(VIEW_NAMES).map(([k, v]) => (
                <div key={k} className={'dropdown-item' + (k === 'remark' ? ' active' : '')}
                  onClick={() => {
                    setViewOpen(false)
                    if (k === 'list') navigate('/records?system=' + system)
                    else if (k === 'records') navigate('/inout?system=' + system)
                    else if (k === 'product') navigate('/products?system=' + system)
                    else if (k === 'sot') navigate('/sot')
                  }}>{v}</div>
              ))}
            </div>
          </div>
          <button className="selector-button" style={{ justifyContent: 'center' }}>
            <span id="current-stock-type">{SYSTEM_NAMES[system] || '中央'}</span>
          </button>
        </div>
      </div>

      {loading && filtered.length === 0 ? (
        <div className="remark-loading">
          <div className="loading" />
          <div style={{ marginTop: 16 }}>正在分析库存价格数据...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-search" />
          <h3>没有找到货品备注</h3>
          <p>当前筛选条件下没有发现已标记备注的货品</p>
        </div>
      ) : (
        <div className="products-grid">
          {filtered.map((p) => {
            const sortedVariants = [...(p.variants || [])].sort((a, b) =>
              naturalSort(a.remark_number || '', b.remark_number || ''))
            return (
              <div key={p.product_name} className="product-group">
                <div className="product-header">
                  <div className="product-info-item">
                    <div>{p.product_name}</div>
                    {statsOf(p)}
                  </div>
                </div>
                <div className="product-table-container">
                  <div className="table-wrapper">
                    <table className="price-variants-table">
                      <thead>
                        <tr>
                          <th>备注编号</th>
                          <th>数量/重量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedVariants.map((v: RemarkVariant, i: number) => (
                          <tr key={v.remark_number || i}>
                            <td>{v.remark_number || '-'}</td>
                            <td>{v.formatted_quantity ?? String(v.current_stock ?? 0)} {v.specification || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button className={'back-to-top' + (showTop ? ' show' : '')} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="回到顶部">
        <i className="fas fa-chevron-up" />
      </button>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 10000,
          background: toast.type === 'error' ? '#dc2626' : toast.type === 'info' ? '#2563eb' : '#059669',
          color: '#fff', padding: '10px 20px', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,.2)',
        }}>{toast.msg}</div>
      )}
    </div>
  )
}
