import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createDishwareInfo, createDishwareLocation, createDishwareSet,
  deleteDishwareInfo, deleteDishwareLocation, deleteDishwareSet, getDishwareInfos,
  getDishwareLocations, getDishwareSetItems, getDishwareSets, getDishwareStock, saveDishwareSetItems,
  updateDishwareInfo, updateDishwareLocation, updateDishwareStock, uploadDishwarePhoto,
} from '../api'
import type { DishwareInfo, DishwareSet, DishwareStockVO } from '../types'
import DishwareViewSelector from '../components/DishwareViewSelector'
import '../styles/dishware.css'
import ModalClose from '../components/ModalClose'

/** 碗碟库存：对齐线上 dishware_stock.php（总库存/破损记录/碗碟转卖 + 照片上传） */
const categories = ['AG','CU','DN','DR','IP','MA','ME','MU','OM','OT','SA','SK','SU','SAR','SER','SET','TA','TE','WAN','YA','用具']
const STOCK_LOCATIONS = [
  { key: 'wenhuaQuantity', label: '文化楼' },
  { key: 'centralQuantity', label: '中央' },
  { key: 'j1Quantity', label: 'J1' },
  { key: 'j2Quantity', label: 'J2' },
  { key: 'j3Quantity', label: 'J3' },
]

interface PhotoModalState {
  open: boolean
  edit?: DishwareStockVO
  photoPath: string
  photoFile: File | null
}

export default function Dishware() {
  const [stockView, setStockView] = useState<'dishware' | 'sets'>('dishware')
  const [kw, setKw] = useState('')
  const [cat, setCat] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<DishwareStockVO[]>([])
  const [sets, setSets] = useState<DishwareSet[]>([])
  const [setItems, setSetItems] = useState<Record<number, { productName: string; quantityInSet: number }[]>>({})
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)

  // 添加/编辑弹窗
  const [modal, setModal] = useState<PhotoModalState>({ open: false, photoPath: '', photoFile: null })
  const [form, setForm] = useState({
    productName: '', category: '', codeNumber: '', size: '', unitPrice: '',
    wenhuaQuantity: 0, centralQuantity: 0, j1Quantity: 0, j2Quantity: 0, j3Quantity: 0,
  })
  // 管理餐厅店面弹窗
  const [restModal, setRestModal] = useState(false)
  const [restAddModal, setRestAddModal] = useState(false)
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([])
  const [restForm, setRestForm] = useState({ id: 0, name: '' })
  // 编辑弹窗：套装设置（对齐旧系统 editModal 套装折叠区）
  const [setCollapsed, setSetCollapsed] = useState(true)
  const [currentSetId, setCurrentSetId] = useState<number | null>(null)
  const [setMembers, setSetMembers] = useState<number[]>([])
  const [origSetMembers, setOrigSetMembers] = useState<number[]>([])
  const [setMemberSel, setSetMemberSel] = useState('')
  // 编辑弹窗：库存数量原始值（用于变化高亮）
  const [origQtys, setOrigQtys] = useState<Record<string, number>>({})
  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    try {
      const [s, st] = await Promise.all([
        getDishwareStock(), getDishwareSets(),
      ])
      setRows(s || [])
      setSets(st || [])
    } catch { showMsg('数据加载失败', 'error') }
  }
  useEffect(() => { load() }, [])

  // 兼容旧链接 dishware_stock?tab=transfer/j1 → 独立页面（对齐线上 URL 形态）
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'transfer') window.location.replace('/dishware_transfer')
    else if (tab === 'j1' || tab === 'j2' || tab === 'j3') window.location.replace('/dishware_break')
  }, [])

  // 套装明细懒加载
  const loadSetItems = async (setId: number) => {
    if (setItems[setId]) return
    try {
      const items = await getDishwareSetItems(setId)
      const infos = await getDishwareInfos()
      const nameMap = new Map((infos || []).map((i: DishwareInfo) => [i.id, i.productName]))
      setSetItems(prev => ({ ...prev, [setId]: (items || []).map((it: any) => ({
        productName: nameMap.get(it.dishwareId) || ('#' + it.dishwareId),
        quantityInSet: it.quantityInSet,
      })) }))
    } catch { /* ignore */ }
  }

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

  const filtered = useMemo(() => rows.filter((r) => {
    if (kw) {
      const q = kw.toLowerCase()
      const searchText = [r.productName || '', r.codeNumber || '', r.category || '', r.size || ''].join(' ').toLowerCase()
      if (!searchText.includes(q)) return false
    }
    if (cat && r.category !== cat) return false
    return true
  }), [rows, kw, cat])

  // 按分类分组（转置矩阵：一个产品一列）。分类字母序、中文最后，分类内按编号排序（对齐旧系统）
  const groups = useMemo(() => {
    const map = new Map<string, DishwareStockVO[]>()
    const byCode = (a: DishwareStockVO, b: DishwareStockVO) => String(a.codeNumber || '').localeCompare(String(b.codeNumber || ''), 'zh-CN', { numeric: true })
    filtered.forEach(r => {
      const c = (r.category || '').trim() || '未分类'
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(r)
    })
    const isChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s)
    const order = Array.from(map.keys()).sort((a, b) => {
      const ca = isChinese(a), cb = isChinese(b)
      if (ca && !cb) return 1
      if (!ca && cb) return -1
      return a.localeCompare(b, 'zh-CN')
    })
    return order.map(c => ({ category: c, items: map.get(c)!.sort(byCode) }))
  }, [filtered])

  const totalAll = filtered.reduce((s, r) => s + Number(r.totalQuantity || 0), 0)

  // ---------- 添加/编辑碗碟 ----------
  const openAdd = () => {
    setForm({ productName: '', category: '', codeNumber: '', size: '', unitPrice: '',
      wenhuaQuantity: 0, centralQuantity: 0, j1Quantity: 0, j2Quantity: 0, j3Quantity: 0 })
    setModal({ open: true, photoPath: '', photoFile: null })
  }
  const openEdit = (r: DishwareStockVO) => {
    setForm({
      productName: r.productName || '', category: r.category || '', codeNumber: r.codeNumber || '',
      size: r.size || '', unitPrice: r.unitPrice ? String(r.unitPrice) : '',
      wenhuaQuantity: Number(r.wenhuaQuantity) || 0, centralQuantity: Number(r.centralQuantity) || 0,
      j1Quantity: Number(r.j1Quantity) || 0, j2Quantity: Number(r.j2Quantity) || 0, j3Quantity: Number(r.j3Quantity) || 0,
    })
    setOrigQtys({
      wenhuaQuantity: Number(r.wenhuaQuantity) || 0, centralQuantity: Number(r.centralQuantity) || 0,
      j1Quantity: Number(r.j1Quantity) || 0, j2Quantity: Number(r.j2Quantity) || 0, j3Quantity: Number(r.j3Quantity) || 0,
    })
    setModal({ open: true, edit: r, photoPath: r.photoPath || '', photoFile: null })
    loadSetInfoForEdit(r.dishwareId)
  }
  const onPickPhoto = (f: File | null) => {
    if (!f) return
    if (!/image\/(jpeg|png|gif)/.test(f.type)) { showMsg('仅支持 JPG/PNG/GIF', 'error'); return }
    setModal(m => ({ ...m, photoFile: f }))
  }
  const saveModal = async () => {
    if (!form.productName || !form.category) { showMsg('碗碟名称和分类必填', 'error'); return }
    try {
      let photoPath = modal.photoPath
      if (modal.photoFile) {
        const up = await uploadDishwarePhoto(modal.photoFile)
        photoPath = up.photoPath
      }
      const payload = {
        productName: form.productName, category: form.category,
        codeNumber: form.codeNumber || undefined, size: form.size || undefined,
        unitPrice: form.unitPrice !== '' ? Number(form.unitPrice) : undefined,
        photoPath: photoPath || undefined,
      }
      if (modal.edit) {
        await updateDishwareInfo(modal.edit.dishwareId, payload)
        await updateDishwareStock(modal.edit.dishwareId, {
          wenhuaQuantity: Number(form.wenhuaQuantity), centralQuantity: Number(form.centralQuantity),
          j1Quantity: Number(form.j1Quantity), j2Quantity: Number(form.j2Quantity), j3Quantity: Number(form.j3Quantity),
        })
        // 同步套装关系（若有变更）
        await saveSetRelation(modal.edit.dishwareId)
        showMsg('碗碟信息已更新')
        setModal(m => ({ ...m, open: false }))
        load()
      } else {
        const created = await createDishwareInfo(payload)
        await updateDishwareStock(created.id, {
          wenhuaQuantity: Number(form.wenhuaQuantity), centralQuantity: Number(form.centralQuantity),
          j1Quantity: Number(form.j1Quantity), j2Quantity: Number(form.j2Quantity), j3Quantity: Number(form.j3Quantity),
        })
        showMsg('碗碟已添加')
        setModal(m => ({ ...m, open: false }))
        await load()
        // 转置表格：横向滚动到新碗碟所在列并高亮整列
        const savedCode = created.codeNumber || created.productName || ''
        setTimeout(() => {
          const tds = document.querySelectorAll('tr[data-row="编号"] td')
          let targetTd: Element | null = null
          for (const td of tds) {
            if (td.textContent && td.textContent.trim() === savedCode) { targetTd = td; break }
          }
          if (targetTd) {
            const wrapper = document.querySelector('.category-table-wrapper')
            if (wrapper) wrapper.scrollLeft = Math.max(0, (targetTd as HTMLElement).offsetLeft - 80)
            const colIndex = Array.from(targetTd.parentElement!.children).indexOf(targetTd)
            const table = targetTd.closest('table')
            if (table) {
              table.querySelectorAll('tbody tr').forEach((tr) => {
                const td = tr.children[colIndex]
                if (td) td.classList.add('dishware-col-flash')
              })
              setTimeout(() => table.querySelectorAll('.dishware-col-flash').forEach((td) => td.classList.remove('dishware-col-flash')), 3000)
            }
          }
        }, 250)
      }
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
  }
  const removeRow = async (r: DishwareStockVO) => {
    if (!window.confirm(`确定删除碗碟：${r.productName}？`)) return
    try { await deleteDishwareInfo(r.dishwareId); load(); showMsg('已删除') } catch { showMsg('删除失败', 'error') }
  }

  // ---------- 编辑弹窗：套装设置（对齐旧系统 loadDishwareSetInfo） ----------
  const loadSetInfoForEdit = async (dishwareId: number) => {
    setCurrentSetId(null); setSetMembers([]); setOrigSetMembers([]); setSetCollapsed(true)
    try {
      const allSets = await getDishwareSets()
      const rels: { setId: number; dishwareId: number }[] = []
      await Promise.all((allSets || []).map(async (s) => {
        const items = await getDishwareSetItems(s.id)
        ;(items || []).forEach(it => rels.push({ setId: s.id, dishwareId: it.dishwareId }))
      }))
      const mine = rels.filter(r => r.dishwareId === dishwareId)
      if (mine.length > 0) {
        const sid = mine[0].setId
        const members = rels.filter(r => r.setId === sid).map(r => r.dishwareId)
        setCurrentSetId(sid)
        setSetMembers(members)
        setOrigSetMembers(members)
        // 如有套装成员，自动展开
        if (members.length > 0) setSetCollapsed(false)
      }
    } catch { /* ignore */ }
  }

  // 当前套装成员的编号列表（只显示编号，对齐旧系统）
  const currentSetCodes = useMemo(() => setMembers
    .map(id => (rows.find(r => r.dishwareId === id)?.codeNumber || String(id)))
    .filter(Boolean).join(', '), [setMembers, rows])

  // 可添加成员：排除当前编辑的碗碟，按编号排序
  const setMemberOptions = useMemo(() => {
    const curId = modal.edit?.dishwareId
    return rows.filter(r => r.dishwareId !== curId)
      .sort((a, b) => String(a.codeNumber || '').localeCompare(String(b.codeNumber || ''), 'zh-CN', { numeric: true }))
  }, [rows, modal.edit])

  const addSetMember = () => {
    if (!setMemberSel) { showMsg('请选择要添加的碗碟', 'warning'); return }
    const curId = modal.edit?.dishwareId
    if (!curId) return
    const id = Number(setMemberSel)
    const next = [...setMembers]
    // 对齐旧系统：添加成员时确保当前碗碟也在套装中
    if (!next.includes(curId)) next.push(curId)
    if (!next.includes(id)) next.push(id)
    setSetMembers(next)
    setSetMemberSel('')
  }

  const removeSetMember = (id: number) => setSetMembers(prev => prev.filter(x => x !== id))

  // 从套装中移除当前碗碟（对齐旧系统 removeFromSet：立即生效）
  const removeFromSet = async () => {
    const curId = modal.edit?.dishwareId
    if (!curId || !currentSetId) return
    if (!window.confirm('确定要从套装中移除这个碗碟吗？')) return
    try {
      const remaining = setMembers.filter(id => id !== curId)
      if (remaining.length === 0) {
        await deleteDishwareSet(currentSetId)
      } else {
        await saveDishwareSetItems(currentSetId, remaining.map(id => ({ dishwareId: id, quantityInSet: 1 })))
      }
      setCurrentSetId(null); setSetMembers([]); setOrigSetMembers([]); setSetCollapsed(true)
      load(); showMsg('已从套装中移除')
    } catch { showMsg('移除失败', 'error') }
  }

  // 保存时同步套装关系（对齐旧系统 update_dishware_set_relation）
  const saveSetRelation = async (dishwareId: number) => {
    const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b)
    if (sorted(setMembers).join() === sorted(origSetMembers).join()) return
    const onlySelf = setMembers.length === 1 && setMembers[0] === dishwareId
    if (onlySelf) {
      // 只剩当前碗碟一个成员 → 自动删除套装
      if (currentSetId) await deleteDishwareSet(currentSetId)
      return
    }
    const items = setMembers.map(id => ({ dishwareId: id, quantityInSet: 1 }))
    if (currentSetId) {
      await saveDishwareSetItems(currentSetId, items)
    } else {
      // 无现成套装 → 创建新套装（对齐旧系统：SET+时间戳、名称=首个成员+套装、价格=成员单价和）
      const nameOf = (id: number) => rows.find(r => r.dishwareId === id)?.productName || `#${id}`
      const priceOf = (id: number) => Number(rows.find(r => r.dishwareId === id)?.unitPrice || 0)
      const created = await createDishwareSet({
        setName: nameOf(dishwareId) + ' 套装',
        setCode: 'SET' + Date.now(),
        setPrice: setMembers.reduce((s, id) => s + priceOf(id), 0) || undefined,
        isActive: true,
      })
      await saveDishwareSetItems(created.id, items)
    }
  }

  // ---------- 管理餐厅店面（对齐旧系统 restaurantModal） ----------
  const loadLocations = async () => {
    try { setLocations((await getDishwareLocations()) || []) } catch { showMsg('加载餐厅店面失败', 'error') }
  }
  const openRestModal = () => { setRestModal(true); loadLocations() }
  const saveRest = async () => {
    if (!restForm.name.trim()) { showMsg('餐厅店面名称不能为空', 'error'); return }
    try {
      if (restForm.id) await updateDishwareLocation(restForm.id, { name: restForm.name.trim() })
      else await createDishwareLocation({ name: restForm.name.trim() })
      setRestAddModal(false); setRestForm({ id: 0, name: '' })
      loadLocations(); showMsg('已保存')
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
  }
  const removeRest = async (id: number, name: string) => {
    if (!window.confirm(`确定要删除这个餐厅店面（${name}）吗？删除后该店面的库存数据将被移除。`)) return
    try { await deleteDishwareLocation(id); loadLocations(); showMsg('已删除') } catch (e: any) { showMsg(e?.response?.data?.message || '删除失败', 'error') }
  }

  // ---------- 导出 CSV ----------
  const exportData = () => {
    if (filtered.length === 0) { showMsg('没有数据可导出', 'error'); return }
    const headers = ['产品名称', '编号', '分类', '尺寸', '单价', '文化楼', '中央', 'J1', 'J2', 'J3', '总数']
    let csv = '\uFEFF' + headers.join(',') + '\n'
    filtered.forEach(r => {
      csv += [r.productName, r.codeNumber || '', r.category || '', r.size || '', r.unitPrice ?? '',
        r.wenhuaQuantity, r.centralQuantity, r.j1Quantity, r.j2Quantity, r.j3Quantity, r.totalQuantity].join(',') + '\n'
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `dishware_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    showMsg('导出成功')
  }

  const fmtPrice = (p: any) => (p === null || p === undefined || p === '') ? '-' : 'RM' + Number(p).toFixed(2)

  return (
    <div className="dw-root">
      <div className="container">
        <div className="header">
          <div><h1>总库存</h1></div>
          <div className="controls">
            <DishwareViewSelector current="stock" />
          </div>
        </div>

        {/* 统一顶部行 */}
        <div className="unified-header-row">
          <div className="header-center-section">
            <div>
              <span className="filter-label">分类</span>
              <select className="unified-search-input" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">全部分类</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <span className="filter-label">类型</span>
              <select className="unified-search-input" value={stockView} onChange={(e) => setStockView(e.target.value as any)}>
                <option value="dishware">单品</option>
                <option value="sets">套装</option>
              </select>
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
            <button className="btn btn-success" onClick={openAdd}><i className="fas fa-plus" /> 添加碗碟</button>
            <button className="btn btn-warning" onClick={exportData}><i className="fas fa-download" /> 导出数据</button>

            <div className="header-stats">
              <span>显示记录: <span className="stat-value">{stockView === 'dishware' ? filtered.length : sets.length}</span></span>
              <span>总记录: <span className="stat-value">{stockView === 'dishware' ? rows.length : sets.length}</span></span>
            </div>
          </div>
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {stockView === 'dishware' && (
            <div className="categories-container" style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
              {groups.map(g => (
                <div className="category-section" key={g.category}>
                  <div className="category-header">
                    <div className="category-title">
                      <span>{g.category}</span>
                      <span className="category-count">({g.items.length} 项)</span>
                    </div>
                  </div>
                  <div className="category-table-wrapper">
                    <table className="stock-table transposed">
                      <tbody>
                        {/* NO 行 */}
                        <tr data-row="NO">
                          <th className="row-header">NO</th>
                          {g.items.map((r, i) => <td key={'no-' + r.dishwareId} data-col-bg={String(i % 2)}>{i + 1}</td>)}
                        </tr>
                        {/* 照片行（比普通行更高） */}
                        <tr data-row="照片">
                          <th className="row-header">照片</th>
                          {g.items.map((r, i) => (
                            <td key={'ph-' + r.dishwareId} data-col-bg={String(i % 2)}>
                              {r.photoPath
                                ? <img src={r.photoPath} alt={r.productName} className="product-photo" />
                                : <div className="no-photo"><i className="fas fa-image" /></div>}
                            </td>
                          ))}
                        </tr>
                        {/* 编号 */}
                        <tr data-row="编号">
                          <th className="row-header">编号</th>
                          {g.items.map((r, i) => <td key={'cn-' + r.dishwareId} data-col-bg={String(i % 2)}>{r.codeNumber || '-'}</td>)}
                        </tr>
                        {/* 分类 */}
                        <tr data-row="分类">
                          <th className="row-header">分类</th>
                          {g.items.map((r, i) => <td key={'ca-' + r.dishwareId} data-col-bg={String(i % 2)}>{r.category || '-'}</td>)}
                        </tr>
                        {/* 尺寸 */}
                        <tr data-row="尺寸">
                          <th className="row-header">尺寸</th>
                          {g.items.map((r, i) => <td key={'sz-' + r.dishwareId} data-col-bg={String(i % 2)}>{r.size || '-'}</td>)}
                        </tr>
                        {/* 单价 */}
                        <tr data-row="单价">
                          <th className="row-header">单价</th>
                          {g.items.map((r, i) => <td key={'pr-' + r.dishwareId} data-col-bg={String(i % 2)}>
                            <div className="currency-display"><span className="currency-symbol">RM</span><span className="currency-amount">{r.unitPrice ? Number(r.unitPrice).toFixed(2) : '0.00'}</span></div>
                          </td>)}
                        </tr>
                        {/* 库存行（浅灰/白交替） */}
                        {STOCK_LOCATIONS.map((l, li) => (
                          <tr key={l.key} data-restaurant-row="1" data-restaurant-alt={String(li % 2)}>
                            <th className="row-header">{l.label}</th>
                            {g.items.map((r, i) => <td key={l.key + '-' + r.dishwareId} data-col-bg={String(i % 2)}>{Number(r[l.key as keyof DishwareStockVO] || 0)}</td>)}
                          </tr>
                        ))}
                        {/* 总数行（暗灰背景） */}
                        <tr className="total-row" data-row="总数">
                          <th className="row-header">总数</th>
                          {g.items.map((r, i) => <td key={'tt-' + r.dishwareId} data-col-bg={String(i % 2)}><b>{r.totalQuantity}</b></td>)}
                        </tr>
                        {/* 操作行（暗灰背景） */}
                        <tr className="action-row" data-row="操作">
                          <th className="row-header">操作</th>
                          {g.items.map((r, i) => (
                            <td key={'ac-' + r.dishwareId} data-col-bg={String(i % 2)}>
                              <button className="action-btn edit-btn" onClick={() => openEdit(r)} title="编辑"><i className="fas fa-edit" /></button>
                              <button className="action-btn delete-btn" onClick={() => removeRow(r)} title="删除"><i className="fas fa-trash" /></button>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: '#999', background: '#fff', borderRadius: 12, border: '2px solid #000' }}>
                  暂无碗碟数据
                </div>
              )}
            </div>
          )}

          {stockView === 'sets' && (
            <div className="table-container">
              <div className="table-scroll-container">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>序号</th><th>套装名称</th><th>套装编号</th><th>包含项目</th><th>单价 (RM)</th>
                      <th>文华楼</th><th>中央</th><th>J1</th><th>J2</th><th>J3</th><th>总库存</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sets.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td><b>{s.setName}</b></td>
                        <td>{s.setCode || '-'}</td>
                        <td>
                          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => loadSetItems(s.id)} title="查看明细">
                            {(setItems[s.id] || []).map(x => x.productName + ' ×' + x.quantityInSet).join('、') || '查看明细'}
                          </button>
                        </td>
                        <td>{fmtPrice(s.setPrice)}</td>
                        <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
                        <td><b>-</b></td>
                        <td>
                          <button className="action-btn delete-btn" onClick={async () => {
                            if (!window.confirm(`确定删除套装：${s.setName}？`)) return
                            try { await deleteDishwareSet(s.id); load(); showMsg('已删除') } catch { showMsg('删除失败', 'error') }
                          }} title="删除"><i className="fas fa-trash" /></button>
                        </td>
                      </tr>
                    ))}
                    {sets.length === 0 && <tr><td colSpan={12} style={{ padding: 40, color: '#999' }}>暂无套装数据</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 添加/编辑碗碟弹窗 */}
      {modal.open && (
        <div id={modal.edit ? 'editModal' : 'addModal'} className="modal" style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setModal(m => ({ ...m, open: false }))}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{modal.edit ? <><i className="fas fa-edit" style={{ marginRight: 8, opacity: .7 }} /> 编辑碗碟信息</> : '添加碗碟信息'}</h2>
              <ModalClose onClick={() => setModal(m => ({ ...m, open: false }))} />
            </div>
            <div className="modal-body">
              {modal.edit ? (
                /* ===== 编辑模式：左照片面板 + 右表单（对齐旧系统 editModal） ===== */
                <div className="edit-modal-body">
                  <div className="edit-modal-photo-panel">
                    <div className="photo-panel-label" style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                      <i className="fas fa-camera" style={{ marginRight: 4 }} /> 产品照片
                    </div>
                    <div className="photo-upload-area" onClick={() => document.getElementById('dw-photo-input')?.click()}>
                      <div className="photo-upload-icon"><i className="fas fa-cloud-upload-alt" /></div>
                      <div className="photo-upload-text">{modal.photoPath || modal.photoFile ? '点击更换照片' : '点击上传照片'}</div>
                      <div className="photo-upload-hint">JPG, PNG, GIF · 最大 5MB</div>
                      {modal.photoFile && <img src={URL.createObjectURL(modal.photoFile)} className="photo-preview" alt="preview" />}
                      {!modal.photoFile && modal.photoPath && <img src={modal.photoPath} className="photo-preview" alt="preview" />}
                    </div>
                    <input id="dw-photo-input" type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={(e) => onPickPhoto(e.target.files?.[0] || null)} />
                    {(modal.photoPath || modal.photoFile) && (
                      <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }}
                        onClick={() => setModal(m => ({ ...m, photoPath: '', photoFile: null }))}>
                        <i className="fas fa-trash" /> 移除照片
                      </button>
                    )}
                    {/* 快捷信息（对齐旧系统 photo-panel-info） */}
                    <div className="photo-panel-info" style={{ marginTop: 12, background: '#f9fafb', borderRadius: 8, padding: 12 }}>
                      <div className="photo-info-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                        <span className="photo-info-label" style={{ color: '#6b7280' }}>编号</span>
                        <span className="photo-info-value" style={{ fontWeight: 600 }}>{form.codeNumber || form.category || '--'}</span>
                      </div>
                      <div className="photo-info-item" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span className="photo-info-label" style={{ color: '#6b7280' }}>单价</span>
                        <span className="photo-info-value" style={{ fontWeight: 600 }}>{form.unitPrice ? 'RM' + Number(form.unitPrice).toFixed(2) : '--'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="edit-modal-form-panel">
                    <div className="edit-section">
                      <div className="edit-section-title"><i className="fas fa-info-circle" /> 基本信息</div>
                      <div className="edit-fields-grid">
                        <div className="form-group edit-field-full">
                          <label className="required">碗碟名称</label>
                          <input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="required">分类</label>
                          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                            <option value="">请选择分类</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>编号</label>
                          <input value={form.codeNumber} onChange={(e) => setForm({ ...form, codeNumber: e.target.value })} placeholder="001" maxLength={10} />
                        </div>
                        <div className="form-group">
                          <label>尺寸</label>
                          <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="例如：直径15cm" />
                        </div>
                        <div className="form-group">
                          <label className="required">单价 (RM)</label>
                          <input type="number" step="0.01" min="0" value={form.unitPrice}
                            onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" />
                        </div>
                      </div>
                    </div>
                    <div className="edit-section">
                      <div className="edit-section-title">
                        <span><i className="fas fa-cubes" /> 库存数量</span>
                        <span className="edit-stock-total-badge">总计: <strong>
                          {STOCK_LOCATIONS.reduce((s, l) => s + Number(form[l.key as keyof typeof form] || 0), 0)}
                        </strong></span>
                      </div>
                      <div className="quantity-row">
                        {STOCK_LOCATIONS.map(l => {
                          const val = Number(form[l.key as keyof typeof form] || 0)
                          const orig = origQtys[l.key] ?? val
                          const cls = val < orig ? 'quantity-field qty-changed'
                            : val > orig ? 'quantity-field qty-increased'
                            : 'quantity-field'
                          return (
                            <div className={cls} key={l.key}>
                              <label>{l.label}</label>
                              <input type="number" min="0" value={form[l.key as keyof typeof form]}
                                onChange={(e) => setForm({ ...form, [l.key]: Number(e.target.value) } as any)} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {/* 套装设置区（可折叠，对齐旧系统 edit-section-collapsible） */}
                    <div className="edit-section edit-section-collapsible">
                      <div className="edit-section-title edit-section-toggle"
                        onClick={() => setSetCollapsed(!setCollapsed)} style={{ cursor: 'pointer', justifyContent: 'space-between' }}>
                        <span><i className="fas fa-layer-group" /> 套装设置</span>
                        <i className={'fas fa-chevron-down edit-section-arrow' + (setCollapsed ? '' : ' expanded')} />
                      </div>
                      <div className="edit-section-body" style={{ display: setCollapsed ? 'none' : '' }}>
                        <div id="set-settings-container">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>当前套装成员：</span>
                              <span id="current-set-members" style={{ color: '#666' }}>{currentSetCodes || '暂无'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <label style={{ fontWeight: 600, margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>添加套装成员：</label>
                              <select id="set-member-select" value={setMemberSel}
                                onChange={(e) => setSetMemberSel(e.target.value)}
                                style={{ flex: 1, minWidth: 180, padding: 8, border: '1px solid #ddd', borderRadius: 4 }}>
                                <option value="">请选择要加入套装的碗碟</option>
                                {setMemberOptions.map(r => (
                                  <option key={r.dishwareId} value={r.dishwareId}>
                                    {r.codeNumber || ''} - {r.productName || ''}
                                  </option>
                                ))}
                              </select>
                              <button type="button" className="btn btn-primary" onClick={addSetMember}
                                style={{ padding: '8px 16px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                <i className="fas fa-plus" /> 添加
                              </button>
                            </div>
                          </div>
                          <div id="selected-set-members" style={{ marginTop: 12 }}>
                            {setMembers.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 600, marginRight: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>已选择成员：</span>
                                {setMembers.map(id => {
                                  const isCurrent = id === modal.edit?.dishwareId
                                  const row = rows.find(r => r.dishwareId === id)
                                  const code = (row?.codeNumber || String(id)).trim()
                                  return (
                                    <span key={id} style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                                      background: isCurrent ? '#fef3c7' : '#e0e7ff', borderRadius: 4, fontSize: 12,
                                    }}>
                                      {code || '未知编号'}
                                      {isCurrent && <span style={{ color: '#f59e0b', fontWeight: 600 }}>(当前)</span>}
                                      {!isCurrent && (
                                        <button type="button" onClick={() => removeSetMember(id)}
                                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, marginLeft: 4 }}
                                          title="移除">
                                          <i className="fas fa-times" />
                                        </button>
                                      )}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ddd' }}>
                            <button type="button" onClick={removeFromSet} disabled={!currentSetId}
                              className="btn btn-secondary" style={{ padding: '8px 16px' }}>
                              <i className="fas fa-unlink" /> 从套装中移除
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ===== 添加模式：表单式 grid + 底部照片上传（对齐旧系统 addModal） ===== */
                <div className="modal-form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <div className="form-group">
                    <label className="required">碗碟名称</label>
                    <input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="required">分类</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="">请选择分类</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>产品编号</label>
                    <input value={form.codeNumber} onChange={(e) => setForm({ ...form, codeNumber: e.target.value })} placeholder="001" maxLength={10} />
                  </div>
                  <div className="form-group">
                    <label>尺寸规格</label>
                    <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="例如：直径15cm" />
                  </div>
                  <div className="form-group">
                    <label>单价 (RM)</label>
                    <input type="number" step="0.01" min="0" value={form.unitPrice}
                      onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>照片上传</label>
                    <div className="photo-upload-area" onClick={() => document.getElementById('dw-photo-input')?.click()}>
                      <div className="photo-upload-icon"><i className="fas fa-cloud-upload-alt" /></div>
                      <div className="photo-upload-text">{modal.photoPath || modal.photoFile ? '点击更换照片或拖拽照片到此处' : '点击上传照片或拖拽照片到此处'}</div>
                      <div className="photo-upload-hint">支持 JPG, PNG, GIF 格式（HEIC 自动转换），最大 5MB</div>
                      {modal.photoFile && <img src={URL.createObjectURL(modal.photoFile)} className="photo-preview" alt="preview" />}
                      {!modal.photoFile && modal.photoPath && <img src={modal.photoPath} className="photo-preview" alt="preview" />}
                    </div>
                    <input id="dw-photo-input" type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={(e) => onPickPhoto(e.target.files?.[0] || null)} />
                    {(modal.photoPath || modal.photoFile) && (
                      <button className="btn btn-secondary" style={{ marginTop: 8 }}
                        onClick={() => setModal(m => ({ ...m, photoPath: '', photoFile: null }))}>
                        <i className="fas fa-trash" /> 移除照片
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {modal.edit ? (
              <div className="modal-actions edit-modal-actions">
                <button type="button" className="btn edit-btn-cancel" onClick={() => setModal(m => ({ ...m, open: false }))}>
                  <i className="fas fa-times" /> 取消
                </button>
                <button type="button" className="btn edit-btn-save" onClick={saveModal}>
                  <i className="fas fa-check" /> 保存更改
                </button>
              </div>
            ) : (
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setModal(m => ({ ...m, open: false }))}>取消</button>
                <button className="btn btn-primary" onClick={saveModal}><i className="fas fa-save" /> 保存碗碟信息</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 管理餐厅店面弹窗（对齐旧系统 restaurantModal） */}
      {restModal && (
        <div id="restaurantModal" className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setRestModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h2 className="modal-title">管理餐厅店面</h2>
              <ModalClose onClick={() => setRestModal(false)} />
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 20 }}>
                <button className="btn btn-success" onClick={() => { setRestForm({ id: 0, name: '' }); setRestAddModal(true) }}>
                  <i className="fas fa-plus" /> 添加餐厅店面
                </button>
              </div>
              <div className="table-container">
                <div className="table-scroll-container" style={{ maxHeight: 400, overflow: 'auto' }}>
                  <table className="stock-table">
                    <thead><tr><th>序号</th><th>餐厅店面名称</th><th>操作</th></tr></thead>
                    <tbody>
                      {locations.map((l, i) => (
                        <tr key={l.id}>
                          <td>{i + 1}</td>
                          <td>{l.name}</td>
                          <td>
                            <button className="action-btn edit-btn" onClick={() => { setRestForm({ id: l.id, name: l.name }); setRestAddModal(true) }} title="编辑"><i className="fas fa-edit" /></button>
                            <button className="action-btn delete-btn" onClick={() => removeRest(l.id, l.name)} title="删除"><i className="fas fa-trash" /></button>
                          </td>
                        </tr>
                      ))}
                      {locations.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>暂无餐厅店面数据</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRestModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {/* 添加/编辑餐厅店面弹窗 */}
      {restAddModal && (
        <div id="addRestaurantModal" className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setRestAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title">{restForm.id ? '编辑餐厅店面' : '添加餐厅店面'}</h2>
              <ModalClose onClick={() => setRestAddModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="required">餐厅店面名称</label>
                <input type="text" value={restForm.name} placeholder="例如：新店"
                  onChange={(e) => setRestForm({ ...restForm, name: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRestAddModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveRest}><i className="fas fa-save" /> 保存</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div className={'toast toast-' + toast.type}><span>{toast.msg}</span></div>
        </div>
      )}
    </div>
  )
}
