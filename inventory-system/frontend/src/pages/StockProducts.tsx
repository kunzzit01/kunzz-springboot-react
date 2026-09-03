import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStockProducts, createStockProduct, updateStockProduct, deleteStockProduct, approveStockProduct, getMe, getStockPerms } from '../api'
import { useRealtime } from '../utils/useRealtime'
import { flashAfterRow, useRowHighlight } from '../utils/rowHighlight'
import '../styles/stockproducts.css'
import { showToast } from '../utils/toast'

interface ProductRow {
  id?: number
  date?: string
  time?: string
  product_code?: string
  product_name?: string
  specification?: string
  price?: string
  category?: string
  supplier?: string
  applicant?: string
  approver?: string
  system_assign?: string
  freezer_category?: string
  /** 位次：同冰箱分类内排序（0/空 = 未设置；总库存排序用，货品资料可编辑） */
  freezer_position?: number | string | null
  /** 总览打码行（真实分配超出员工权限，只显示交集；只读防覆盖） */
  _assignMasked?: boolean
}

const SYSTEMS = [
  { key: 'overview', label: '总览', value: '' },
  { key: 'central', label: '中央', value: 'Central' },
  { key: 'j1', label: 'J1', value: 'J1' },
  { key: 'j2', label: 'J2', value: 'J2' },
  { key: 'j3', label: 'J3', value: 'J3' },
]
const VIEW_NAMES: Record<string, string> = { list: '总库存', records: '进出货', remark: '货品备注', product: '货品种类', sot: '货品异常' }

const SPEC_OPTIONS = ['Tub', 'Kilo', 'Piece', 'Bottle', 'Box', 'Packet', 'Carton', 'Tin', 'Roll', 'Nos', 'mL', 'Glass']
const CATEGORY_OPTIONS = ['Service Line', 'Sake', 'Kitchen', 'Sushi Bar']
const SYSTEM_OPTIONS = [
  { value: 'Central', label: '中央' },
  { value: 'J1', label: 'J1' },
  { value: 'J2', label: 'J2' },
  { value: 'J3', label: 'J3' },
]
export const FREEZER_OPTIONS = ['K1-1', 'K1-2', 'K1-3', 'K1-4', 'K1-5', 'K1-6', 'K1-7', 'C-1', 'KDI-1', 'KDI-2', 'KDI-3', 'KDI-4', 'S1-1', 'S1-2', 'S1-3', 'S1-4', 'SBS-1', 'SBS-2', 'SBDI-1', 'SBDI-2']

/** 多选单元格（system_assign / freezer_category） */
function MultiSelect({ value, onChange, disabled, options }: { value?: string; onChange: (v: string) => void; disabled?: boolean; options: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = (value || '').split(',').map(v => v.trim()).filter(Boolean)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
    onChange(next.join(','))
  }
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div
        className="multiselect-trigger"
        onClick={(e) => { if (!disabled) { e.stopPropagation(); setOpen(!open) } }}
        style={{
          width: '100%', height: 'clamp(30px, 2.08vw, 40px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#f9fafb' : '#f0fdf4', fontSize: 'clamp(8px,0.74vw,14px)',
          color: '#374151', padding: '0 8px', userSelect: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.length > 0 ? selected.join(', ') : '选择'}
        </span>
        {!disabled && <i className="fas fa-chevron-down" style={{ fontSize: 10, flexShrink: 0 }} />}
      </div>
      {open && !disabled && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 1000, background: '#fff',
          border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          minWidth: 150, maxHeight: 220, overflow: 'auto', marginTop: 2,
        }}>
          {options.map(v => (
            <div key={v} onClick={() => toggle(v)}
              style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8f5eb')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <input type="checkbox" checked={selected.includes(v)} readOnly style={{ pointerEvents: 'none' }} />
              {v}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StockProducts() {
  const navigate = useNavigate()
  // 从 URL 读取系统（对齐 ?system=overview）
  const urlSystem = new URL(window.location.href).searchParams.get('system')
  const [system, setSystem] = useState(urlSystem && SYSTEMS.some(s => s.key === urlSystem) ? urlSystem : 'overview')
  const [viewOpen, setViewOpen] = useState(false)
  const [sysOpen, setSysOpen] = useState(false)
  const [rows, setRows] = useState<ProductRow[]>([])
  // 新增保存后定位高亮（按货品名）
  const { flash, isHl } = useRowHighlight((r: any) => String(r.product_name))
  const [newRows, setNewRows] = useState<ProductRow[]>([])
  // 编辑已有行（对齐 toggleEdit：编辑/保存单行）
  const [editing, setEditing] = useState<Set<number>>(new Set())
  const [drafts, setDrafts] = useState<Record<number, ProductRow>>({})
  const [kw, setKw] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [currentUser, setCurrentUser] = useState('')
  const [showTop, setShowTop] = useState(false)
  // 页面权限（对齐旧系统 check_permissions.php：无记录时默认全部可用，兼容 demo）
  const [canApply, setCanApply] = useState(true)
  const [canApprove, setCanApprove] = useState(true)
  const [allowedSystems, setAllowedSystems] = useState<string[]>([])
  const [allowedViews, setAllowedViews] = useState<string[]>([])
  // 权限加载完成后重刷一次列表（总览需按员工系统权限过滤）
  const [permsLoaded, setPermsLoaded] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  // 当前用户（对齐 CURRENT_USER_APPLICANT：nickname > username_cn > username）
  useEffect(() => {
    getMe().then((u: any) => setCurrentUser(u?.displayName || u?.username || '')).catch(() => {})
    // 页面权限：无配置（demo）默认全部可用；有配置则按 views/systems 控制（对齐 check_permissions.php）
    getStockPerms().then((p: any) => {
      // configured = 后端确认存在 stock_inventory 权限记录（全空 = 管理员明确关闭，不再当作未配置放行）
      const hasConfig = p == null ? false : (p.configured ?? ((p.systems || []).length > 0 || (p.views || []).length > 0))
      if (hasConfig) {
        setCanApply(!!p?.canApply)
        setCanApprove(!!p?.canApprove)
        const perms = p?.systems || []
        setAllowedSystems(perms)
        setAllowedViews(p?.views || [])
        // 无权限的系统不展示：当前 system 不在权限内 → 自动切到第一个有权限的系统（按 SYSTEMS 顺序）
        // 总览始终可见（对齐旧系统 stockproductname.js rebuildProductSystemDropdown：
        // 总览是跨店共用货品查阅功能，不受分店权限限制）
        setSystem(prev => {
          const allowedKeys = SYSTEMS
            .filter(s => s.key === 'overview' || perms.includes(s.key) || perms.some((x: string) => x.toLowerCase() === s.value.toLowerCase()))
            .map(s => s.key)
          if (allowedKeys.includes(prev)) return prev
          return allowedKeys.length > 0 ? allowedKeys[0] : prev
        })
        setPermsLoaded(true)
      }
    }).catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const d = await getStockProducts(system === 'overview' ? '' : system, kw || undefined)
      // 总览 = 全部货品总目录（不再按 ≥2 间过滤；单一间的也展示）
      // 权限过滤：有权限配置的员工只看与自己系统权限有交集 ≥ 1 间的货品，
      // 且「系统分配」列只展示交集部分（打码，如 Central,J1,J2,J3 → J2+J3 员工只看到 J2,J3）；
      // 打码行只读（_assignMasked），防止保存时用打码值覆盖真实分配；无配置（admin/demo）显示真实分配
      const allowed = allowedSystems.map((x: string) => String(x).toLowerCase())
      const restricted = allowed.length > 0
      const rawItems: any[] = []
      for (const i of (d.items || [])) {
        if (system !== 'overview') { rawItems.push(i); continue }
        const assigned = String(i.system_assign || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        const visible = restricted ? assigned.filter((a: string) => allowed.includes(a.toLowerCase())) : assigned
        if (visible.length >= 1) {
          const masked = restricted && visible.length < assigned.length
          rawItems.push(masked ? { ...i, system_assign: visible.join(','), _assignMasked: true } : i)
        }
      }
      // 待批准在前（按产品名）、已批准在后（按批准时间 updated_at 升序：最新批准的排最后）
      const pending = rawItems.filter((i: any) => !i.approver)
      const approved = rawItems.filter((i: any) => i.approver)
      const sortByName = (a: any, b: any) => String(a.product_name || '').localeCompare(String(b.product_name || ''))
      const sortByApprovedTime = (a: any, b: any) => {
        const ta = String(a.updated_at || '')
        const tb = String(b.updated_at || '')
        return ta.localeCompare(tb) || Number(a.id) - Number(b.id)
      }
      pending.sort(sortByName)
      approved.sort(sortByApprovedTime)
      setRows([...pending, ...approved])
      setEditing(new Set())
      setDrafts({})
      showMsg(`库存数据加载成功，共找到 ${rawItems.length} 条记录`, 'success')
    } catch {
      setRows([])
      showMsg('库存数据加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [system]) // eslint-disable-line react-hooks/exhaustive-deps
  // 权限到达后重刷：总览按员工系统权限过滤（首次加载时权限尚未返回，先按无限制渲染）
  useEffect(() => { if (permsLoaded) load() }, [permsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // 实时：货品种类变更（新增/编辑/删除/批准）自动刷新；编辑/保存/批准中不打断，结束后补刷
  useRealtime('*', () => load(), 1000, 3000, () => saving || approvingId !== null || editing.size > 0 || newRows.length > 0)

  // smartSearch：点击外部且输入为空时折叠
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const w = document.querySelector('.sp-root .smartSearchWrapper')
      if (w && w.contains(t)) return
      if (!searchRef.current?.value) setSearchExpanded(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  // 统计（对齐 updateStats：总记录/已批准/待批准）
  const stats = useMemo(() => {
    const all = [...newRows, ...rows]
    return {
      total: all.length,
      approved: all.filter(r => r.approver).length,
      pending: all.filter(r => !r.approver).length,
    }
  }, [rows, newRows])

  // 添加新行（对齐 addNewRow：系统分配默认当前系统，申请人默认当前用户）
  const addRow = () => {
    const sys = SYSTEMS.find(s => s.key === system)!
    setNewRows(prev => [...prev, {
      id: undefined,
      product_code: '', product_name: '', specification: '', category: '',
      supplier: '', applicant: currentUser || '', approver: '',
      system_assign: system === 'overview' ? '' : sys.value,
      freezer_category: '',
      freezer_position: '',
    }])
    // 创建空行后自动滚动到待填写位置
    setTimeout(() => {
      const sc = document.querySelector('.table-scroll-container')
      const rows = document.querySelectorAll('#excel-table tbody tr.new-row')
      if (sc && rows.length) {
        const last = rows[rows.length - 1]
        sc.scrollTop = Math.max(0, (last as HTMLElement).offsetTop - (((document.querySelector('#excel-table thead') as HTMLElement | null)?.offsetHeight) || 40) - 8)
      }
    }, 200)
  }

  const setNew = (idx: number, patch: Partial<ProductRow>) => {
    setNewRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  const removeNewRow = (idx: number) => setNewRows(prev => prev.filter((_, i) => i !== idx))

  // 编辑已有行（对齐 toggleEdit：点编辑进入编辑模式，再点保存）
  const startEdit = (r: ProductRow) => {
    const id = r.id!
    setEditing(prev => new Set(prev).add(id))
    setDrafts(prev => ({ ...prev, [id]: { ...r } }))
  }
  const cancelEdit = (id: number) => {
    setEditing(prev => { const n = new Set(prev); n.delete(id); return n })
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
  }
  const setDraft = (id: number, patch: Partial<ProductRow>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }
  const saveEdit = async (id: number) => {
    const d = drafts[id]
    if (!d) return
    try {
      // 对齐 saveSingleRowData：总览页保持原批准状态；系统页编辑后清除批准状态需重新批准
      const approver = system === 'overview' ? (d.approver || '') : ''
      await updateStockProduct(id, { ...d, system_assign: system === 'overview' ? (d.system_assign || '') : currentSys.value, applicant: d.applicant || currentUser, approver })
      cancelEdit(id)
      await load()
      showMsg('记录已保存', 'success')
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
  }

  // 删除行（对齐 deleteRow：确认 + DELETE）
  const removeRow = async (r: ProductRow) => {
    if (!window.confirm('确定要删除这行数据吗？此操作不可恢复！')) return
    if (r.id) {
      try {
        await deleteStockProduct(r.id)
        await load()
        showMsg('行已删除', 'success')
      } catch (e: any) { showMsg(e?.response?.data?.message || '删除失败', 'error') }
    } else {
      const idx = newRows.indexOf(r)
      if (idx >= 0) removeNewRow(idx)
      showMsg('行已删除', 'success')
    }
  }

  // 保存单条新增行（对齐编辑行 save-mode：填写完整后就地保存）
  const saveNewRow = async (r: ProductRow, idx: number) => {
    if (saving) return
    if (!r.product_code || !r.product_name || !r.specification || !r.category || !r.supplier) {
      showMsg('请填写完整的货品编号、名称、规格、类型、供应商', 'error')
      return
    }
    setSaving(true)
    try {
      await createStockProduct({ ...r, system_assign: system === 'overview' ? (r.system_assign || '') : currentSys.value, applicant: r.applicant || currentUser })
      removeNewRow(idx)
      await load()
      flashAfterRow('.table-scroll-container', 'td:nth-child(3)', String(r.product_name), flash)
      showMsg('记录已保存')
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
    finally { setSaving(false) }
  }

  // 保存所有数据（新行 POST + 编辑中的行 PUT，对齐 saveAllData）
  const saveAll = async () => {
    if (saving) return
    const validNew = newRows.filter(r => r.product_code && r.product_name && r.specification && r.category && r.supplier)
    const editIds = rows.filter(r => r.id && editing.has(r.id!))
    if (validNew.length === 0 && editIds.length === 0) { showMsg('没有可保存的数据', 'error'); return }
    setSaving(true)
    try {
      let count = 0
      for (const r of validNew) { await createStockProduct({ ...r, system_assign: system === 'overview' ? (r.system_assign || '') : currentSys.value }); count++ }
      for (const r of editIds) {
        const d = drafts[r.id!] || r
        const approver = system === 'overview' ? (d.approver || '') : ''
        await updateStockProduct(r.id!, { ...d, system_assign: system === 'overview' ? (d.system_assign || '') : currentSys.value, applicant: d.applicant || currentUser, approver })
        count++
      }
      setNewRows([])
      setEditing(new Set())
      setDrafts({})
      await load()
      if (validNew.length) {
        flashAfterRow('.table-scroll-container', 'td:nth-child(3)', String(validNew[0].product_name), flash)
      }
      showMsg(`已保存 ${count} 条记录`, 'success')
    } catch (e: any) { showMsg(e?.response?.data?.message || '保存失败', 'error') }
    finally { setSaving(false) }
  }

  // 批准（对齐旧系统：确认 + loading；仅 Approver 权限可见）
  const approve = async (r: ProductRow) => {
    if (!r.id) return
    if (!window.confirm('确定要批准这条记录吗？')) return
    setApprovingId(r.id)
    try {
      await approveStockProduct(r.id, currentUser || 'admin')
      await load()
      showMsg('记录已批准', 'success')
    } catch (e: any) { showMsg(e?.response?.data?.message || '批准失败', 'error') }
    finally { setApprovingId(null) }
  }

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

  // 视图切换（对齐 switchView）
  const goView = (k: string) => {
    setViewOpen(false)
    if (k === 'list') navigate('/records?system=' + system)
    else if (k === 'records') navigate('/inout?system=' + system)
    else if (k === 'remark') navigate('/remark?system=' + system)
    else if (k === 'sot') navigate('/sot')
  }

  // 实时搜索（对齐旧系统 initRealTimeSearch：300ms 防抖自动搜索）
  const onSearchInput = (v: string) => {
    setKw(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { load() }, 300)
  }

  // 输入框点击全选（对齐旧系统 handleInputFocus）
  const selectAllOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => e.target.select(), 0)
  }

  const currentSys = SYSTEMS.find(s => s.key === system)!
  // 总览编辑权限（按行判断，见 load() 里 _assignMasked）：
  // - 无权限配置（admin/demo）或行的分配完全在权限内 → 可编辑（编辑时系统分配只能在自己有权限的系统里选）
  // - 行的分配超出权限（打码行）→ 只读，防止保存时用打码值覆盖真实分配
  // 可分配的系统选项：有权限配置的员工只能在自己有权限的系统内勾选
  const assignableOptions = useMemo(() => {
    if (allowedSystems.length === 0) return SYSTEM_OPTIONS.map(o => o.value)
    return SYSTEM_OPTIONS.filter(o => allowedSystems.some(x => String(x).toLowerCase() === o.value.toLowerCase())).map(o => o.value)
  }, [allowedSystems])
  const pageTitle = system === 'overview' ? '库存货品管理后台' : `库存货品管理后台 - ${currentSys.label}`
  const statusColTitle = system === 'overview' ? '批准状态' : '状态'

  // 单行可编辑单元格（编辑模式用）
  const EditableInput = ({ id, field, value, placeholder }: { id: number; field: keyof ProductRow; value?: string; placeholder?: string }) => (
    <input className="excel-input text-input" placeholder={placeholder} value={value || ''} onFocus={selectAllOnFocus}
      onChange={(e) => setDraft(id, { [field]: e.target.value } as any)} />
  )

  return (
    <div className="sp-root">
      <div className="container">
        <div className="header">
          <div><h1>{pageTitle}</h1></div>
          <div className="controls">
            <div className="view-selector">
              <button className="selector-button" onClick={() => setViewOpen(!viewOpen)}>
                <span id="current-view">货品种类</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className={'selector-dropdown' + (viewOpen ? ' show' : '')}>
                {Object.entries(VIEW_NAMES).filter(([k]) => allowedViews.length === 0 || allowedViews.includes(k)).map(([k, v]) => (
                  <div key={k} className={'dropdown-item' + (k === 'product' ? ' active' : '')} onClick={() => goView(k)}>{v}</div>
                ))}
              </div>
            </div>
            <div className="system-selector">
              <button className="selector-button" onClick={() => setSysOpen(!sysOpen)}>
                <span id="current-system">{currentSys.label}</span>
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className={'selector-dropdown' + (sysOpen ? ' show' : '')}>
                {/* 对齐旧系统：总览始终可见（跨店共用货品查阅，不受分店权限限制） */}
                {SYSTEMS.filter(s => s.key === 'overview' || allowedSystems.length === 0 || allowedSystems.includes(s.key) || allowedSystems.some(x => x.toLowerCase() === s.value.toLowerCase())).map(s => (
                  <div key={s.key} className={'dropdown-item' + (s.key === system ? ' active' : '')} onClick={() => { setSysOpen(false); setSystem(s.key); window.history.replaceState(null, '', '/products?system=' + s.key) }}>{s.label}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-group">
            <div className="filter-item">
              <label>搜索货品</label>
              <div className={'smartSearchWrapper' + (searchExpanded ? ' expanded' : '')}
                onClick={(e) => { if (!searchExpanded) { e.stopPropagation(); setSearchExpanded(true); setTimeout(() => searchRef.current?.focus(), 200) } }}>
                <i className="fas fa-search smartSearch-icon"></i>
                <input ref={searchRef} type="text" className="smartSearch-input" placeholder="输入关键字搜索..."
                  onChange={(e) => onSearchInput(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="filter-group">
            {canApply && <button className="btn btn-success" onClick={addRow}><i className="fas fa-plus" /> 添加新记录</button>}
            {canApply && (
              <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
                {saving ? <><span className="loading" style={{ width: 14, height: 14, borderTopColor: '#fff' }} /> 保存中...</> : <><i className="fas fa-save" /> 保存所有数据</>}
              </button>
            )}
            <div className="stats-info">
              {/* 总览隐藏逻辑提示（普通员工无需知道过滤规则）；悬浮说明保留在代码注释：
                  总览只显示系统分配 ≥ 2 间的货品；单一间的不在此页，只出现在所属系统页 */}
              <div className="stat-item"><i className="fas fa-boxes" /> <span>总记录数: <span className="stat-value">{stats.total}</span></span></div>
              <div className="stat-item"><i className="fas fa-check-circle" /> <span>已批准: <span className="stat-value" style={{ color: '#065f46' }}>{stats.approved}</span></span></div>
              <div className="stat-item"><i className="fas fa-clock" /> <span>待批准: <span className="stat-value" style={{ color: '#92400e' }}>{stats.pending}</span></span></div>
            </div>
          </div>
        </div>

        <div className="excel-container">
          <div className="table-scroll-container">
            <table className="excel-table" id="excel-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 50 }}>序号</th>
                  <th style={{ minWidth: 110 }}>货品编号</th>
                  <th style={{ minWidth: 180 }}>货品名字</th>
                  <th style={{ minWidth: 110 }}>规格</th>
                  <th style={{ minWidth: 90 }}>单价 (RM)</th>
                  <th style={{ minWidth: 120 }}>货品类型</th>
                  <th style={{ minWidth: 130 }}>供应商</th>
                  <th style={{ minWidth: 100 }}>申请人</th>
                  <th style={{ minWidth: 130 }}>系统分配</th>
                  <th style={{ minWidth: 130 }}>冰箱分类</th>
                  <th style={{ minWidth: 70 }}>位次</th>
                  <th style={{ minWidth: 100 }}>{statusColTitle}</th>
                  <th style={{ minWidth: 90 }}>操作</th>
                </tr>
              </thead>
              <tbody id="excel-tbody">
                {/* 新行（可编辑） */}
                {newRows.map((r, idx) => (
                  <tr key={'new-' + idx} className="new-row">
                    <td className="serial-number-cell">-</td>
                    <td><input className="excel-input text-input" placeholder="货品编号" value={r.product_code || ''} onFocus={selectAllOnFocus} onChange={(e) => setNew(idx, { product_code: e.target.value })} /></td>
                    <td><input className="excel-input text-input" placeholder="货品名称" value={r.product_name || ''} onFocus={selectAllOnFocus} onChange={(e) => setNew(idx, { product_name: e.target.value })} /></td>
                    <td>
                      <select className="excel-select" value={r.specification || ''} onChange={(e) => setNew(idx, { specification: e.target.value })}>
                        <option value="">选择规格</option>
                        {SPEC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="excel-input text-input" type="number" min={0} step="0.001" placeholder="0.00"
                        value={r.price || ''} onFocus={selectAllOnFocus} onChange={(e) => setNew(idx, { price: e.target.value })} />
                    </td>
                    <td>
                      <select className="excel-select" value={r.category || ''} onChange={(e) => setNew(idx, { category: e.target.value })}>
                        <option value="">选择类型</option>
                        {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td><input className="excel-input text-input" placeholder="供应商名称" value={r.supplier || ''} onFocus={selectAllOnFocus} onChange={(e) => setNew(idx, { supplier: e.target.value })} /></td>
                    <td><input className="excel-input text-input readonly" readOnly value={r.applicant || ''} placeholder="申请人" /></td>
                    <td>
                      {system === 'overview'
                        ? <MultiSelect value={r.system_assign || ''} options={assignableOptions} onChange={(v) => setNew(idx, { system_assign: v })} />
                        : <input className="excel-input text-input readonly" readOnly value={currentSys.value} title="仅总览可设置系统分配" />}
                    </td>
                    <td><MultiSelect value={r.freezer_category || ''} options={FREEZER_OPTIONS} onChange={(v) => setNew(idx, { freezer_category: v })} /></td>
                    <td><input className="excel-input" type="number" min={0} placeholder="如 1" value={r.freezer_position ?? ''} onChange={(e) => setNew(idx, { freezer_position: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                    <td style={{ padding: 8 }}><span style={{ color: '#92400e', fontWeight: 600 }}>待批准</span></td>
                    <td className="action-cell">
                      <button className="edit-btn save-mode" onClick={() => saveNewRow(r, idx)} title="保存记录" disabled={saving}><i className="fas fa-save" /></button>
                      <button className="delete-row-btn" onClick={() => removeRow(r)} title="删除此行"><i className="fas fa-trash-alt" /></button>
                    </td>
                  </tr>
                ))}
                {/* 已有行 */}
                {rows.map((r, idx) => {
                  const id = r.id!
                  const isEditing = editing.has(id)
                  const draft = drafts[id] || r
                  return (
                    <tr key={id} className={(r.approver ? 'status-approved' : 'status-pending') + (isEditing ? ' editing-row' : '') + (isHl(r) ? ' highlight-flash' : '')}>
                      <td className="serial-number-cell">{idx + 1}</td>
                      <td>
                        {isEditing
                          ? <EditableInput id={id} field="product_code" value={draft.product_code} placeholder="货品编号" />
                          : <input className="excel-input text-input" readOnly value={r.product_code || ''} />}
                      </td>
                      <td>
                        {isEditing
                          ? <EditableInput id={id} field="product_name" value={draft.product_name} placeholder="货品名称" />
                          : <input className="excel-input text-input" readOnly value={r.product_name || ''} />}
                      </td>
                      <td>
                        {isEditing
                          ? <select className="excel-select" value={draft.specification || ''} onChange={(e) => setDraft(id, { specification: e.target.value })}>
                              <option value="">选择规格</option>
                              {SPEC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          : <input className="excel-input" readOnly value={r.specification || ''} />}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="excel-input text-input" type="number" min={0} step="0.001" placeholder="0.00"
                              value={draft.price || ''} onFocus={selectAllOnFocus} onChange={(e) => setDraft(id, { price: e.target.value })} />
                          : <input className="excel-input" readOnly value={r.price || ''} />}
                      </td>
                      <td>
                        {isEditing
                          ? <select className="excel-select" value={draft.category || ''} onChange={(e) => setDraft(id, { category: e.target.value })}>
                              <option value="">选择类型</option>
                              {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          : <input className="excel-input" readOnly value={r.category || ''} />}
                      </td>
                      <td>
                        {isEditing
                          ? <EditableInput id={id} field="supplier" value={draft.supplier} placeholder="供应商名称" />
                          : <input className="excel-input text-input" readOnly value={r.supplier || ''} />}
                      </td>
                      <td><input className="excel-input text-input" readOnly value={draft.applicant || r.applicant || ''} /></td>
                      <td>
                        {system === 'overview' ? (
                          isEditing
                            ? <MultiSelect value={draft.system_assign || ''} options={assignableOptions} onChange={(v) => setDraft(id, { system_assign: v })} />
                            : <input className="excel-input" readOnly value={r.system_assign || ''} />
                        ) : (
                          <input className="excel-input" readOnly value={currentSys.value} title="仅总览可设置系统分配" />
                        )}
                      </td>
                      <td>
                        {isEditing
                          ? <MultiSelect value={draft.freezer_category || ''} options={FREEZER_OPTIONS} onChange={(v) => setDraft(id, { freezer_category: v })} />
                          : <input className="excel-input" readOnly value={r.freezer_category || ''} />}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="excel-input" type="number" min={0} placeholder="如 1" value={draft.freezer_position ?? ''} onChange={(e) => setDraft(id, { freezer_position: e.target.value === '' ? '' : Number(e.target.value) })} />
                          : <input className="excel-input" readOnly value={r.freezer_position || ''} placeholder="未设置" />}
                      </td>
                      <td style={{ padding: 8 }}>
                        {r.approver ? (
                          <span style={{ color: '#065f46', fontWeight: 600 }}>已批准</span>
                        ) : canApprove ? (
                          <button className="approve-btn" onClick={() => approve(r)} disabled={approvingId === id}>
                            {approvingId === id ? '批准中...' : <><i className="fas fa-check" /> 批准</>}
                          </button>
                        ) : (
                          <span style={{ color: '#92400e', fontWeight: 600 }}>待批准</span>
                        )}
                      </td>
                      <td className="action-cell">
                        {canApply && !(system === 'overview' && r._assignMasked) && (isEditing ? (
                          <>
                            <button className="edit-btn save-mode" onClick={() => saveEdit(id)} title="保存记录"><i className="fas fa-save" /></button>
                            <button className="delete-row-btn" onClick={() => cancelEdit(id)} title="取消"><i className="fas fa-times" /></button>
                          </>
                        ) : (
                          <>
                            <button className="edit-btn" onClick={() => startEdit(r)} title="编辑记录"><i className="fas fa-edit" /></button>
                            <button className="delete-row-btn" onClick={() => removeRow(r)} title="删除此行"><i className="fas fa-trash-alt" /></button>
                          </>
                        ))}
                      </td>
                    </tr>
                  )
                })}
                {!loading && rows.length === 0 && newRows.length === 0 && (
                  <tr><td colSpan={12} style={{ padding: 40, color: '#6b7280' }}>暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <button className={'back-to-top' + (showTop ? ' show' : '')} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="回到顶部">
        <i className="fas fa-chevron-up" />
      </button>

    </div>
  )
}
