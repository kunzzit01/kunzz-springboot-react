import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMinimumProducts, saveMinimum, saveMinimumBatch } from '../api'
import '../styles/settings.css'

/** 最低库存设置（对齐线上 stockminimum.php：按系统列出全部在库货品，行内/批量保存） */
const SYSTEMS = [
  { key: 'central', label: '中央', icon: 'fa-warehouse' },
  { key: 'j1', label: 'J1', icon: 'fa-store' },
  { key: 'j2', label: 'J2', icon: 'fa-store' },
  { key: 'j3', label: 'J3', icon: 'fa-store' },
]
const SYSTEM_NAMES: Record<string, string> = { central: '中央', j1: 'J1', j2: 'J2', j3: 'J3' }

interface MinProduct {
  no?: number
  product_name?: string
  product_code?: string
  specification?: string
  minimum_quantity?: number
  current_stock?: number
}

export default function Settings() {
  const navigate = useNavigate()
  const urlSystem = new URL(window.location.href).searchParams.get('system')
  const [system, setSystem] = useState(urlSystem && SYSTEMS.some((s) => s.key === urlSystem) ? urlSystem : 'central')

  const [allProducts, setAllProducts] = useState<MinProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('') // 输入值（防抖 200ms）
  const searchRef = useRef('') // 同步最新搜索词（供 load 完成后立即过滤）
  searchRef.current = searchTerm
  const [filtered, setFiltered] = useState<MinProduct[]>([])
  // 未保存的变更：product_name -> minimum_quantity
  const [pending, setPending] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [savingRow, setSavingRow] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)

  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ---- 加载某系统全部在库货品（带竞态保护：快速切换系统时丢弃过期响应） ----
  const loadSeq = useRef(0)
  const applyFilter = (list: MinProduct[], term: string) => {
    const t = (term || '').toLowerCase().trim()
    if (!t) return [...list]
    return list.filter((p) =>
      (p.product_name || '').toLowerCase().includes(t) ||
      (p.product_code && p.product_code !== '-' && p.product_code.toLowerCase().includes(t)))
  }
  const load = async (sys: string) => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const list = await getMinimumProducts(sys)
      if (seq !== loadSeq.current) return // 过期响应丢弃
      const mapped = (list || []).map((p) => ({ ...p, product_name: (p.product_name || '').trim(), product_code: (p.product_code || '').trim(), minimum_quantity: Number(p.minimum_quantity) || 0 }))
      setAllProducts(mapped)
      setFiltered(applyFilter(mapped, searchRef.current)) // 立即填充，避免空态闪烁
    } catch { /* 拦截器已提示 */ if (seq !== loadSeq.current) return }
    if (seq === loadSeq.current) setLoading(false)
  }
  useEffect(() => { load(system) }, [])

  // ---- 实时搜索（防抖 200ms，对齐线上 setupRealTimeSearch） ----
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltered(applyFilter(allProducts, searchTerm))
    }, 200)
    return () => clearTimeout(t)
  }, [searchTerm, allProducts])

  // ---- 切换系统（Tab，对齐线上 switchSystem） ----
  const switchSystem = (sys: string) => {
    if (sys === system) return
    setSystem(sys)
    const u = new URL(window.location.href)
    u.searchParams.set('system', sys)
    window.history.replaceState({}, '', u)
    setSearchTerm('')
    searchRef.current = ''
    setPending({}) // 清空未保存变更（对齐线上）
    setAllProducts([]) // 立即清空旧系统数据，避免加载期间残留上个系统的货品
    setFiltered([])
    load(sys)
  }

  // ---- 修改最低库存：更新本地数据 + 标记未保存 ----
  const onQtyChange = (name: string, v: string) => {
    const qty = parseFloat(v) || 0
    setAllProducts((prev) => prev.map((p) => (p.product_name === name ? { ...p, minimum_quantity: qty } : p)))
    setPending((prev) => ({ ...prev, [name]: qty }))
  }

  // ---- 保存单条（行内保存按钮，对齐线上 saveIndividualSetting；各系统设置独立） ----
  const saveOne = async (name: string) => {
    const qty = allProducts.find((p) => p.product_name === name)?.minimum_quantity ?? 0
    setSavingRow(name)
    try {
      await saveMinimum(system, name, qty)
      setPending((prev) => { const n = { ...prev }; delete n[name]; return n })
      showMsg(`已保存：${name}`)
    } catch { /* 拦截器已提示 */ }
    setSavingRow(null)
  }

  // ---- 批量保存所有未保存变更（对齐线上 saveAllSettings；各系统设置独立） ----
  const saveAll = async () => {
    const entries = Object.entries(pending)
    if (entries.length === 0) { showMsg('没有未保存的更改', 'info'); return }
    setSaving(true)
    try {
      await saveMinimumBatch(system, entries.map(([product_name, minimum_quantity]) => ({ product_name, minimum_quantity })))
      setPending({})
      showMsg(`成功保存 ${entries.length} 个货品设置`)
    } catch { /* 拦截器已提示 */ }
    setSaving(false)
  }

  // ---- Ctrl+S 批量保存（对齐线上键盘快捷键） ----
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveAll() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  // ---- 离开前提醒未保存更改（对齐线上 beforeunload） ----
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending).length > 0) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [pending])

  // ---- 返回库存管理（对齐线上 goBack） ----
  const goBack = () => {
    if (Object.keys(pending).length > 0 && !window.confirm('有未保存的更改，离开将丢失这些更改。确定要离开吗？')) return
    navigate('/records?system=' + system)
  }

  return (
    <div>
      {/* Header（对齐线上 header-left 标题 + header-right-group 返回按钮） */}
      <div className="min-page-header">
        <h1 id="page-title">最低库存设置 — {SYSTEM_NAMES[system]}</h1>
        <div className="min-header-right">
          <button className="btn btn-secondary" onClick={goBack}>
            <i className="fas fa-arrow-left" /> 返回库存管理
          </button>
        </div>
      </div>

      {/* Controls Bar：系统标签 + 搜索 + 批量保存（对齐线上 controls-bar） */}
      <div className="min-controls-bar">
        <div className="system-tabs">
          {SYSTEMS.map((s) => (
            <button key={s.key} className={'tab-btn' + (s.key === system ? ' active' : '')} onClick={() => switchSystem(s.key)}>
              <i className={'fas ' + s.icon} /> {s.label}
            </button>
          ))}
        </div>
        <div className="controls-right">
          <div className="search-wrapper">
            <i className="fas fa-search search-icon" />
            <input type="text" className="search-input" placeholder="搜索货品名称或编号..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button className="btn btn-warning" id="saveAllBtn" onClick={saveAll} disabled={saving || Object.keys(pending).length === 0}>
            <i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-save')} /> 批量保存{Object.keys(pending).length > 0 ? ` (${Object.keys(pending).length})` : ''}
          </button>
        </div>
      </div>

      {/* Table Container（对齐线上 table-container + settings-table） */}
      <div className="min-table-container">
        <div className="table-header">
          <h3 id="table-title">最低库存设置 — {SYSTEM_NAMES[system]}</h3>
          <div className="table-stats">
            显示 <span className="stat-value" id="displayed-count">{filtered.length}</span> 个货品
          </div>
        </div>
        <div className="table-scroll-container">
          <table className="settings-table" id="settings-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>货品编号</th>
                <th>货品名称</th>
                <th>规格</th>
                <th>最低库存数量</th>
                <th>当前总库存</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="settings-tbody">
              {loading && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                  <div className="min-loading" /> <div style={{ marginTop: 12 }}>正在加载 {SYSTEM_NAMES[system]} 货品数据...</div>
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="no-data"><i className="fas fa-inbox" /><div>暂无货品数据</div></td></tr>
              )}
              {!loading && filtered.map((p) => {
                // 低库存判定：总库存（合并后）< 设置值(>0) → 高亮提示（与低库存通知口径一致）
                const low = Number(p.minimum_quantity) > 0 && Number(p.current_stock ?? 0) < Number(p.minimum_quantity)
                return (
                <tr key={system + '|' + (p.product_name || '')} className={low ? 'min-low-row' : ''}>
                  <td className="text-center no-col">{p.no || ''}</td>
                  <td className="code-cell text-center">{p.product_code || '-'}</td>
                  <td className="product-name-cell"><strong>{p.product_name}</strong></td>
                  <td className="text-center spec-cell">{p.specification || '-'}</td>
                  <td>
                    <input type="number" className="quantity-input" value={p.minimum_quantity ?? 0} min={0} step="0.01" placeholder="0"
                      onChange={(e) => onQtyChange(p.product_name || '', e.target.value)} />
                  </td>
                  <td className="text-center">
                    <span className={low ? 'min-stock-low' : 'min-stock-ok'}>{Number(p.current_stock ?? 0).toFixed(3)}</span>
                    {low && <span className="min-stock-badge">库存不足</span>}
                  </td>
                  <td className="text-center">
                    <button className="btn btn-primary btn-sm" disabled={savingRow === p.product_name}
                      onClick={() => saveOne(p.product_name || '')}>
                      <i className={'fas ' + (savingRow === p.product_name ? 'fa-spinner fa-spin' : 'fa-save')} /> 保存
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 10000, background: toast.type === 'error' ? '#fff2f0' : toast.type === 'info' ? '#e6f4ff' : '#f6ffed', border: '1px solid ' + (toast.type === 'error' ? '#ffccc7' : toast.type === 'info' ? '#91caff' : '#b7eb8f'), padding: '10px 16px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.12)', fontSize: 13 }}>
          <i className={'fas ' + (toast.type === 'error' ? 'fa-times-circle' : toast.type === 'info' ? 'fa-info-circle' : 'fa-check-circle')} style={{ marginRight: 6, color: toast.type === 'error' ? '#cf1322' : toast.type === 'info' ? '#1677ff' : '#389e0d' }} />
          {toast.msg}
        </div>
      )}
    </div>
  )
}
