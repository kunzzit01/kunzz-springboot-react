import { useEffect, useMemo, useRef, useState } from 'react'
import { createDishwareLocation, createDishwareTransfer, deleteDishwareLocation, deleteDishwareTransfer,
  getDishwareLocations, getDishwareStock, getDishwareTransfers, updateDishwareLocation, updateDishwareTransfer } from '../api'
import { flashAfterRow, useRowHighlight } from '../utils/rowHighlight'
import type { DishwareStockVO, DishwareTransfer } from '../types'
import DishwareViewSelector from '../components/DishwareViewSelector'
import '../styles/dishware.css'
import ModalClose from '../components/ModalClose'

/** J 餐厅（对齐旧系统：J 开头餐厅，排除中央/文化楼） */
const J_SHOPS = ['j1', 'j2', 'j3']

/**
 * 碗碟转卖独立页面（http://localhost:5174/dishware_transfer）
 * 对齐旧系统 dishware_stock?tab=transfer：年月选择器 + 快速选择 + 餐厅筛选 + J 店卡片
 */
export default function DishwareTransferPage() {
  // ---------- 数据 ----------
  const [rows, setRows] = useState<DishwareStockVO[]>([])
  // 新增后定位高亮（按编号）
  const { flash, isHl } = useRowHighlight((t: any) =>
    String(t.codeNumber || rows.find((r) => r.dishwareId === t.dishwareId)?.codeNumber || '#' + t.dishwareId))
  const [transfers, setTransfers] = useState<DishwareTransfer[]>([])
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }
  const load = async () => {
    try {
      const [s, t] = await Promise.all([getDishwareStock(), getDishwareTransfers()])
      setRows(s || [])
      setTransfers(t || [])
    } catch { showMsg('数据加载失败', 'error') }
  }
  useEffect(() => { load() }, [])

  // ---------- 日期/餐厅筛选（对齐旧系统：年月选择器 + 快速选择 + 餐厅） ----------
  const [trYm, setTrYm] = useState<{ year: number | null; month: number | null }>({ year: null, month: null })
  const [trDateRange, setTrDateRange] = useState<{ startDate: string; endDate: string } | null>(null)
  const [trPickerOpen, setTrPickerOpen] = useState(false)
  const [trPickerView, setTrPickerView] = useState<'months' | 'years'>('months')
  const [trYearWindowStart, setTrYearWindowStart] = useState(2021)
  const [trQuickOpen, setTrQuickOpen] = useState(false)
  const [trRestFilter, setTrRestFilter] = useState('')
  const [kw, setKw] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const trNowYear = new Date().getFullYear()
  const applyTrYm = (yr: number | null, mo: number | null) => {
    setTrYm({ year: yr, month: mo })
    if (yr && mo) {
      const last = new Date(yr, mo, 0).getDate()
      setTrDateRange({
        startDate: `${yr}-${String(mo).padStart(2, '0')}-01`,
        endDate: `${yr}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      })
    } else {
      setTrDateRange(null)
    }
    setTrPickerOpen(false); setTrQuickOpen(false)
  }
  // 进入页面时自动默认当前月份（对齐旧系统）
  useEffect(() => {
    const now = new Date()
    applyTrYm(now.getFullYear(), now.getMonth() + 1)
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

  // ---------- 转卖记录（对齐旧系统：in 归入目标店、out 归入来源店 + 日期/搜索过滤） ----------
  const transferGroups = useMemo(() => J_SHOPS.map(shop => {
    const records = transfers.filter(t => {
      const isIn = t.recordType === 'in'
      const belongs = isIn
        ? (t.toShopType || '').toLowerCase() === shop
        : (t.fromShopType || '').toLowerCase() === shop
      if (!belongs) return false
      if (trDateRange) {
        const d = t.transferDate || ''
        if (!(d >= trDateRange.startDate && d <= trDateRange.endDate)) return false
      }
      if (kw) {
        const q = kw.toLowerCase()
        const row = rows.find(r => r.dishwareId === t.dishwareId)
        const searchText = [row?.codeNumber || '', row?.productName || '', row?.category || ''].join(' ').toLowerCase()
        if (!searchText.includes(q)) return false
      }
      return true
    })
    return { from: shop, records }
  }), [transfers, rows, kw, trDateRange])

  // 可选择的碗碟（按编号排序，对齐旧系统 getAllSingleDishwareForBreak）
  const breakOptions = useMemo(() => rows
    .filter(r => r.codeNumber)
    .sort((a, b) => String(a.codeNumber).localeCompare(String(b.codeNumber), 'zh-CN', { numeric: true })), [rows])

  // ---------- 操作状态 ----------
  const [transferFilter, setTransferFilter] = useState<Record<string, 'all' | 'out' | 'in'>>({})
  const [transferRowsModal, setTransferRowsModal] = useState(false)
  const [transferRowsCount, setTransferRowsCount] = useState(1)
  const [transferSaving, setTransferSaving] = useState(false)
  interface TransferDraftRow { key: string; dishwareId: string; quantity: string; toShop: string }
  const [transferDraft, setTransferDraft] = useState<Record<string, TransferDraftRow[]>>({})
  const [transferBatchDelMode, setTransferBatchDelMode] = useState<Record<string, boolean>>({})
  const [transferBatchDelSel, setTransferBatchDelSel] = useState<Record<string, Set<number>>>({})
  const [transferEditing, setTransferEditing] = useState<{ id: number; dishwareId: string; quantity: string; toShop: string; fromShop: string; transferDate?: string } | null>(null)
  const [trnShop, setTrnShop] = useState('j1')

  const transferFiltered = (from: string): DishwareTransfer[] => {
    const f = transferFilter[from] || 'all'
    const records = (transferGroups.find(g => g.from === from)?.records) || []
    if (f === 'all') return records
    return records.filter(r => r.recordType === f)
  }
  const setTransferFilterFor = (from: string, f: 'all' | 'out' | 'in') => {
    setTransferFilter(prev => ({ ...prev, [from]: f }))
  }

  // 批量记录（行数选择弹窗 + 草稿行 + 批量保存）
  const openTransferRowsModal = (from: string) => { setTrnShop(from); setTransferRowsCount(1); setTransferRowsModal(true) }
  const createTransferDraftRows = () => {
    const n = Math.max(1, Math.min(50, transferRowsCount || 1))
    const newRows = Array.from({ length: n }, () => ({
      key: 'tdraft-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      dishwareId: '', quantity: '', toShop: '',
    }))
    setTransferDraft(prev => ({ ...prev, [trnShop]: [...(prev[trnShop] || []), ...newRows] }))
    setTransferRowsModal(false)
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
  const updateTransferDraftRow = (from: string, key: string, patch: Partial<TransferDraftRow>) => {
    setTransferDraft(prev => ({ ...prev, [from]: (prev[from] || []).map(r => r.key === key ? { ...r, ...patch } : r) }))
  }
  const removeTransferDraftRow = (from: string, key: string) => {
    setTransferDraft(prev => ({ ...prev, [from]: (prev[from] || []).filter(r => r.key !== key) }))
  }
  // 逐行保存（对齐旧系统 saveNewTransferRow：单行直接入库）
  const saveTransferDraftRow = async (from: string, key: string) => {
    const d = (transferDraft[from] || []).find(r => r.key === key)
    if (!d) return
    if (!d.dishwareId || !d.quantity || !d.toShop) { showMsg('请填写完整的转卖行（编号、数量、目标餐厅）', 'error'); return }
    const qty = Number(d.quantity)
    const row = rows.find(r => String(r.dishwareId) === d.dishwareId)
    const price = Number(row?.unitPrice || 0)
    setTransferSaving(true)
    try {
      await createDishwareTransfer({
        dishwareId: Number(d.dishwareId), fromShopType: from, toShopType: d.toShop,
        quantity: qty, unitPrice: price, totalPrice: qty * price,
        transferDate: new Date().toISOString().slice(0, 10),
        recordType: 'out',
      })
      setTransferDraft(prev => ({ ...prev, [from]: (prev[from] || []).filter(r => r.key !== key) }))
      const savedCode = String(rows.find((r) => r.dishwareId === Number(d.dishwareId))?.codeNumber || '#' + d.dishwareId)
      await load()
      flashAfterRow('.break-record-table-wrapper', 'td:nth-child(2)', savedCode, flash)
      showMsg('转卖记录添加成功')
    } catch { showMsg('保存失败', 'error') } finally { setTransferSaving(false) }
  }
  const batchSaveTransfers = async (from: string) => {
    const drafts = transferDraft[from] || []
    const valid = drafts.filter(r => r.dishwareId && r.quantity && r.toShop)
    if (valid.length === 0) { showMsg('请填写完整的转卖行（编号、数量、目标餐厅）', 'error'); return }
    setTransferSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      for (const d of valid) {
        const qty = Number(d.quantity)
        const row = rows.find(r => String(r.dishwareId) === d.dishwareId)
        const price = Number(row?.unitPrice || 0)
        await createDishwareTransfer({
          dishwareId: Number(d.dishwareId), fromShopType: from, toShopType: d.toShop,
          quantity: qty, unitPrice: price, totalPrice: qty * price,
          transferDate: today,
          recordType: 'out',
        })
      }
      setTransferDraft(prev => ({ ...prev, [from]: [] }))
      await load()
      if (valid.length) {
        const savedCode = String(rows.find((r) => r.dishwareId === Number(valid[0].dishwareId))?.codeNumber || '#' + valid[0].dishwareId)
        flashAfterRow('.break-record-table-wrapper', 'td:nth-child(2)', savedCode, flash)
      }
      showMsg('批量保存成功')
    } catch { showMsg('批量保存失败', 'error') } finally { setTransferSaving(false) }
  }

  // 批量删除（对齐旧系统 toggleBatchDeleteTransfer / confirmBatchDeleteTransfer）
  const toggleTransferBatchDelete = (from: string) => {
    setTransferBatchDelMode(prev => ({ ...prev, [from]: !prev[from] }))
    setTransferBatchDelSel(prev => ({ ...prev, [from]: new Set() }))
  }
  const toggleTransferSel = (from: string, id: number, checked: boolean) => {
    setTransferBatchDelSel(prev => {
      const s = new Set(prev[from] || [])
      if (checked) s.add(id); else s.delete(id)
      return { ...prev, [from]: s }
    })
  }
  const confirmTransferBatchDelete = async (from: string) => {
    const sel = transferBatchDelSel[from] || new Set()
    if (sel.size === 0) { showMsg('请至少选择一条记录', 'error'); return }
    if (!window.confirm(`确定要删除选中的 ${sel.size} 条转卖记录吗？此操作不可恢复！`)) return
    let ok = 0, err = 0
    for (const id of sel) {
      try { await deleteDishwareTransfer(id); ok++ } catch { err++ }
    }
    setTransferBatchDelMode(prev => ({ ...prev, [from]: false }))
    setTransferBatchDelSel(prev => ({ ...prev, [from]: new Set() }))
    load()
    showMsg(err > 0 ? `已删除 ${ok} 条，失败 ${err} 条` : `成功删除 ${ok} 条转卖记录`, err > 0 ? 'error' : 'success')
  }

  // 行内编辑（对齐旧系统 editTransferRecord）
  const startEditTransfer = (t: DishwareTransfer) => {
    setTransferEditing({
      id: t.id, dishwareId: String(t.dishwareId), quantity: String(t.quantity),
      toShop: t.toShopType || '', fromShop: t.fromShopType || '',
      transferDate: t.transferDate,
    })
  }
  const saveEditTransfer = async () => {
    if (transferSaving) return
    if (!transferEditing || !transferEditing.dishwareId || !transferEditing.quantity) { showMsg('请选择产品并填写数量', 'error'); return }
    const qty = Number(transferEditing.quantity)
    const row = rows.find(r => String(r.dishwareId) === transferEditing.dishwareId)
    const price = Number(row?.unitPrice || 0)
    setTransferSaving(true)
    try {
      await updateDishwareTransfer(transferEditing.id, {
        dishwareId: Number(transferEditing.dishwareId),
        fromShopType: transferEditing.fromShop, toShopType: transferEditing.toShop,
        quantity: qty, unitPrice: price, totalPrice: qty * price,
        transferDate: transferEditing.transferDate,
        recordType: 'out',
      })
      setTransferEditing(null); load(); showMsg('转卖记录已更新')
    } catch { showMsg('更新失败', 'error') }
    finally { setTransferSaving(false) }
  }
  const removeTransfer = async (t: DishwareTransfer) => {
    if (!window.confirm('确定删除此转卖记录？')) return
    try { await deleteDishwareTransfer(t.id); load(); showMsg('已删除') } catch { showMsg('删除失败', 'error') }
  }

  // ---------- 管理餐厅店面（对齐旧系统 restaurantModal） ----------
  const [restModal, setRestModal] = useState(false)
  const [restAddModal, setRestAddModal] = useState(false)
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([])
  const [restForm, setRestForm] = useState({ id: 0, name: '' })
  const loadLocations = async () => {
    try { setLocations((await getDishwareLocations()) || []) } catch { showMsg('加载餐厅店面失败', 'error') }
  }
  const openRestModal = () => { setRestModal(true); loadLocations() }
  const saveRest = async () => {
    if (transferSaving) return
    if (!restForm.name.trim()) { showMsg('餐厅店面名称不能为空', 'error'); return }
    setTransferSaving(true)
    try {
      if (restForm.id) await updateDishwareLocation(restForm.id, { name: restForm.name.trim() })
      else await createDishwareLocation({ name: restForm.name.trim() })
      setRestAddModal(false); setRestForm({ id: 0, name: '' })
      loadLocations(); showMsg('已保存')
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
    finally { setTransferSaving(false) }
  }
  const removeRest = async (id: number, name: string) => {
    if (!window.confirm(`确定要删除这个餐厅店面（${name}）吗？删除后该店面的库存数据将被移除。`)) return
    try { await deleteDishwareLocation(id); loadLocations(); showMsg('已删除') } catch (e: any) { showMsg(e?.response?.data?.message || '删除失败', 'error') }
  }

  return (
    <div className="dw-root">
      <div className="container">
        <div className="header">
          <div><h1>碗碟转卖 {trYm.year && trYm.month && <span className="break-title-ym">- {trYm.year}年{trYm.month}月</span>}</h1></div>
          <div className="controls">
            <DishwareViewSelector current="transfer" />
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
                    aria-haspopup="true" aria-expanded={trPickerOpen}
                    onClick={(e) => { e.stopPropagation(); setTrPickerOpen(!trPickerOpen); setTrQuickOpen(false) }}>
                    <i className="fas fa-calendar" style={{ marginRight: 6 }} />
                    <span>{trYm.year && trYm.month ? `${trYm.year}年${trYm.month}月` : '选择年份和月份'}</span>
                    <i className="fas fa-chevron-down" style={{ marginLeft: 6 }} />
                  </button>
                  {trPickerOpen && (
                    <div className="break-month-picker-popup" role="dialog" aria-label="选择年份和月份">
                      <div className="break-picker-year-row">
                        <button type="button" className="break-picker-year-btn" aria-label="上一年"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (trPickerView === 'years') setTrYearWindowStart(Math.max(2021, trYearWindowStart - 12))
                            else setTrYm({ ...trYm, year: Math.max((trYm.year || trNowYear) - 1, trNowYear - 20) })
                          }}>
                          <i className="fas fa-chevron-up" />
                        </button>
                        <span id="break-picker-year-display"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (trPickerView === 'months') { const y = trYm.year || trNowYear; setTrPickerView('years'); setTrYearWindowStart(Math.max(2021, y - 11)) }
                            else setTrPickerView('months')
                          }}>
                          {trPickerView === 'years' ? '选择年份' : (trYm.year || trNowYear)}
                        </span>
                        <button type="button" className="break-picker-year-btn" aria-label="下一年"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (trPickerView === 'years') setTrYearWindowStart(trYearWindowStart + 12)
                            else setTrYm({ ...trYm, year: Math.min((trYm.year || trNowYear) + 1, trNowYear + 2) })
                          }}>
                          <i className="fas fa-chevron-down" />
                        </button>
                      </div>
                      <div className="break-picker-month-grid">
                        {trPickerView === 'years'
                          ? Array.from({ length: 12 }, (_, i) => trYearWindowStart + i).map(yr => (
                            <button key={yr} type="button"
                              className={'break-picker-month-btn' + (trYm.year === yr ? ' selected' : '')}
                              onClick={() => { setTrYm({ ...trYm, year: yr }); setTrPickerView('months') }}>{yr}年</button>
                          ))
                          : Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <button key={m} type="button"
                              className={'break-picker-month-btn' + (trYm.month === m ? ' selected' : '')}
                              onClick={() => applyTrYm(trYm.year || trNowYear, m)}>{m}月</button>
                          ))}
                      </div>
                      <div className="break-picker-footer">
                        <button type="button" className="break-picker-clear-btn" onClick={() => applyTrYm(null, null)}>无</button>
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
                    onClick={() => { setTrQuickOpen(!trQuickOpen); setTrPickerOpen(false) }}
                    style={{ padding: 'clamp(4px, 0.42vw, 8px) clamp(10px, 0.83vw, 16px)', fontSize: 'clamp(8px, 0.74vw, 14px)' }}>
                    <i className="fas fa-calendar-alt" />
                    <span>{trYm.month ? trYm.month + '月' : '时段'}</span>
                    <i className="fas fa-chevron-down" />
                  </button>
                  {trQuickOpen && (
                    <div className="dropdown-menu break-quick-select-dropdown show"
                      style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, minWidth: 120, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4 }}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <button key={m} type="button" className="dropdown-item" onClick={() => applyTrYm(trNowYear, m)}>{m}月</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* 餐厅筛选（对齐旧系统 category-filter 改为餐厅下拉） */}
              <div className="restaurant-filter">
                <span className="filter-label">餐厅</span>
                <select className="unified-search-input" value={trRestFilter} onChange={(e) => setTrRestFilter(e.target.value)}>
                  <option value="">全部餐厅</option>
                  {J_SHOPS.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="header-right-group">
            <div className="header-search">
              <div className={'smartSearchWrapper' + (searchExpanded ? ' expanded' : '')}
                onClick={(e) => { if (!searchExpanded) { e.stopPropagation(); setSearchExpanded(true); setTimeout(() => searchRef.current?.focus(), 200) } }}>
                <i className="fas fa-search smartSearch-icon"></i>
                <input ref={searchRef} type="text" className="smartSearch-input" placeholder="搜索碗碟名称、编号或分类..."
                  onChange={(e) => setKw(e.target.value)} />
              </div>
            </div>
            <button id="manage-restaurants-btn" className="btn" style={{ backgroundColor: '#17a2b8', color: 'white' }}
              onClick={openRestModal}>
              <i className="fas fa-store" /> 管理餐厅店面
            </button>
            <div className="header-stats">
              <span>显示记录: <span className="stat-value">{transferGroups.reduce((s, g) => s + g.records.length, 0)}</span></span>
              <span>总记录: <span className="stat-value">{transfers.length}</span></span>
            </div>
          </div>
        </div>

        {/* 内容区：J 店卡片 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className={'break-records-container' + (trRestFilter ? ' single-restaurant' : '')}
            style={{ flexDirection: 'row', alignItems: 'flex-start', overflowX: 'auto' }}>
            {transferGroups.filter(g => !trRestFilter || g.from === trRestFilter).map(g => {
              const f = transferFilter[g.from] || 'all'
              const records = transferFiltered(g.from)
              const drafts = transferDraft[g.from] || []
              return (
              <div className="break-record-section" id="transfer-page" key={g.from}>
                <div className="break-record-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>{g.from.toUpperCase()}转卖</span>
                    <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                      {[['all', '全部'], ['out', '转卖'], ['in', '来自']].map(([k, v]) => (
                        <button key={k} type="button"
                          onClick={() => setTransferFilterFor(g.from, k as any)}
                          style={{ padding: 'clamp(2px, 0.21vw, 4px) clamp(6px, 0.63vw, 12px)', fontSize: 'clamp(8px, 0.74vw, 12px)', whiteSpace: 'nowrap', background: f === k ? '#f99e00' : 'white', color: f === k ? 'white' : '#333', border: '1px solid #ddd', borderRadius: 4 }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {drafts.length >= 2 && (
                      <button className="btn btn-primary" disabled={transferSaving}
                        onClick={() => batchSaveTransfers(g.from)}
                        style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', background: '#0d6efd', whiteSpace: 'nowrap' }}>
                        <i className="fas fa-save" /> {transferSaving ? '保存中...' : `批量保存 (${drafts.length})`}
                      </button>
                    )}
                    {transferBatchDelMode[g.from] ? (
                      <>
                        <button className="btn btn-danger"
                          disabled={!(transferBatchDelSel[g.from] && transferBatchDelSel[g.from].size)}
                          onClick={() => confirmTransferBatchDelete(g.from)}
                          style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', background: '#dc3545', color: 'white', whiteSpace: 'nowrap' }}>
                          <i className="fas fa-check" /> 确认删除 {(transferBatchDelSel[g.from] && transferBatchDelSel[g.from].size) ? `(${transferBatchDelSel[g.from].size})` : ''}
                        </button>
                        <button className="btn btn-secondary" onClick={() => toggleTransferBatchDelete(g.from)}
                          style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', whiteSpace: 'nowrap' }}>
                          <i className="fas fa-times" /> 取消
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-danger" onClick={() => toggleTransferBatchDelete(g.from)}
                        style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', background: '#dc3545', color: 'white', whiteSpace: 'nowrap' }}>
                        <i className="fas fa-trash-alt" /> 批量删除
                      </button>
                    )}
                    <button className="btn btn-success" onClick={() => openTransferRowsModal(g.from)}
                      style={{ padding: '3px 10px', fontSize: 'clamp(8px, 0.74vw, 12px)', whiteSpace: 'nowrap' }}>
                      <i className="fas fa-plus" /> 转卖碗碟
                    </button>
                  </div>
                </div>
                <div className="break-record-table-wrapper">
                  <table className="break-record-table">
                    <thead>
                      <tr><th>No.</th><th>编号</th><th>数量</th><th>进出</th><th>单价</th><th>总价</th><th>操作</th></tr>
                    </thead>
                    <tbody>
                      {records.map((t, i) => {
                        const isOut = t.recordType !== 'in'
                        const isEditing = transferEditing?.id === t.id
                        const color = isOut ? '#dc3545' : '#000'
                        const direction = isOut ? ((t.toShopType || '-').toUpperCase()) : ((t.fromShopType || '-').toUpperCase())
                        const row = rows.find(r => r.dishwareId === t.dishwareId)
                        return isEditing ? (
                          <tr key={t.id} className="editing-row" style={{ background: '#f0f7ff' }}>
                            <td>{i + 1}</td>
                            <td>
                              <select value={transferEditing.dishwareId}
                                onChange={(e) => setTransferEditing({ ...transferEditing, dishwareId: e.target.value })}
                                style={{ padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, fontSize: 12, maxWidth: 130 }}>
                                {breakOptions.map(r => <option key={r.dishwareId} value={r.dishwareId}>{r.codeNumber}</option>)}
                              </select>
                            </td>
                            <td>
                              <input type="number" min="1" value={transferEditing.quantity}
                                onChange={(e) => setTransferEditing({ ...transferEditing, quantity: e.target.value })}
                                style={{ width: 60, padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, textAlign: 'center' }} />
                            </td>
                            <td>
                              <select value={transferEditing.toShop}
                                onChange={(e) => setTransferEditing({ ...transferEditing, toShop: e.target.value })}
                                style={{ padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, fontSize: 12 }}>
                                {J_SHOPS.filter(s => s !== transferEditing.fromShop).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                              </select>
                            </td>
                            <td><div className="currency-display"><span className="currency-symbol" style={{ color }}>RM</span><span className="currency-amount" style={{ color }}>{Number(rows.find(r => String(r.dishwareId) === transferEditing.dishwareId)?.unitPrice || 0).toFixed(2)}</span></div></td>
                            <td><div className="currency-display"><span className="currency-symbol" style={{ color }}>RM</span><span className="currency-amount" style={{ color }}>{(Number(rows.find(r => String(r.dishwareId) === transferEditing.dishwareId)?.unitPrice || 0) * (Number(transferEditing.quantity) || 0)).toFixed(2)}</span></div></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button className="action-btn save-btn" onClick={saveEditTransfer} title={transferSaving ? '保存中...' : '保存'} disabled={transferSaving} style={{ background: '#28a745', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}><i className={'fas ' + (transferSaving ? 'fa-spinner fa-spin' : 'fa-check')} /></button>
                              <button className="action-btn cancel-btn" onClick={() => setTransferEditing(null)} title="取消" style={{ background: '#6c757d', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}><i className="fas fa-times" /></button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={t.id} className={isHl(t) ? 'highlight-flash' : ''}>
                            <td>{i + 1}</td>
                            <td>{t.codeNumber || row?.codeNumber || ('#' + t.dishwareId)}</td>
                            <td>{t.quantity}</td>
                            <td>{direction}</td>
                            <td><div className="currency-display"><span className="currency-symbol" style={{ color }}>{isOut ? '-' : ''}RM</span><span className="currency-amount" style={{ color }}>{t.unitPrice ? Number(t.unitPrice).toFixed(2) : '0.00'}</span></div></td>
                            <td><div className="currency-display"><span className="currency-symbol" style={{ color }}>{isOut ? '-' : ''}RM</span><span className="currency-amount" style={{ color }}>{t.totalPrice ? Number(t.totalPrice).toFixed(2) : '0.00'}</span></div></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {isOut ? (
                                transferBatchDelMode[g.from] ? (
                                  <input type="checkbox" className="break-batch-delete-cb"
                                    checked={!!(transferBatchDelSel[g.from] && transferBatchDelSel[g.from].has(t.id))}
                                    onChange={(e) => toggleTransferSel(g.from, t.id, e.target.checked)} />
                                ) : (
                                  <>
                                    <button className="action-btn edit-btn" onClick={() => startEditTransfer(t)} title="编辑"><i className="fas fa-edit" /></button>
                                    <button className="action-btn delete-btn" onClick={() => removeTransfer(t)} title="删除"><i className="fas fa-trash" /></button>
                                  </>
                                )
                              ) : (
                                <span style={{ color: '#6b7280', fontSize: 12 }}>自动生成</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {/* 批量创建的草稿行（对齐旧系统 new-row） */}
                      {drafts.map((d, i) => {
                        const row = rows.find(x => String(x.dishwareId) === d.dishwareId)
                        const price = Number(row?.unitPrice || 0)
                        const qty = Number(d.quantity || 0)
                        return (
                          <tr key={d.key} className="new-row" style={{ background: '#fffbea' }}>
                            <td>{records.length + i + 1}</td>
                            <td>
                              <select value={d.dishwareId}
                                onChange={(e) => updateTransferDraftRow(g.from, d.key, { dishwareId: e.target.value })}
                                style={{ padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, fontSize: 12, maxWidth: 130 }}>
                                <option value="">请选择产品</option>
                                {breakOptions.map(r => <option key={r.dishwareId} value={r.dishwareId}>{r.codeNumber} - {r.productName}</option>)}
                              </select>
                            </td>
                            <td>
                              <input type="number" min="1" value={d.quantity}
                                onChange={(e) => updateTransferDraftRow(g.from, d.key, { quantity: e.target.value })}
                                style={{ width: 60, padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, textAlign: 'center' }} />
                            </td>
                            <td>
                              <select value={d.toShop}
                                onChange={(e) => updateTransferDraftRow(g.from, d.key, { toShop: e.target.value })}
                                style={{ padding: '4px 6px', border: '1px solid #d9d0c4', borderRadius: 4, fontSize: 12 }}>
                                <option value="">选择餐厅</option>
                                {J_SHOPS.filter(s => s !== g.from).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                              </select>
                            </td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{price ? price.toFixed(2) : '0.00'}</span></div></td>
                            <td><div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{qty > 0 ? (price * qty).toFixed(2) : '0.00'}</span></div></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {/* 逐行保存/取消（对齐旧系统 saveNewTransferRow / cancelNewTransferRow） */}
                              <button className="action-btn save-btn" disabled={transferSaving}
                                onClick={() => saveTransferDraftRow(g.from, d.key)} title="保存"
                                style={{ background: '#28a745', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}>
                                <i className="fas fa-check" />
                              </button>
                              <button className="action-btn cancel-btn" onClick={() => removeTransferDraftRow(g.from, d.key)} title="取消"
                                style={{ background: '#6c757d', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}>
                                <i className="fas fa-times" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {records.length === 0 && drafts.length === 0 && (
                        <tr><td colSpan={7} className="no-data" style={{ padding: 30, textAlign: 'center', color: '#6b7280' }}>
                          <i className="fas fa-inbox" style={{ fontSize: 36, opacity: 0.5, marginBottom: 8 }} />
                          <div>暂无转卖记录</div>
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

      {/* 新增转卖记录行数选择弹窗（对齐旧系统 transfer-rows-modal） */}
      {transferRowsModal && (
        <div id="transfer-rows-modal" className="modal" style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setTransferRowsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">新增转卖记录</h3>
              <ModalClose onClick={() => setTransferRowsModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="transfer-rows-count" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>要创建的行数 *</label>
                <input type="number" id="transfer-rows-count" min="1" max="50" value={transferRowsCount}
                  onChange={(e) => setTransferRowsCount(Number(e.target.value))} required
                  style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setTransferRowsModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={createTransferDraftRows}><i className="fas fa-plus" /> 创建记录</button>
            </div>
          </div>
        </div>
      )}

      {/* 管理餐厅店面弹窗（对齐旧系统 restaurantModal） */}
      {restModal && (
        <div id="restaurantModal" className="modal" style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setRestModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h2 className="modal-title"><i className="fas fa-store" style={{ marginRight: 8, opacity: 0.7 }} />管理餐厅店面</h2>
              <ModalClose onClick={() => setRestModal(false)} />
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn btn-success" onClick={() => setRestAddModal(true)}><i className="fas fa-plus" /> 添加餐厅店面</button>
              </div>
              <table className="stock-table">
                <thead>
                  <tr><th>店面名称</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {locations.map(l => (
                    <tr key={l.id}>
                      <td>{l.name}</td>
                      <td>
                        <button className="action-btn edit-btn" title="编辑"
                          onClick={() => { setRestForm({ id: l.id, name: l.name }); setRestAddModal(true) }}><i className="fas fa-edit" /></button>
                        <button className="action-btn delete-btn" title="删除"
                          onClick={() => removeRest(l.id, l.name)}><i className="fas fa-trash" /></button>
                      </td>
                    </tr>
                  ))}
                  {locations.length === 0 && <tr><td colSpan={2} style={{ padding: 30, textAlign: 'center', color: '#999' }}>暂无餐厅店面</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRestModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {restAddModal && (
        <div id="restaurantAddModal" className="modal" style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setRestAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">{restForm.id ? '编辑餐厅店面' : '添加餐厅店面'}</h3>
              <ModalClose onClick={() => setRestAddModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>店面名称 *</label>
                <input value={restForm.name} onChange={(e) => setRestForm({ ...restForm, name: e.target.value })}
                  style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRestAddModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveRest} disabled={transferSaving}>{transferSaving ? '保存中...' : <><i className="fas fa-save" /> 保存</>}</button>
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
