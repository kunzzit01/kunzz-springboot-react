import { useEffect, useMemo, useRef, useState } from 'react'
import { createDishwareBreak, deleteDishwareBreak, getDishwareBreaks, getDishwareStock, updateDishwareBreak } from '../api'
import { flashAfterRow, useRowHighlight } from '../utils/rowHighlight'
import type { DishwareBreak, DishwareStockVO } from '../types'
import DishwareViewSelector from '../components/DishwareViewSelector'
import '../styles/dishware.css'
import ModalClose from '../components/ModalClose'

/**
 * 破损记录独立页面（http://localhost:5174/dishware_break）
 * 对齐旧系统 dishware_stock?tab=j1：年月选择器 + 快速选择 + 餐厅筛选 + 三店卡片表格
 */
export default function DishwareBreakPage() {
  // ---------- 数据 ----------
  const [rows, setRows] = useState<DishwareStockVO[]>([])
  // 新增后定位高亮（按编号）
  const { flash, isHl } = useRowHighlight((b: any) =>
    String((rows.find((r) => r.dishwareId === b.dishwareId)?.codeNumber) || '#' + b.dishwareId))
  const [breaks, setBreaks] = useState<DishwareBreak[]>([])
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }
  const load = async () => {
    try {
      const [s, b] = await Promise.all([getDishwareStock(), getDishwareBreaks()])
      setRows(s || [])
      setBreaks(b || [])
    } catch { showMsg('数据加载失败', 'error') }
  }
  useEffect(() => { load() }, [])

  // ---------- 筛选（对齐旧系统：年月选择器 + 快速选择 + 餐厅） ----------
  const [breakYm, setBreakYm] = useState<{ year: number | null; month: number | null }>({ year: null, month: null })
  const [breakDateRange, setBreakDateRange] = useState<{ startDate: string; endDate: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerView, setPickerView] = useState<'months' | 'years'>('months')
  const [yearWindowStart, setYearWindowStart] = useState(2021)
  const [quickOpen, setQuickOpen] = useState(false)
  const [restFilter, setRestFilter] = useState('')
  const [kw, setKw] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const nowYear = new Date().getFullYear()
  const applyBreakYm = (yr: number | null, mo: number | null) => {
    setBreakYm({ year: yr, month: mo })
    if (yr && mo) {
      const last = new Date(yr, mo, 0).getDate()
      setBreakDateRange({
        startDate: `${yr}-${String(mo).padStart(2, '0')}-01`,
        endDate: `${yr}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      })
    } else {
      setBreakDateRange(null)
    }
    setPickerOpen(false); setQuickOpen(false)
  }
  // 进入页面时自动默认当前月份（对齐旧系统）
  useEffect(() => {
    const now = new Date()
    applyBreakYm(now.getFullYear(), now.getMonth() + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击外部关闭搜索
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const w = document.querySelector('.dw-root .smartSearchWrapper')
      if (w && w.contains(t)) return
      if (!searchRef.current?.value) setSearchExpanded(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  const filteredBreaks = useMemo(() => {
    let list = breaks
    if (breakDateRange) {
      list = list.filter(b => {
        const d = b.breakDate || ''
        return d >= breakDateRange.startDate && d <= breakDateRange.endDate
      })
    }
    if (kw) {
      const q = kw.toLowerCase()
      list = list.filter(b => {
        const code = (rows.find(r => r.dishwareId === b.dishwareId)?.codeNumber || '').toLowerCase()
        return code.includes(q)
      })
    }
    return list
  }, [breaks, breakDateRange, kw, rows])

  // 三店并排数据（对齐旧系统：J1/J2/J3 左右排列）
  const breakShops = useMemo(() =>
    ['j1', 'j2', 'j3'].map(shop => {
      const records = filteredBreaks.filter(b => (b.shopType || '').toLowerCase() === shop)
      const total = records.reduce((s, b) => s + Number(b.totalPrice || 0), 0)
      return { shop, records, total }
    }), [filteredBreaks])

  // 可选择的碗碟（按编号排序）
  const breakOptions = useMemo(() => rows
    .filter(r => r.codeNumber)
    .sort((a, b) => String(a.codeNumber).localeCompare(String(b.codeNumber), 'zh-CN', { numeric: true })), [rows])

  // ---------- 弹窗与操作（对齐旧系统 damageModal / break-rows-modal / editBreakRecord / 批量删除） ----------
  const [breakModal, setBreakModal] = useState(false)
  const [breakShop, setBreakShop] = useState('j1')
  const [brk, setBrk] = useState({ codeNumber: '', dishwareId: '', breakQuantity: '', breakDate: '', unitPrice: '', totalPrice: '' })
  const [rowsModal, setRowsModal] = useState(false)
  const [rowsCount, setRowsCount] = useState(1)
  const [batchSaving, setBatchSaving] = useState(false)
  const [draftBreaks, setDraftBreaks] = useState<Record<string, { key: string; dishwareId: string; breakQuantity: string }[]>>({})
  const [editingBreak, setEditingBreak] = useState<{ id: number; dishwareId: string; breakQuantity: string; shopType?: string; breakDate?: string } | null>(null)
  const [batchDelMode, setBatchDelMode] = useState<Record<string, boolean>>({})
  const [batchDelSel, setBatchDelSel] = useState<Record<string, Set<number>>>({})

  const localToday = () => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }
  const batchBreakDate = () => {
    if (breakYm.year && breakYm.month) {
      const lastDay = new Date(breakYm.year, breakYm.month, 0).getDate()
      return `${breakYm.year}-${String(breakYm.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }
    return localToday()
  }

  const openBreakModal = (shop: string) => {
    setBreakShop(shop)
    setBrk({ codeNumber: '', dishwareId: '', breakQuantity: '', breakDate: localToday(), unitPrice: '', totalPrice: '' })
    setBreakModal(true)
  }
  const onBreakCodeChange = (code: string) => {
    const r = rows.find(x => x.codeNumber === code)
    setBrk(b => ({
      ...b, codeNumber: code,
      dishwareId: r ? String(r.dishwareId) : '',
      unitPrice: r?.unitPrice ? String(r.unitPrice) : '',
      totalPrice: r?.unitPrice && b.breakQuantity ? (Number(b.breakQuantity) * Number(r.unitPrice)).toFixed(2) : '',
    }))
  }
  const onBreakProductChange = (id: string) => {
    const r = rows.find(x => String(x.dishwareId) === id)
    setBrk(b => ({
      ...b, dishwareId: id,
      codeNumber: r?.codeNumber || '',
      unitPrice: r?.unitPrice ? String(r.unitPrice) : '',
      totalPrice: r?.unitPrice && b.breakQuantity ? (Number(b.breakQuantity) * Number(r.unitPrice)).toFixed(2) : '',
    }))
  }
  const onBreakQtyChange = (q: string) => {
    setBrk(b => ({ ...b, breakQuantity: q,
      totalPrice: b.unitPrice && q ? (Number(q) * Number(b.unitPrice)).toFixed(2) : '' }))
  }
  const saveBreak = async () => {
    if (saving) return
    if (!brk.dishwareId || !brk.breakQuantity) { showMsg('请选择产品并填写破损数量', 'error'); return }
    const qty = Number(brk.breakQuantity)
    const price = Number(brk.unitPrice || 0)
    setSaving(true)
    try {
      await createDishwareBreak({
        dishwareId: Number(brk.dishwareId), shopType: breakShop,
        breakQuantity: qty, chargeableQuantity: qty,
        unitPrice: price, totalPrice: qty * price,
        breakDate: brk.breakDate,
      })
      setBreakModal(false); setBrk({ ...brk, codeNumber: '', dishwareId: '', breakQuantity: '', unitPrice: '', totalPrice: '' })
      const savedCode = String(rows.find((r) => r.dishwareId === Number(brk.dishwareId))?.codeNumber || '#' + brk.dishwareId)
      await load()
      flashAfterRow('.break-record-table-wrapper', 'td:nth-child(2)', savedCode, flash)
      showMsg('破损记录已保存')
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
    finally { setSaving(false) }
  }
  const removeBreak = async (b: DishwareBreak) => {
    if (!window.confirm('确定删除此破损记录？')) return
    try { await deleteDishwareBreak(b.id); load(); showMsg('已删除') } catch { showMsg('删除失败', 'error') }
  }
  const startEditBreak = (b: DishwareBreak) => {
    setEditingBreak({ id: b.id, dishwareId: String(b.dishwareId), breakQuantity: String(b.breakQuantity), shopType: b.shopType, breakDate: b.breakDate })
  }
  const saveEditBreak = async () => {
    if (saving) return
    if (!editingBreak || !editingBreak.dishwareId || !editingBreak.breakQuantity) { showMsg('请选择产品并填写数量', 'error'); return }
    const qty = Number(editingBreak.breakQuantity)
    const row = rows.find(r => String(r.dishwareId) === editingBreak.dishwareId)
    const price = Number(row?.unitPrice || 0)
    setSaving(true)
    try {
      await updateDishwareBreak(editingBreak.id, {
        dishwareId: Number(editingBreak.dishwareId), shopType: editingBreak.shopType,
        breakQuantity: qty, chargeableQuantity: qty,
        unitPrice: price, totalPrice: qty * price,
        breakDate: editingBreak.breakDate,
      })
      setEditingBreak(null); load(); showMsg('破损记录已更新')
    } catch { showMsg('更新失败', 'error') }
    finally { setSaving(false) }
  }
  const toggleBatchDelete = (shop: string) => {
    setBatchDelMode(prev => ({ ...prev, [shop]: !prev[shop] }))
    setBatchDelSel(prev => ({ ...prev, [shop]: new Set() }))
  }
  const toggleBreakSel = (shop: string, id: number, checked: boolean) => {
    setBatchDelSel(prev => {
      const s = new Set(prev[shop] || [])
      if (checked) s.add(id); else s.delete(id)
      return { ...prev, [shop]: s }
    })
  }
  const confirmBatchDelete = async (shop: string) => {
    const sel = batchDelSel[shop] || new Set()
    if (sel.size === 0) { showMsg('请至少选择一条记录', 'error'); return }
    if (!window.confirm(`确定要删除选中的 ${sel.size} 条破损记录吗？此操作不可恢复！`)) return
    let ok = 0, err = 0
    for (const id of sel) {
      try { await deleteDishwareBreak(id); ok++ } catch { err++ }
    }
    setBatchDelMode(prev => ({ ...prev, [shop]: false }))
    setBatchDelSel(prev => ({ ...prev, [shop]: new Set() }))
    load()
    showMsg(err > 0 ? `已删除 ${ok} 条，失败 ${err} 条` : `成功删除 ${ok} 条破损记录`, err > 0 ? 'error' : 'success')
  }
  const exportBreakData = () => {
    if (filteredBreaks.length === 0) { showMsg('没有数据可导出', 'error'); return }
    const headers = ['No.', '编号', '数量', '单价', '总价', '日期']
    let csv = '\uFEFF' + headers.join(',') + '\n'
    filteredBreaks.forEach((b, i) => {
      const code = rows.find(r => r.dishwareId === b.dishwareId)?.codeNumber || ('#' + b.dishwareId)
      csv += [i + 1, code, b.breakQuantity, b.unitPrice ?? '', b.totalPrice ?? '', b.breakDate || ''].join(',') + '\n'
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `damage_records_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    showMsg('导出成功')
  }
  const openRowsModal = (shop: string) => { setBreakShop(shop); setRowsCount(1); setRowsModal(true) }
  const createDraftRows = () => {
    const n = Math.max(1, Math.min(50, rowsCount || 1))
    const newRows = Array.from({ length: n }, () => ({
      key: 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      dishwareId: '', breakQuantity: '',
    }))
    setDraftBreaks(prev => ({ ...prev, [breakShop]: [...(prev[breakShop] || []), ...newRows] }))
    setRowsModal(false)
    showMsg(`成功创建 ${n} 行记录`)
    // 创建草稿行后自动滚动到待填写位置
    setTimeout(() => {
      const sc = document.querySelector('.break-record-table-wrapper')
      const rows = document.querySelectorAll('.break-record-table tbody tr.new-row')
      if (sc && rows.length) {
        sc.scrollTop = Math.max(0, (rows[rows.length - 1] as HTMLElement).offsetTop - 8)
      }
    }, 200)
  }
  const updateDraftRow = (key: string, patch: Partial<{ dishwareId: string; breakQuantity: string }>) => {
    setDraftBreaks(prev => ({ ...prev, [breakShop]: (prev[breakShop] || []).map(r => r.key === key ? { ...r, ...patch } : r) }))
  }
  const removeDraftRow = (key: string) => {
    setDraftBreaks(prev => ({ ...prev, [breakShop]: (prev[breakShop] || []).filter(r => r.key !== key) }))
  }
  const batchSaveBreaks = async (shop: string) => {
    const drafts = draftBreaks[shop] || []
    const valid = drafts.filter(r => r.dishwareId && r.breakQuantity)
    if (valid.length === 0) { showMsg('请先填写要保存的行（选择产品并填写数量）', 'error'); return }
    setBatchSaving(true)
    try {
      const date = batchBreakDate()
      for (const d of valid) {
        const qty = Number(d.breakQuantity)
        const row = rows.find(r => String(r.dishwareId) === d.dishwareId)
        const price = Number(row?.unitPrice || 0)
        await createDishwareBreak({
          dishwareId: Number(d.dishwareId), shopType: shop,
          breakQuantity: qty, chargeableQuantity: qty,
          unitPrice: price, totalPrice: qty * price,
          breakDate: date,
        })
      }
      setDraftBreaks(prev => ({ ...prev, [shop]: [] }))
      load(); showMsg('批量保存成功')
    } catch { showMsg('批量保存失败', 'error') } finally { setBatchSaving(false) }
  }

  return (
    <div className="dw-root">
      <div className="container">
        <div className="header">
          <div><h1>破损记录 {breakYm.year && breakYm.month && <span className="break-title-ym">- {breakYm.year}年{breakYm.month}月</span>}</h1></div>
          <div className="controls">
            <DishwareViewSelector current="break" />
          </div>
        </div>

        {/* 统一顶部行：筛选 + 操作 */}
        <div className="unified-header-row">
          <div className="header-center-section">
            <div id="break-date-filter" className="break-date-filter">
              {/* 选择年份和月份（对齐旧系统 break-month-picker） */}
              <div className="break-month-picker">
                <span className="filter-label"><i className="fas fa-calendar" style={{ marginRight: 4 }} />选择年份和月份</span>
                <div className="break-month-picker-inner" style={{ position: 'relative' }}>
                  <button type="button" className="break-month-picker-trigger"
                    aria-haspopup="true" aria-expanded={pickerOpen}
                    onClick={(e) => { e.stopPropagation(); setPickerOpen(!pickerOpen); setQuickOpen(false) }}>
                    <i className="fas fa-calendar" style={{ marginRight: 6 }} />
                    <span>{breakYm.year && breakYm.month ? `${breakYm.year}年${breakYm.month}月` : '选择年份和月份'}</span>
                    <i className="fas fa-chevron-down" style={{ marginLeft: 6 }} />
                  </button>
                  {pickerOpen && (
                    <div className="break-month-picker-popup" role="dialog" aria-label="选择年份和月份">
                      <div className="break-picker-year-row">
                        <button type="button" className="break-picker-year-btn" aria-label="上一年"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (pickerView === 'years') setYearWindowStart(Math.max(2021, yearWindowStart - 12))
                            else setBreakYm({ ...breakYm, year: Math.max((breakYm.year || nowYear) - 1, nowYear - 20) })
                          }}>
                          <i className="fas fa-chevron-up" />
                        </button>
                        <span id="break-picker-year-display"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (pickerView === 'months') { const y = breakYm.year || nowYear; setPickerView('years'); setYearWindowStart(Math.max(2021, y - 11)) }
                            else setPickerView('months')
                          }}>
                          {pickerView === 'years' ? '选择年份' : (breakYm.year || nowYear)}
                        </span>
                        <button type="button" className="break-picker-year-btn" aria-label="下一年"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (pickerView === 'years') setYearWindowStart(yearWindowStart + 12)
                            else setBreakYm({ ...breakYm, year: Math.min((breakYm.year || nowYear) + 1, nowYear + 2) })
                          }}>
                          <i className="fas fa-chevron-down" />
                        </button>
                      </div>
                      <div className="break-picker-month-grid">
                        {pickerView === 'years'
                          ? Array.from({ length: 12 }, (_, i) => yearWindowStart + i).map(yr => (
                            <button key={yr} type="button"
                              className={'break-picker-month-btn' + (breakYm.year === yr ? ' selected' : '')}
                              onClick={() => { setBreakYm({ ...breakYm, year: yr }); setPickerView('months') }}>{yr}年</button>
                          ))
                          : Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <button key={m} type="button"
                              className={'break-picker-month-btn' + (breakYm.month === m ? ' selected' : '')}
                              onClick={() => applyBreakYm(breakYm.year || nowYear, m)}>{m}月</button>
                          ))}
                      </div>
                      <div className="break-picker-footer">
                        <button type="button" className="break-picker-clear-btn" onClick={() => applyBreakYm(null, null)}>无</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* 快速选择（对齐旧系统 break-quick-select） */}
              <div className="break-quick-select">
                <span className="filter-label"><i className="fas fa-clock" style={{ marginRight: 4 }} />快速选择</span>
                <div style={{ position: 'relative' }}>
                  <button type="button" className="btn btn-warning break-quick-select-btn"
                    onClick={() => { setQuickOpen(!quickOpen); setPickerOpen(false) }}
                    style={{ padding: 'clamp(4px, 0.42vw, 8px) clamp(10px, 0.83vw, 16px)', fontSize: 'clamp(8px, 0.74vw, 14px)' }}>
                    <i className="fas fa-calendar-alt" />
                    <span>{breakYm.month ? breakYm.month + '月' : '时段'}</span>
                    <i className="fas fa-chevron-down" />
                  </button>
                  {quickOpen && (
                    <div className="dropdown-menu break-quick-select-dropdown show"
                      style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, minWidth: 120, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4 }}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <button key={m} type="button" className="dropdown-item" onClick={() => applyBreakYm(nowYear, m)}>{m}月</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* 餐厅筛选（对齐旧系统 category-filter：标签在上、下拉在下） */}
              <div className="restaurant-filter">
                <span className="filter-label">餐厅</span>
                <select className="unified-search-input" value={restFilter} onChange={(e) => setRestFilter(e.target.value)}>
                  <option value="">全部餐厅</option>
                  {['j1', 'j2', 'j3'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="header-right-group">
            <div className="header-search">
              <div className={'smartSearchWrapper' + (searchExpanded ? ' expanded' : '')}
                onClick={(e) => { if (!searchExpanded) { e.stopPropagation(); setSearchExpanded(true); setTimeout(() => searchRef.current?.focus(), 200) } }}>
                <i className="fas fa-search smartSearch-icon"></i>
                <input ref={searchRef} type="text" className="smartSearch-input" placeholder="搜索编号..."
                  onChange={(e) => setKw(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-success" onClick={() => openBreakModal('j1')}><i className="fas fa-plus" /> 添加破损</button>
            <button className="btn btn-warning" onClick={exportBreakData}><i className="fas fa-download" /> 导出数据</button>
            <div className="header-stats">
              <span>显示记录: <span className="stat-value">{filteredBreaks.length}</span></span>
              <span>总记录: <span className="stat-value">{breaks.length}</span></span>
            </div>
          </div>
        </div>

        {/* 内容区：三店卡片表格 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className={'break-records-container' + (restFilter ? ' single-restaurant' : '')}
            style={{ flexDirection: 'row', alignItems: 'flex-start', overflowX: 'auto' }}>
            {breakShops.filter(s => !restFilter || s.shop === restFilter).map(({ shop, records, total }) => {
              const drafts = draftBreaks[shop] || []
              const draftTotal = drafts.reduce((s, r) => {
                const row = rows.find(x => String(x.dishwareId) === r.dishwareId)
                return s + (Number(row?.unitPrice || 0) * (Number(r.breakQuantity) || 0))
              }, 0)
              return (
              <div className="break-record-section" id={shop + '-page'} key={shop}>
                <div className="break-record-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>{shop.toUpperCase()}</span>
                    <span style={{ fontSize: 'clamp(12px, 0.94vw, 16px)', opacity: 0.9 }}>总破损：RM {(total + draftTotal).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {drafts.length > 0 && (
                      <button className="btn btn-primary" disabled={batchSaving}
                        onClick={() => batchSaveBreaks(shop)}
                        style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', background: '#0d6efd', whiteSpace: 'nowrap' }}>
                        <i className="fas fa-save" /> {batchSaving ? '保存中...' : `批量保存 (${drafts.length})`}
                      </button>
                    )}
                    {batchDelMode[shop] ? (
                      <>
                        <button className="btn btn-danger"
                          disabled={!(batchDelSel[shop] && batchDelSel[shop].size)}
                          onClick={() => confirmBatchDelete(shop)}
                          style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', background: '#dc3545', color: 'white', whiteSpace: 'nowrap' }}>
                          <i className="fas fa-check" /> 确认删除 {(batchDelSel[shop] && batchDelSel[shop].size) ? `(${batchDelSel[shop].size})` : ''}
                        </button>
                        <button className="btn btn-secondary" onClick={() => toggleBatchDelete(shop)}
                          style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', whiteSpace: 'nowrap' }}>
                          <i className="fas fa-times" /> 取消
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-danger" onClick={() => toggleBatchDelete(shop)}
                        style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', background: '#dc3545', color: 'white', whiteSpace: 'nowrap' }}>
                        <i className="fas fa-trash-alt" /> 批量删除
                      </button>
                    )}
                    <button className="btn btn-success" onClick={() => openRowsModal(shop)}
                      style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', whiteSpace: 'nowrap' }}>
                      <i className="fas fa-plus" /> 记录破损
                    </button>
                  </div>
                </div>
                <div className="break-record-table-wrapper">
                  <table className="break-record-table">
                    <thead>
                      <tr><th>No.</th><th>编号</th><th>数量</th><th>单价</th><th>总价</th><th>操作</th></tr>
                    </thead>
                    <tbody>
                      {records.map((b, i) => {
                        const isEditing = editingBreak?.id === b.id
                        const row = rows.find(r => r.dishwareId === b.dishwareId)
                        return isEditing ? (
                          <tr key={b.id} className="editing-row" style={{ background: '#f0f7ff' }}>
                            <td>{i + 1}</td>
                            <td>
                              <select value={editingBreak.dishwareId}
                                onChange={(e) => setEditingBreak({ ...editingBreak, dishwareId: e.target.value })}
                                style={{ padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, fontSize: 12, maxWidth: 130 }}>
                                {breakOptions.map(r => <option key={r.dishwareId} value={r.dishwareId}>{r.codeNumber}</option>)}
                              </select>
                            </td>
                            <td>
                              <input type="number" min="1" value={editingBreak.breakQuantity}
                                onChange={(e) => setEditingBreak({ ...editingBreak, breakQuantity: e.target.value })}
                                style={{ width: 60, padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, textAlign: 'center' }} />
                            </td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{Number(rows.find(r => String(r.dishwareId) === editingBreak.dishwareId)?.unitPrice || 0).toFixed(2)}</span></div></td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{(Number(rows.find(r => String(r.dishwareId) === editingBreak.dishwareId)?.unitPrice || 0) * (Number(editingBreak.breakQuantity) || 0)).toFixed(2)}</span></div></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button className="action-btn save-btn" onClick={saveEditBreak} title={saving ? '保存中...' : '保存'} disabled={saving} style={{ background: '#28a745', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-check')} /></button>
                              <button className="action-btn cancel-btn" onClick={() => setEditingBreak(null)} title="取消" style={{ background: '#6c757d', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}><i className="fas fa-times" /></button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={b.id} className={isHl(b) ? 'highlight-flash' : ''}>
                            <td>{i + 1}</td>
                            <td>{row?.codeNumber || ('#' + b.dishwareId)}</td>
                            <td>{b.breakQuantity}</td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{b.unitPrice ? Number(b.unitPrice).toFixed(2) : '0.00'}</span></div></td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{b.totalPrice ? Number(b.totalPrice).toFixed(2) : '0.00'}</span></div></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {batchDelMode[shop] ? (
                                <input type="checkbox" className="break-batch-delete-cb"
                                  checked={!!(batchDelSel[shop] && batchDelSel[shop].has(b.id))}
                                  onChange={(e) => toggleBreakSel(shop, b.id, e.target.checked)} />
                              ) : (
                                <>
                                  <button className="action-btn edit-btn" onClick={() => startEditBreak(b)} title="编辑"><i className="fas fa-edit" /></button>
                                  <button className="action-btn delete-btn" onClick={() => removeBreak(b)} title="删除"><i className="fas fa-trash" /></button>
                                </>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {/* 批量创建的草稿行（对齐旧系统 new-row） */}
                      {drafts.map((d, i) => {
                        const row = rows.find(x => String(x.dishwareId) === d.dishwareId)
                        const price = Number(row?.unitPrice || 0)
                        const qty = Number(d.breakQuantity || 0)
                        return (
                          <tr key={d.key} className="new-row" style={{ background: '#fffbea' }}>
                            <td>{records.length + i + 1}</td>
                            <td>
                              <select value={d.dishwareId}
                                onChange={(e) => updateDraftRow(d.key, { dishwareId: e.target.value })}
                                style={{ padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, fontSize: 12, maxWidth: 130 }}>
                                <option value="">请选择产品</option>
                                {breakOptions.map(r => <option key={r.dishwareId} value={r.dishwareId}>{r.codeNumber} - {r.productName}</option>)}
                              </select>
                            </td>
                            <td>
                              <input type="number" min="1" value={d.breakQuantity}
                                onChange={(e) => updateDraftRow(d.key, { breakQuantity: e.target.value })}
                                style={{ width: 60, padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, textAlign: 'center' }} />
                            </td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{price ? price.toFixed(2) : '0.00'}</span></div></td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{qty > 0 ? (price * qty).toFixed(2) : '0.00'}</span></div></td>
                            <td><button className="action-btn delete-btn" onClick={() => removeDraftRow(d.key)} title="移除"><i className="fas fa-times" /></button></td>
                          </tr>
                        )
                      })}
                      {records.length === 0 && drafts.length === 0 && (
                        <tr><td colSpan={6} className="no-data" style={{ padding: 30, textAlign: 'center', color: '#6b7280' }}>
                          <i className="fas fa-inbox" style={{ fontSize: 36, opacity: 0.5, marginBottom: 8 }} />
                          <div>暂无破损记录</div>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 添加破损弹窗（对齐旧系统 damageModal） */}
      {breakModal && (
        <div id="damageModal" className="modal" style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBreakModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title" id="damage-modal-title">添加 {breakShop.toUpperCase()} 破损记录</h2>
              <ModalClose onClick={() => setBreakModal(false)} />
            </div>
            <div className="modal-body">
              <div className="modal-form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div className="form-group">
                  <label className="required">破损日期</label>
                  <input type="date" value={brk.breakDate} onChange={(e) => setBrk({ ...brk, breakDate: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>产品编号</label>
                  <select value={brk.codeNumber} onChange={(e) => onBreakCodeChange(e.target.value)}>
                    <option value="">请选择编号</option>
                    {breakOptions.map(r => <option key={r.dishwareId} value={r.codeNumber}>{r.codeNumber}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="required">产品名称</label>
                  <select value={brk.dishwareId} onChange={(e) => onBreakProductChange(e.target.value)} required>
                    <option value="">请选择产品</option>
                    {breakOptions.map(r => <option key={r.dishwareId} value={r.dishwareId}>{r.productName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="required">破损数量</label>
                  <input type="number" min="1" value={brk.breakQuantity}
                    onChange={(e) => onBreakQtyChange(e.target.value)} placeholder="0" required />
                </div>
                <div className="form-group">
                  <label>单价 (RM)</label>
                  <input type="number" step="0.01" min="0" value={brk.unitPrice} readOnly
                    style={{ background: '#f3f4f6' }} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>总价 (RM)</label>
                  <input type="number" step="0.01" value={brk.totalPrice} readOnly
                    style={{ background: '#f3f4f6' }} placeholder="0.00" />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setBreakModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveBreak} disabled={saving}>{saving ? '保存中...' : <><i className="fas fa-save" /> 保存破损记录</>}</button>
            </div>
          </div>
        </div>
      )}

      {/* 新增破损记录行数选择弹窗（对齐旧系统 break-rows-modal） */}
      {rowsModal && (
        <div id="break-rows-modal" className="modal" style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setRowsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">新增破损记录</h3>
              <ModalClose onClick={() => setRowsModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="break-rows-count" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>要创建的行数 *</label>
                <input type="number" id="break-rows-count" min="1" max="50" value={rowsCount}
                  onChange={(e) => setRowsCount(Number(e.target.value))} required
                  style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRowsModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={createDraftRows}><i className="fas fa-plus" /> 创建记录</button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 99999, background: toast.type === 'error' ? '#ef4444' : '#10b981', color: '#fff', padding: '10px 18px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: 14 }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
