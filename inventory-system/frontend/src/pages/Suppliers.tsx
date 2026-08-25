import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getPriceCompare, getSuppliers, createSupplier, deleteSupplier,
  createSupplierMaterial, updateSupplierMaterial, deleteSupplierMaterial,
} from '../api'
import type { PriceCompareData, PriceCompareRow } from '../api'
import '../styles/supply.css'

/** 批量新增的可编辑行 */
interface NewRow { name: string; type: string; prices: Record<string, string> }

/** 批发商价格对比：对齐线上 supply 页面 */
export default function Suppliers() {
  const navigate = useNavigate()
  const [modeOpen, setModeOpen] = useState(false)
  const [colOpen, setColOpen] = useState(false)
  const [data, setData] = useState<PriceCompareData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selCol, setSelCol] = useState<number | null>(null) // null = 总览
  const [typeFilter, setTypeFilter] = useState('')
  const [kw, setKw] = useState('')

  // 新增批发商 modal
  const [showAddEntity, setShowAddEntity] = useState(false)
  const [entities, setEntities] = useState<{ id: number; label: string }[]>([])
  const [newName, setNewName] = useState('')

  // 批量新增行
  const [showAddRows, setShowAddRows] = useState(false)
  const [rowsCount, setRowsCount] = useState(1)
  const [defaultType, setDefaultType] = useState('')
  const [newRows, setNewRows] = useState<NewRow[]>([])

  // 批量删除
  const [batchMode, setBatchMode] = useState(false)
  const [batchSel, setBatchSel] = useState<Set<number>>(new Set())

  // 行内编辑
  const [editRow, setEditRow] = useState<number | null>(null)
  const [editPrices, setEditPrices] = useState<Record<string, string>>({})

  // 新增后高亮定位
  const [highlightName, setHighlightName] = useState<string | null>(null)
  const highlightTimer = useRef<any>(null)

  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const showMsg = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ---------- 数据加载 ----------
  const load = () => {
    setLoading(true)
    return getPriceCompare('supplier')
      .then((d) => {
        setData(d)
        setSelCol(null); setTypeFilter(''); setKw('')
        setNewRows([]); setBatchMode(false); setBatchSel(new Set()); setEditRow(null)
      })
      .catch(() => showMsg('加载失败，请重试', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  // 点击页面其他区域时关闭展开的选择器
  useEffect(() => {
    const close = () => { setModeOpen(false); setColOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    if (!showAddEntity) return
    getSuppliers().then((ss) => setEntities(ss.map((s) => ({ id: s.id, label: s.name || '#' + s.id })))).catch(() => {})
  }, [showAddEntity])

  // ---------- 过滤 ----------
  const filtered = useMemo(() => {
    if (!data) return []
    const k = kw.trim().toLowerCase()
    return data.rows.filter((row) => {
      if (typeFilter && row.type !== typeFilter) return false
      if (k && !row.name.toLowerCase().includes(k)) return false
      if (selCol !== null && !row.cells[String(selCol)]) return false
      return true
    })
  }, [data, typeFilter, kw, selCol])

  const visibleCols = data?.columns || []

  // ---------- 高亮 ----------
  const cellClass = (row: PriceCompareRow, colId: string): string => {
    const prices = Object.values(row.cells)
      .map((c) => c?.price)
      .filter((p): p is number => p != null && !isNaN(Number(p)))
    const price = row.cells[colId]?.price
    if (price == null) return ''
    if (prices.length <= 1) return ' restaurant-exclusive'
    const num = Number(price)
    if (num === Math.min(...prices.map(Number))) return ' lowest-price'
    if (num === Math.max(...prices.map(Number))) return ' highest-price'
    return ''
  }

  // ---------- CRUD ----------
  const saveCell = async (colId: string, cell: { id: number } | undefined, payload: Record<string, unknown>) => {
    if (cell) await updateSupplierMaterial(cell.id, payload)
    else await createSupplierMaterial(Number(colId), payload)
  }
  const deleteCell = async (cellId: number) => { await deleteSupplierMaterial(cellId) }

  // 新增批发商
  const saveEntity = async () => {
    if (saving) return
    const n = newName.trim().toUpperCase()
    if (!n) { showMsg('请填写批发商名称', 'error'); return }
    setSaving(true)
    try {
      await createSupplier(n)
      showMsg('批发商已新增')
      setNewName(''); setShowAddEntity(false)
      load()
    } catch { showMsg('保存失败', 'error') }
    finally { setSaving(false) }
  }
  const removeEntity = async (id: number) => {
    const s = entities.find((e) => e.id === id)
    if (!window.confirm('确定删除批发商「' + (s?.label || id) + '」及其全部物料？')) return
    try {
      await deleteSupplier(id)
      setEntities((prev) => prev.filter((e) => e.id !== id))
      showMsg('已删除')
      load()
    } catch { showMsg('删除失败', 'error') }
  }

  // 批量新增行
  const createRows = () => {
    const n = Math.min(Math.max(rowsCount || 1, 1), 100)
    setNewRows(Array.from({ length: n }, () => ({ name: '', type: defaultType, prices: {} })))
    setShowAddRows(false)
    // 创建空行后自动滚动到待填写位置
    setTimeout(() => {
      const sc = document.querySelector('.table-scroll-container')
      const newRow = document.querySelector('.price-table tbody tr.new-row')
      const thH = ((document.querySelector('.price-table thead') as HTMLElement | null)?.offsetHeight) || 40
      if (sc && newRow) {
        sc.scrollTop = Math.max(0, (newRow as HTMLElement).offsetTop - thH - 8)
      }
    }, 200)
  }
  const setNewRowPrice = (ri: number, colId: string, v: string) =>
    setNewRows((prev) => prev.map((r, i) => (i === ri ? { ...r, prices: { ...r.prices, [colId]: v } } : r)))
  const saveNewRows = async () => {
    if (saving) return
    const rows = newRows.filter((r) => r.name.trim())
    if (!rows.length) { showMsg('没有可保存的行', 'error'); return }
    setSaving(true)
    try {
      const savedNames = rows.map((r) => r.name.trim().toUpperCase())
      for (const r of rows) {
        const name = r.name.trim()
        for (const col of visibleCols) {
          const v = r.prices[String(col.id)]
          if (!v) continue
          await saveCell(String(col.id), undefined, { materialName: name, materialType: r.type || null, price: Number(v) })
        }
      }
      showMsg('已保存 ' + rows.length + ' 行')
      setNewRows([])
      await load()
      // 自动滚动到第一条新行并高亮（DOM 查找，避免闭包旧数据）
      setTimeout(() => {
        const sc = document.querySelector('.table-scroll-container')
        const rowsEl = document.querySelectorAll('.price-table tbody tr')
        const thH = ((document.querySelector('.price-table thead') as HTMLElement | null)?.offsetHeight) || 40
        let targetIdx = -1
        for (let i = 0; i < rowsEl.length; i++) {
          const td = rowsEl[i].querySelector('td:nth-child(2)')
          if (td && savedNames.includes((td.textContent || '').trim().toUpperCase())) { targetIdx = i; break }
        }
        if (sc && targetIdx >= 0) {
          sc.scrollTop = Math.max(0, (rowsEl[targetIdx] as HTMLElement).offsetTop - thH - 8)
        }
        setHighlightName(savedNames[0])
        if (highlightTimer.current) clearTimeout(highlightTimer.current)
        highlightTimer.current = setTimeout(() => setHighlightName(null), 3000)
      }, 200)
    } catch { showMsg('批量保存失败', 'error') }
    finally { setSaving(false) }
  }

  // 批量删除
  const toggleBatch = (idx: number) =>
    setBatchSel((prev) => {
      const n = new Set(prev)
      if (n.has(idx)) n.delete(idx); else n.add(idx)
      return n
    })
  const confirmBatchDelete = async () => {
    if (!batchSel.size) { showMsg('请先勾选要删除的行', 'error'); return }
    if (!window.confirm('确定删除选中的 ' + batchSel.size + ' 行全部价格记录？')) return
    try {
      for (const idx of batchSel) {
        const row = filtered[idx]
        if (!row) continue
        for (const cell of Object.values(row.cells)) {
          if (cell?.id) await deleteCell(cell.id)
        }
      }
      showMsg('已删除 ' + batchSel.size + ' 行')
      setBatchMode(false); setBatchSel(new Set())
      load()
    } catch { showMsg('批量删除失败', 'error') }
  }

  // 行内编辑
  const startEdit = (rowIdx: number, row: PriceCompareRow) => {
    setEditRow(rowIdx)
    const prices: Record<string, string> = {}
    for (const col of visibleCols) {
      const cell = row.cells[String(col.id)]
      prices[String(col.id)] = cell ? String(cell.price) : ''
    }
    setEditPrices(prices)
  }
  const saveEdit = async (row: PriceCompareRow) => {
    if (saving) return
    setSaving(true)
    try {
      for (const col of visibleCols) {
        const v = editPrices[String(col.id)]
        const cell = row.cells[String(col.id)]
        if (v === undefined || v === '') continue
        await saveCell(String(col.id), cell, { materialName: row.name, materialType: row.type || null, price: Number(v) })
      }
      showMsg('已保存')
      setEditRow(null)
      load()
    } catch { showMsg('保存失败', 'error') }
    finally { setSaving(false) }
  }
  const deleteRow = async (row: PriceCompareRow) => {
    if (!window.confirm('确定删除「' + row.name + '」的全部价格记录？')) return
    try {
      for (const cell of Object.values(row.cells)) {
        if (cell?.id) await deleteCell(cell.id)
      }
      showMsg('已删除')
      load()
    } catch { showMsg('删除失败', 'error') }
  }

  // ---------- 渲染 ----------
  const colCount = 3 + visibleCols.length + 1

  return (
    <div className="supply-root">
      <div className="pr-header">
        <h1>批发商价格对比</h1>
        <div className="pr-header-right">
          {/* 对比模式选择器 */}
          <div className="restaurant-selector">
            <button className="selector-button" onClick={(e) => { e.stopPropagation(); setModeOpen(!modeOpen) }}>
              <span>批发商对比</span>
              <i className="fas fa-chevron-down"></i>
            </button>
            {modeOpen && (
              <div className="selector-dropdown show">
                <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setModeOpen(false); navigate('/price') }}>餐厅对比</div>
                <div className="dropdown-item active" onClick={(e) => { e.stopPropagation(); setModeOpen(false) }}>批发商对比</div>
              </div>
            )}
          </div>
          {/* 批发商选择器（总览 + 各批发商，展开式设计） */}
          <div className="restaurant-selector">
            <button className="selector-button" onClick={(e) => { e.stopPropagation(); setColOpen(!colOpen) }}>
              <span>{selCol === null ? '总览' : (visibleCols.find((c) => c.id === selCol)?.label || '总览')}</span>
              <i className="fas fa-chevron-down"></i>
            </button>
            {colOpen && (
              <div className="selector-dropdown show">
                <div className={'dropdown-item' + (selCol === null ? ' active' : '')}
                  onClick={(e) => { e.stopPropagation(); setSelCol(null); setColOpen(false) }}>总览（全部）</div>
                {visibleCols.map((c) => (
                  <div key={c.id} className={'dropdown-item' + (selCol === c.id ? ' active' : '')}
                    onClick={(e) => { e.stopPropagation(); setSelCol(c.id); setColOpen(false) }}>{c.label}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 筛选区 */}
      <div className="filter-section">
        <div className="filter-grid">
          <div className="filter-left">
            <div className="filter-group" style={{ flex: '0 0 150px' }}>
              <label>类型</label>
              <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">全部类型</option>
                {(data?.types || []).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="filter-group" style={{ flex: '0 0 200px' }}>
              <label>搜索</label>
              <div className="smart-search">
                <i className="fas fa-search"></i>
                <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="输入材料名称" />
              </div>
            </div>
          </div>
          <div className="filter-right">
            <button className="btn btn-success" onClick={() => setShowAddEntity(true)}>
              <i className="fas fa-store"></i> 新增批发商
            </button>
            <button className="btn btn-success" onClick={() => setShowAddRows(true)}>
              <i className="fas fa-plus"></i> 新增记录
            </button>
            {newRows.length > 0 && (
              <button className="btn btn-primary" onClick={saveNewRows} disabled={saving}>
                {saving ? <><i className="fas fa-spinner fa-spin"></i> 保存中...</> : <><i className="fas fa-save"></i> 批量保存 ({newRows.length})</>}
              </button>
            )}
            {!batchMode ? (
              <button className="btn btn-danger" onClick={() => { setBatchMode(true); setBatchSel(new Set()) }}>
                <i className="fas fa-trash-alt"></i> 批量删除
              </button>
            ) : (
              <>
                <button className="btn btn-success" disabled={!batchSel.size} onClick={confirmBatchDelete}>
                  <i className="fas fa-check"></i> 确认删除 ({batchSel.size})
                </button>
                <button className="btn btn-secondary" onClick={() => { setBatchMode(false); setBatchSel(new Set()) }}>
                  <i className="fas fa-times"></i> 取消
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="table-container">
        <div className="table-scroll-container">
          <table className="price-table">
            <thead>
              <tr>
                <th className="col-no">{batchMode ? '勾选' : '序号'}</th>
                <th className="col-name">材料名称</th>
                <th className="col-type">类型</th>
                {visibleCols.map((c) => (
                  <th key={c.id} className={'col-price' + (selCol === c.id ? ' highlighted' : '')}>{c.label}</th>
                ))}
                <th className="col-action">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={colCount} className="table-loading">加载中...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={colCount} className="table-loading">暂无数据</td></tr>}
              {filtered.map((row, idx) => {
                const isEditing = editRow === idx
                const isHighlight = !!highlightName && row.name.toUpperCase() === highlightName
                return (
                  <tr key={row.name} className={isEditing ? 'editing-row' : isHighlight ? 'highlight-flash' : ''}>
                    <td className="cell-no">
                      {batchMode ? (
                        <input type="checkbox" className="batch-select-checkbox"
                          checked={batchSel.has(idx)} onChange={() => toggleBatch(idx)} />
                      ) : (idx + 1)}
                    </td>
                    <td className="cell-name"><span className="cell-text">{row.name}</span></td>
                    <td className="cell-type"><span className="cell-text">{row.type || '-'}</span></td>
                    {visibleCols.map((c) => {
                      const cell = row.cells[String(c.id)]
                      if (isEditing) {
                        return (
                          <td key={c.id} className="price-cell">
                            <div className="currency-display">
                              <span className="currency-symbol">RM</span>
                              <input type="number" className="table-input" style={{ width: 80 }}
                                value={editPrices[String(c.id)] ?? ''}
                                onChange={(e) => setEditPrices((prev) => ({ ...prev, [String(c.id)]: e.target.value }))}
                                placeholder="-" />
                            </div>
                          </td>
                        )
                      }
                      return (
                        <td key={c.id} className={'price-cell' + cellClass(row, String(c.id))}>
                          {cell ? (
                            <div className="currency-display">
                              <span className="currency-symbol">RM</span>
                              <span className="currency-amount">{Number(cell.price).toFixed(2)}</span>
                            </div>
                          ) : (
                            <span className="empty-price">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="action-cell">
                      {!isEditing ? (
                        <>
                          <button className="action-btn edit-btn" title="编辑" onClick={() => startEdit(idx, row)}>
                            <i className="fas fa-edit"></i>
                          </button>
                          <button className="action-btn delete-btn" title="删除" onClick={() => deleteRow(row)}>
                            <i className="fas fa-trash"></i>
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="action-btn save-btn" title={saving ? '保存中...' : '保存'} onClick={() => saveEdit(row)} disabled={saving}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-save')} /></button>
                          <button className="action-btn delete-btn" title="取消" onClick={() => setEditRow(null)}>
                            <i className="fas fa-times"></i>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
              {/* 批量新增行 */}
              {newRows.map((r, ri) => (
                <tr key={'new' + ri} className="new-row">
                  <td className="cell-no"><i className="fas fa-plus" style={{ color: '#10b981' }}></i></td>
                  <td className="cell-name">
                    <input className="table-input" placeholder="材料名称" value={r.name}
                      onChange={(e) => setNewRows((prev) => prev.map((x, i) => (i === ri ? { ...x, name: e.target.value.toUpperCase() } : x)))} />
                  </td>
                  <td className="cell-type">
                    <select className="table-select" value={r.type} onChange={(e) => setNewRows((prev) => prev.map((x, i) => (i === ri ? { ...x, type: e.target.value } : x)))}>
                      <option value="">类型</option>
                      {(data?.types || []).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  {visibleCols.map((c) => (
                    <td key={c.id} className="price-cell">
                      <div className="currency-display">
                        <span className="currency-symbol">RM</span>
                        <input type="number" className="table-input" style={{ width: 80 }} placeholder="-"
                          value={r.prices[String(c.id)] || ''}
                          onChange={(e) => setNewRowPrice(ri, String(c.id), e.target.value)} />
                      </div>
                    </td>
                  ))}
                  <td className="action-cell">
                    <button className="action-btn delete-btn" title="移除" onClick={() => setNewRows((prev) => prev.filter((_, i) => i !== ri))}>
                      <i className="fas fa-times"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="stats-bar">
          <span>共 <span className="stat-value">{filtered.length}</span> 项材料 · <span className="stat-value">{visibleCols.length}</span> 个批发商</span>
          <span>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#fff2cc', border: '1px solid #e6cc80', marginRight: 4 }}></span>最低价
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#b6d7a8', border: '1px solid #8fb980', margin: '0 4px 0 14px' }}></span>最高价
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#a4c2f4', border: '1px solid #7f9fd6', margin: '0 4px 0 14px' }}></span>批发商独有
          </span>
        </div>
      </div>

      {/* 新增批发商 modal */}
      {showAddEntity && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddEntity(false) }}>
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">新增批发商</h3>
              <button className="modal-close" onClick={() => setShowAddEntity(false)}>&times;</button>
            </div>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>批发商名称 *</label>
                <input className="form-input" placeholder="输入批发商名称..." value={newName}
                  onChange={(e) => setNewName(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
              </div>
            </div>
            <div className="existing-restaurants">
              <div className="section-title">已存在批发商</div>
              <div className="restaurant-list">
                {entities.length === 0 && <div className="empty-placeholder">暂无</div>}
                {entities.map((e) => (
                  <div key={e.id} className="restaurant-item">
                    <div className="restaurant-names">
                      <span className="restaurant-name-cn">{e.label}</span>
                    </div>
                    <button className="restaurant-delete-btn" onClick={() => removeEntity(e.id)}>
                      <i className="fas fa-trash"></i> 删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal btn-modal-secondary" onClick={() => setShowAddEntity(false)}>取消</button>
              <button className="btn-modal btn-modal-primary" onClick={saveEntity} disabled={saving}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-save')}></i> 保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 新增行数 modal */}
      {showAddRows && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddRows(false) }}>
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">新增记录</h3>
              <button className="modal-close" onClick={() => setShowAddRows(false)}>&times;</button>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>要创建的行数 *</label>
                <input type="number" className="form-input" min={1} max={100} value={rowsCount}
                  onChange={(e) => setRowsCount(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>默认类型（可选）</label>
                <select className="form-select" value={defaultType} onChange={(e) => setDefaultType(e.target.value)}>
                  <option value="">请选择类型</option>
                  {(data?.types || []).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal btn-modal-secondary" onClick={() => setShowAddRows(false)}>取消</button>
              <button className="btn-modal btn-modal-primary" onClick={createRows}><i className="fas fa-plus"></i> 创建记录</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 10001 }}>
          <div className={'toast toast-' + toast.type}>
            <i className={'fas ' + (toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle')}></i>
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  )
}
