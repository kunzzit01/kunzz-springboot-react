import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStockProducts, createStockProduct, updateStockProduct, deleteStockProduct, approveStockProduct, getMe, getStockPerms, createFreezerCategory, renameFreezerCategory, reorderFreezerCategories, deleteFreezerCategory, getPriceChangeLogLatest } from '../api'
import { useRealtime } from '../utils/useRealtime'
import { flashAfterRow, useRowHighlight } from '../utils/rowHighlight'
import { useFreezerCategories } from '../utils/useFreezerCategories'
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
  /** 总览用：各系统各自的单价/冰箱分类只读文本（后端拼好：4 套相同给一个值，否则「中央 x · J1 y …」） */
  price_by_system?: string
  /** 同上但单价带 RM 单位（悬浮提示用） */
  price_by_system_tip?: string
  freezer_by_system?: string
  /** 位次：同冰箱分类内排序（0/空 = 未设置；总库存排序用，货品资料可编辑） */
  freezer_position?: number | string | null
  /** 启用/停用（按系统；1=启用，0=停用；没有该系统的行 = 启用） */
  active?: number
  /** 新增行稳定标识：行增删/列表重载后仍能精确摘掉那一行（不能用下标，删行后下标会错位） */
  _key?: string
  /** 总览打码行（真实分配超出员工权限，只显示交集；只读防覆盖） */
  _assignMasked?: boolean
  /** 创建/编辑信息（后端已转成文本）：悬浮提示显示创建时间 + 编辑人（改价记录里的「谁改的」同理） */
  created_at?: string
  updated_at?: string
  updated_by?: string
}

/** 货品编号自然排序：先比前缀，再比数字（BR 0002 < BR 0003 < BR 12），最后按原文兜底 */
function cmpProductCode(a: string, b: string): number {
  const ma = /^(.*?)(\d+)$/.exec(a.trim())
  const mb = /^(.*?)(\d+)$/.exec(b.trim())
  const pa = (ma ? ma[1] : a).trim().toUpperCase()
  const pb = (mb ? mb[1] : b).trim().toUpperCase()
  if (pa !== pb) return pa < pb ? -1 : 1
  const na = ma ? parseInt(ma[2], 10) : -1
  const nb = mb ? parseInt(mb[2], 10) : -1
  if (na !== nb) return na - nb
  return a.trim().localeCompare(b.trim())
}

/** 货品名字排序：忽略大小写、数字按数值排（A5 < A12） */
function cmpProductName(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), undefined, { numeric: true, sensitivity: 'base' })
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
/** 多选单元格（system_assign / freezer_category）
 *  creatable=true 时下拉顶部多一个输入框：可筛选，输入不存在的名字可直接建成新分类 */
function MultiSelect({ value, onChange, disabled, options, creatable, onCreate }: {
  value?: string; onChange: (v: string) => void; disabled?: boolean; options: string[]
  creatable?: boolean
  /** 新建分类；返回落库后的名字，失败返回 null（由调用方决定是否中止） */
  onCreate?: (name: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = (value || '').split(',').map(v => v.trim()).filter(Boolean)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setKw('') }
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
    onChange(next.join(','))
  }
  const typed = kw.trim()
  const shown = typed ? options.filter(o => o.toLowerCase().includes(typed.toLowerCase())) : options
  // 只在「输入了内容、且不与现有分类重名」时给新建入口
  const canCreate = !!creatable && !!onCreate && !!typed && !options.some(o => o.toLowerCase() === typed.toLowerCase())
  const createAndSelect = async () => {
    if (!canCreate || busy) return
    setBusy(true)
    try {
      const created = await onCreate!(typed)
      if (created && !selected.includes(created)) onChange([...selected, created].join(','))
      setKw('')
    } finally { setBusy(false) }
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
          {creatable && (
            <div style={{ position: 'sticky', top: 0, background: '#fff', padding: 6, borderBottom: '1px solid #eee' }}>
              <input autoFocus value={kw} placeholder="筛选 / 输入新名字"
                onChange={e => setKw(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAndSelect() } }}
                style={{ width: '100%', boxSizing: 'border-box', padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
            </div>
          )}
          {canCreate && (
            <div onClick={createAndSelect}
              style={{ padding: '6px 12px', cursor: busy ? 'wait' : 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#065f46', background: '#f0fdf4' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#dcfce7')}
              onMouseLeave={e => (e.currentTarget.style.background = '#f0fdf4')}>
              <i className={'fas ' + (busy ? 'fa-spinner fa-spin' : 'fa-plus')} style={{ fontSize: 11 }} />
              {busy ? '创建中...' : `新建「${typed}」`}
            </div>
          )}
          {shown.map(v => (
            <div key={v} onClick={() => toggle(v)}
              style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8f5eb')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <input type="checkbox" checked={selected.includes(v)} readOnly style={{ pointerEvents: 'none' }} />
              {v}
            </div>
          ))}
          {shown.length === 0 && !canCreate && (
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#9ca3af' }}>没有匹配的分类</div>
          )}
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
  // 列表排序：默认按「货品编号」自然升序（原来已批准那批按 updated_at 排，看起来是乱的）
  const [sortKey, setSortKey] = useState<'code' | 'name'>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  /** 点表头排序：同一列再点一次反转方向 */
  const toggleSort = (k: 'code' | 'name') => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const [searchExpanded, setSearchExpanded] = useState(false)
  // 搜索模式：false=全能模糊（名称/编号/规格/类型/供应商/冰箱分类） / true=精准（货品名完全等于关键字）；对齐总库存 smartSearch
  const [exactMatch, setExactMatch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [approvingId, setApprovingId] = useState<number | null>(null)
  /** 正在切换启用/停用的行（防连点） */
  const [activatingId, setActivatingId] = useState<number | null>(null)
  const [currentUser, setCurrentUser] = useState('')
  // 单价格的悬浮提示用：每货品最近一次改价（含改价人）——来自改价日志接口，按当前系统取
  const [priceLogLatest, setPriceLogLatest] = useState<Record<string, { date: string; price: number; by?: string }>>({})
  const [showTop, setShowTop] = useState(false)
  // 页面权限（对齐旧系统 check_permissions.php：无记录时默认全部可用，兼容 demo）
  const [canApply, setCanApply] = useState(true)
  const [canApprove, setCanApprove] = useState(true)
  const [allowedSystems, setAllowedSystems] = useState<string[]>([])
  const [allowedViews, setAllowedViews] = useState<string[]>([])
  // 权限到底有没有配置过（allowedSystems=[] 既可能是"没配置"，也可能是"配置了但全关"，要分开判断）
  const [permConfigured, setPermConfigured] = useState(false)
  // 权限请求是否已经跑完（成功或失败都算）——跑完之前不取列表，避免先按"无限制"拉一次全量
  const [permsSettled, setPermsSettled] = useState(false)
  // 总览 = 跨系统只读视图：只有"没配置权限"或"能看到 2 个以上系统"时才展示。
  // 只勾了一间分店的账号不该看到别家分店的单价（2026-09-19 用户要求；旧行为是"总览始终可见"）
  const showOverview = !permConfigured || allowedSystems.length > 1
  // 配置了权限但一个系统都没勾 → 整页锁定（不取数）
  const locked = permConfigured && allowedSystems.length === 0
  const searchRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 列表请求序号：只认最后一次请求的结果（切系统时的竞态防护） */
  const loadSeq = useRef(0)
  /** 新增行序号：给每行一个稳定 _key（保存成功后就按 key 摘行，不受删行影响） */
  const newKeySeq = useRef(0)

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  // 冰箱分类字典（按业务顺序，全部返回 —— 没有「停用」概念）；freezerOptions 用于多选选项
  // freezerReady：后端字典接口是否可用。不可用时仍能用兜底清单选分类，但不提供维护入口 ——
  // 否则面板会把这 20 项当成「货品上在用但没登记」而显示成 20 个待加入项，误导人。
  const { list: freezerList, names: freezerOptions, ready: freezerReady, reload: reloadFreezer } = useFreezerCategories()
  const [showFreezerMgr, setShowFreezerMgr] = useState(false)
  const [fcDrafts, setFcDrafts] = useState<Record<number, string>>({})
  const [fcNewName, setFcNewName] = useState('')
  const [fcBusy, setFcBusy] = useState(false)
  // 拖拽排序：fcDragId = 正在拖的分类；fcDragIds = 拖动中的本地顺序（即时跟手，松手才提交）
  const [fcDragId, setFcDragId] = useState<number | null>(null)
  const [fcDragIds, setFcDragIds] = useState<number[] | null>(null)
  /** 已登记分类的 id 顺序（未登记项没有 id，不参与排序）；useMemo 保证引用稳定，拖动监听才不会反复重注册 */
  const fcOrderIds = useMemo(() => freezerList.filter(c => c.id != null).map(c => c.id as number), [freezerList])

  /** 拖动状态放 ref：window 上的 move/up 监听只在开始拖时注册一次，靠 ref 读最新值（否则每动一下都要重注册） */
  const fcDragRef = useRef<{ id: number | null; ids: number[] | null; x: number; y: number; moved: boolean }>(
    { id: null, ids: null, x: 0, y: 0, moved: false })

  // ---- 冰箱分类维护（改名会级联更新所有挂了该分类的货品，故要求「批准」权限）----
  const addFreezerCat = async () => {
    const name = fcNewName.trim()
    if (!name || fcBusy) return
    setFcBusy(true)
    try {
      await createFreezerCategory(name)
      setFcNewName('')
      reloadFreezer()
      showMsg(`已新增冰箱分类「${name}」`, 'success')
    } catch { /* 拦截器已提示 */ }
    finally { setFcBusy(false) }
  }

  const renameFreezerCat = async (id: number, oldName: string, rawNext: string) => {
    const next = rawNext.trim()
    if (next === oldName) {
      setFcDrafts(p => { const n = { ...p }; delete n[id]; return n })
      return
    }
    const used = freezerList.find(c => c.id === id)?.usage_count || 0
    const tip = used > 0
      ? `把冰箱分类「${oldName}」改名为「${next}」？\n\n有 ${used} 个货品在用这个分类，它们的冰箱分类会一起改成新名字。`
      : `把冰箱分类「${oldName}」改名为「${next}」？`
    if (!window.confirm(tip)) return
    setFcBusy(true)
    try {
      const r = await renameFreezerCategory(id, next)
      reloadFreezer()
      load() // 货品列表上的分类名也要跟着变
      showMsg(r.changed > 0 ? `已改名为「${next}」，同时更新了 ${r.changed} 个货品` : `已改名为「${next}」`, 'success')
    } catch { /* 拦截器已提示 */ }
    finally {
      setFcBusy(false)
      setFcDrafts(p => { const n = { ...p }; delete n[id]; return n })
    }
  }

  /** 删除分类：没有货品在用时直接删；有货品在用时弹确认框说明「会同时去掉这些货品上的该分类」再删 */
  const removeFreezerCat = async (id: number, name: string, usage: number) => {
    const tip = usage > 0
      ? `删除冰箱分类「${name}」？\n\n有 ${usage} 个货品在用这个分类。删除会同时把这些货品上的「${name}」去掉`
        + `（挂了多个冰箱的货品，其余冰箱保持不变）。`
      : `删除冰箱分类「${name}」？`
    if (!window.confirm(tip)) return
    setFcBusy(true)
    try {
      const r = await deleteFreezerCategory(id, usage > 0)
      reloadFreezer()
      load() // 货品上的分类已被清掉，列表要跟着刷新
      showMsg(r?.cleared > 0 ? `已删除「${name}」，同时清除了 ${r.cleared} 个货品上的引用` : `已删除「${name}」`, 'success')
    } catch { /* 拦截器已提示 */ }
    finally { setFcBusy(false) }
  }

  /** 未登记项（货品上在用但字典里没有）：补进字典，成为可改名/排序的正常分类 */
  const registerFreezerCat = async (name: string) => {
    setFcBusy(true)
    try {
      await createFreezerCategory(name)
      reloadFreezer()
      showMsg(`已把「${name}」加入冰箱分类`, 'success')
    } catch { /* 拦截器已提示 */ }
    finally { setFcBusy(false) }
  }

  /** 提交顺序（服务端保存的 id 序列） */
  const commitFreezerOrder = async (ids: number[], okMsg?: string) => {
    setFcBusy(true)
    try {
      await reorderFreezerCategories(ids)
      reloadFreezer()
      if (okMsg) showMsg(okMsg, 'success')
    } catch { /* 拦截器已提示 */ }
    finally { setFcBusy(false) }
  }

  /**
   * 拖拽排序：按住 ⠿ 手柄拖动，拖动过程中本地顺序实时跟手，松手才提交。
   * 用 Pointer 事件而不是 HTML5 drag —— pointer 同时支持鼠标和触屏，也不会有原生拖影的锯齿感。
   */
  const onGripDown = (e: React.PointerEvent<HTMLElement>, id: number) => {
    if (fcBusy) return
    e.preventDefault() // 防止拖动时选中文字/给输入框抢焦点
    fcDragRef.current = { id, ids: [...fcOrderIds], x: e.clientX, y: e.clientY, moved: false }
    setFcDragId(id)
    setFcDragIds([...fcOrderIds])
  }

  /**
   * 拖动期间的 move/up 挂在 window 上，不用 setPointerCapture：
   * 拖动中列表会实时重排、手柄所在的 DOM 节点会被移走，Chrome 这时会释放指针捕获，
   * 导致拖到一半就收不到 move（拖不过去）、松手也收不到 up（顺序不提交）—— 实测踩过。
   */
  useEffect(() => {
    if (fcDragId == null) return
    const move = (e: PointerEvent) => {
      const d = fcDragRef.current
      if (d.id == null || !d.ids) return
      // 4px 阈值：单纯点一下手柄不算拖动
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
      d.moved = true
      // 命中测试：看指针下面是哪个分类块（每块带 data-fcid）
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-fcid]') as HTMLElement | null
      const overId = over ? Number(over.dataset.fcid) : NaN
      if (!overId || overId === d.id) return
      const from = d.ids.indexOf(d.id), to = d.ids.indexOf(overId)
      if (from < 0 || to < 0 || from === to) return
      const next = [...d.ids]
      next.splice(from, 1)
      next.splice(to, 0, d.id)
      d.ids = next
      setFcDragIds(next) // 本地顺序实时跟手
    }
    const up = () => {
      const d = fcDragRef.current
      const id = d.id, ids = d.ids, moved = d.moved
      fcDragRef.current = { id: null, ids: null, x: 0, y: 0, moved: false }
      setFcDragId(null)
      if (id == null || !ids || !moved) { setFcDragIds(null); return }
      if (ids.join(',') === fcOrderIds.join(',')) return // 没挪动：保留本地顺序，等下面的 effect 清掉
      commitFreezerOrder(ids, '顺序已保存')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [fcDragId, fcOrderIds]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 拖动时禁掉文字选择，否则鼠标划过别的分类名字会选中一片文字 */
  useEffect(() => {
    if (fcDragId == null) return
    const prev = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => { document.body.style.userSelect = prev }
  }, [fcDragId])

  /** 键盘兜底（手柄聚焦后 ←→ 挪一格）：不占界面，给键盘用户留条路 */
  const onGripKey = (e: React.KeyboardEvent, id: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const ids = [...fcOrderIds]
    const at = ids.indexOf(id)
    const to = at + (e.key === 'ArrowLeft' ? -1 : 1)
    if (at < 0 || to < 0 || to >= ids.length) return
    ;[ids[at], ids[to]] = [ids[to], ids[at]]
    commitFreezerOrder(ids)
  }

  /** 服务端顺序已跟上本地拖拽结果后，丢掉本地覆盖（否则别处新增的分类不会出现） */
  useEffect(() => {
    if (fcDragId != null || !fcDragIds) return
    const serverIds = freezerList.filter(c => c.id != null).map(c => c.id as number)
    if (serverIds.join(',') === fcDragIds.join(',')) setFcDragIds(null)
  }, [freezerList, fcDragId, fcDragIds])

  /** 面板显示顺序：拖动中/提交中用本地顺序（实时跟手），否则用服务端顺序；未登记项永远排最后 */
  const freezerPanelList = useMemo(() => {
    if (!fcDragIds) return freezerList
    const byId = new Map(freezerList.filter(c => c.id != null).map(c => [c.id as number, c]))
    const picked = fcDragIds.map(id => byId.get(id)).filter(Boolean) as typeof freezerList
    const pickedSet = new Set(picked.map(c => c.id))
    return [...picked, ...freezerList.filter(c => !pickedSet.has(c.id))]
  }, [freezerList, fcDragIds])

  /** 多选下拉里直接输新名字新建（返回落库后的名字；失败返回 null 由 MultiSelect 中止） */
  const createFreezerInline = async (name: string): Promise<string | null> => {
    try {
      const created = await createFreezerCategory(name)
      reloadFreezer()
      showMsg(`已新增冰箱分类「${created.name}」`, 'success')
      return created.name
    } catch { return null }
  }

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
        setPermConfigured(true)
        // 无权限的系统不展示：当前 system 不在权限内 → 自动切到第一个有权限的系统（按 SYSTEMS 顺序）
        // 总览只在"没配置权限"或"能看到 2 个以上系统"时算作可用项：只勾一间分店的账号默认落到自己那间
        const showOv = perms.length === 0 || perms.length > 1
        setSystem(prev => {
          const allowedKeys = SYSTEMS
            .filter(s => s.key === 'overview'
              ? showOv
              : (perms.includes(s.key) || perms.some((x: string) => x.toLowerCase() === s.value.toLowerCase())))
            .map(s => s.key)
          if (allowedKeys.includes(prev)) return prev
          return allowedKeys.length > 0 ? allowedKeys[0] : prev
        })
        setPermsSettled(true)
      }
    }).catch(() => {}).finally(() => setPermsSettled(true))
  }, [])

  // 最近改价（含改价人）：单价格子悬浮提示用。按当前系统取——单价本来就是按系统各存一份；
  // 总览取中央的那份并标明。失败静默（只是提示，不影响页面）
  const loadPriceLog = useCallback(async () => {
    const logSys = system === 'overview' ? 'central' : system
    try {
      const list = await getPriceChangeLogLatest(logSys)
      const m: Record<string, { date: string; price: number; by?: string }> = {}
      for (const e of list || []) {
        const by = String(e.changedBy || '').trim()
        m[String(e.productName || '').trim()] = { date: String(e.changeDate || ''), price: Number(e.newPrice) || 0, by: by || undefined }
      }
      setPriceLogLatest(m)
    } catch { /* ignore */ }
  }, [system])
  useEffect(() => { loadPriceLog() }, [loadPriceLog])

  /** 日期显示：2026-09-18 → 18/09/2026（与总库存页一致） */
  const fmtDmy = (iso: string) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso || '')
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '-')
  }
  /** 单价格子的悬浮提示：最近一次改价记录（什么时候、改成多少、谁改的） */
  const priceTip = (r: ProductRow) => {
    const hit = priceLogLatest[(r.product_name || '').trim()]
    const label = system === 'overview' ? '最近改价（中央）' : '最近改价'
    const body = hit
      ? `${label}: ${fmtDmy(hit.date)} RM${hit.price.toFixed(2)}${hit.by ? `（${hit.by}）` : ''}`
      : `${label}: 暂无记录`
    return system === 'overview' ? `${body}\n各系统各自的单价：到中央/J1/J2/J3 页面修改` : body
  }

  /** 总览：单价那一格的悬浮提示（列窄会被截断，悬浮看全；只显示有权限系统的值 + RM 单位） */
  const overviewPriceTip = (r: ProductRow) =>
    `各系统单价：${r.price_by_system_tip || r.price_by_system || '-'}`
  /** 总览：冰箱分类那一格的悬浮提示（同上） */
  const overviewFreezerTip = (r: ProductRow) =>
    `各系统冰箱分类：${r.freezer_by_system || '-'}`

  // kwArg/exactArg：防抖/切模式时直传最新值，避免旧渲染闭包读到上一拍的关键字（搜索慢一拍 bug）
  // keepMissingArg：列表里已没有的行，其编辑草稿保留还是丢弃 —— 默认「搜索过滤中才保留」；
  //   切系统必须显式传 false：跨系统草稿若留着，Ctrl+Shift+S 会把别系统的货品按当前系统存回去
  const load = async (kwArg?: string, exactArg?: boolean, keepMissingArg?: boolean) => {
    if (locked) { setLoading(false); return } // 权限全关：不取数（列表只会是空的）
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const d = await getStockProducts(system === 'overview' ? '' : system, (kwArg ?? kw) || undefined, exactArg ?? exactMatch)
      // 竞态防护：切系统/权限到达时，先发的旧请求可能后到（实测"总览 611 条"会覆盖掉"J1 110 条"）
      // → 只认最后一次请求的结果
      if (seq !== loadSeq.current) return
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
      // 顺序在渲染时算（sortedRows）：待批准在前 + 组内按当前排序规则 —— 点表头能立刻重排，不用重新请求
      setRows(rawItems)
      // 编辑态保留：重载不再清空草稿 —— 保存其中一行、批准、刷新都不会冲掉其他行正在改的内容。
      // 草稿只在三种情况下消失：保存成功、用户点取消、行确实不在列表里了（被删/切到别的系统）。
      // 例外：搜索过滤会把不匹配的行挪出列表，那种「暂时看不见」的草稿保留（清空关键字即回来），
      // 否则边改边搜一下就把输入丢了。
      const keepMissing = keepMissingArg ?? ((kwArg ?? kw).trim() !== '')
      if (!keepMissing) {
        const alive = new Set(rawItems.map((i: any) => Number(i.id)))
        setEditing(prev => {
          const next = new Set([...prev].filter(id => alive.has(id)))
          return next.size === prev.size ? prev : next
        })
        setDrafts(prev => {
          const kept = Object.entries(prev).filter(([id]) => alive.has(Number(id)))
          return kept.length === Object.keys(prev).length
            ? prev
            : Object.fromEntries(kept) as Record<number, ProductRow>
        })
      }
      showMsg(`库存数据加载成功，共找到 ${rawItems.length} 条记录`, 'success')
    } catch {
      setRows([])
      showMsg('库存数据加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (permsSettled) load(undefined, undefined, false) }, [system, permsSettled]) // eslint-disable-line react-hooks/exhaustive-deps

  // 实时：货品种类变更（新增/编辑/删除/批准）自动刷新；编辑/保存/批准中不打断，结束后补刷
  // （改价也会广播 → 最近改价提示跟着更新，hover 到的是最新那条）
  useRealtime('*', () => { load(); reloadFreezer(); loadPriceLog() }, 1000, 3000, () => saving || approvingId !== null || editing.size > 0 || newRows.length > 0)

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
  /** 待保存条数（新增行 + 编辑中行）：批量保存按钮上的数字提示 */
  const pendingCount = newRows.length + editing.size

  // 添加新行（对齐 addNewRow：系统分配默认当前系统，申请人默认当前用户）
  const addRow = () => {
    const sys = SYSTEMS.find(s => s.key === system)!
    newKeySeq.current += 1
    setNewRows(prev => [...prev, {
      _key: 'new-' + newKeySeq.current,
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

  /** 摘掉一条新增行（按稳定 key，删行后下标错位也不受影响） */
  const removeNewRow = (key: string) => setNewRows(prev => prev.filter(r => String(r._key) !== key))

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
  /** 保存单行编辑（返回 null=成功 / 字符串=失败原因）；行内保存与批量保存共用 */
  const doSaveEdit = async (id: number): Promise<string | null> => {
    const d = drafts[id]
    if (!d) return '该行没有待保存的修改'
    try {
      // 对齐 saveSingleRowData：总览页保持原批准状态；系统页编辑后清除批准状态需重新批准。
      // 例外（2026-09-22）：**有批准权限的人不清空** —— 他本来就有批准权，他的编辑不需要重新批准。
      // 清空的话会掉回待批准，再被后端 autoApproveIfBlank 补成本次操作人，
      // 于是"只改个错别字就把原来的批准人顶掉、当初是谁批的查不到"（复核时查出的问题）。
      const approver = (system === 'overview' || canApprove) ? (d.approver || '') : ''
      // 系统分配：一律传这一行自己的值。原来在单系统页强制写成 currentSys.value，
      // 会把 Central,J1,J2,J3 这样的多系统分配覆盖成当前页那一个系统（分店从此看不到该货品）。
      // 申请人：保持这一行原本的申请人（创建人），不再用"当前用户"顶替 —— 谁改的另记 updated_by（编辑人）
      const payload: any = { ...d, applicant: d.applicant || '', approver,
        system: system === 'overview' ? undefined : currentSys.key }
      if (system === 'overview') {
        // 总览下这三样是只读展示（改了要到对应系统页），发出去反而会在边角情况写出 system 为空的改价日志
        delete payload.price; delete payload.freezer_category; delete payload.freezer_position
        // 打码行（该货品还分配给无权限的系统）：不发 system_assign —— 后端只更新请求里带的字段，
        // 中央/J3 的分配原样保留（代替原来"整行锁死不许编辑"的防覆盖做法）
        if (d._assignMasked) delete payload.system_assign
        else payload.system_assign = d.system_assign || ''
      } else {
        payload.system_assign = d.system_assign || ''
      }
      await updateStockProduct(id, payload)
      // 只摘掉这一行：其他编辑中行与草稿原样保留（点其中一行的保存，不影响其他行已改的内容）
      setEditing(prev => { const n = new Set(prev); n.delete(id); return n })
      setDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
      return null
    } catch (e: any) { return e?.response?.data?.message || '保存失败' }
  }

  /** 行内保存按钮（Ctrl+S 同）：只保存当前行 */
  const saveEdit = async (id: number) => {
    if (saving) return
    setSaving(true)
    try {
      const err = await doSaveEdit(id)
      if (err) { showMsg(err, 'error'); return }
      await load()
      showMsg('记录已保存', 'success')
    } finally { setSaving(false) }
  }

  /** 放弃所有未保存的修改（编辑中行的草稿一次清空；新增行另有各自删除按钮） */
  const cancelAllEdits = () => {
    if (editing.size === 0) return
    if (!window.confirm(`确定放弃 ${editing.size} 行未保存的修改吗？`)) return
    setEditing(new Set())
    setDrafts({})
    showMsg('已取消全部编辑', 'success')
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
      if (newRows.some(nr => String(nr._key) === String(r._key))) removeNewRow(String(r._key))
      showMsg('行已删除', 'success')
    }
  }

  /** 新增行落库（返回 null=成功 / 字符串=失败原因）；不自行摘行，由调用方按结果处理 */
  const doSaveNewRow = async (r: ProductRow): Promise<string | null> => {
    if (!r.product_code || !r.product_name || !r.specification || !r.category || !r.supplier) {
      return '请填写完整的货品编号、名称、规格、类型、供应商'
    }
    // 总览下必须选系统分配：不然存进去后"可见交集=0"，这行会从总览列表里消失（数据其实在，只是看不到）
    if (system === 'overview' && !String(r.system_assign || '').trim()) {
      return '请选择「系统分配」：总览里没选系统的货品，保存后会从列表里消失'
    }
    try {
      // 同上：系统分配用这一行自己的值（单系统页由 addRow 预置成当前系统，不再强制覆盖）
      await createStockProduct({ ...r, system_assign: r.system_assign || '', applicant: r.applicant || currentUser,
        system: system === 'overview' ? undefined : currentSys.key })
      return null
    } catch (e: any) { return e?.response?.data?.message || '保存失败' }
  }

  // 保存单条新增行（对齐编辑行 save-mode：填写完整后就地保存；只摘掉这一条，其他行不动）
  const saveNewRow = async (r: ProductRow) => {
    if (saving) return
    setSaving(true)
    try {
      const err = await doSaveNewRow(r)
      if (err) { showMsg(err, 'error'); return }
      removeNewRow(String(r._key))
      await load()
      flashAfterRow('.table-scroll-container', 'td:nth-child(3)', String(r.product_name), flash)
      showMsg('记录已保存')
    } finally { setSaving(false) }
  }

  // 批量保存（新行 POST + 编辑中的行 PUT；逐条保存 —— 单条失败只拦截该条，不拖累其他行）
  const saveAll = async () => {
    if (saving) return
    const pendingNew = [...newRows]
    const editIds = Array.from(editing).filter(id => !!drafts[id])
    if (pendingNew.length === 0 && editIds.length === 0) { showMsg('没有可保存的数据', 'error'); return }
    setSaving(true)
    const savedNewKeys: string[] = []
    const savedEditIds: number[] = []
    const failed: string[] = []
    try {
      for (const r of pendingNew) {
        const err = await doSaveNewRow(r)
        if (err) failed.push(err); else savedNewKeys.push(String(r._key))
      }
      for (const id of editIds) {
        const err = await doSaveEdit(id)
        if (err) failed.push(err); else savedEditIds.push(id)
      }
      // 只摘掉保存成功的行：失败的行留在原位（草稿不丢），改完把光标放那一行按 Ctrl+S 重存
      if (savedNewKeys.length) setNewRows(prev => prev.filter(nr => !savedNewKeys.includes(String(nr._key))))
      if (savedEditIds.length) {
        setEditing(prev => { const n = new Set(prev); savedEditIds.forEach(id => n.delete(id)); return n })
        setDrafts(prev => { const n = { ...prev }; savedEditIds.forEach(id => delete n[id]); return n })
      }
      await load()
      const firstSaved = pendingNew.find(r => savedNewKeys.includes(String(r._key)))
      if (firstSaved) flashAfterRow('.table-scroll-container', 'td:nth-child(3)', String(firstSaved.product_name), flash)
      const okCount = savedNewKeys.length + savedEditIds.length
      if (failed.length === 0) showMsg(`已保存 ${okCount} 条记录`, 'success')
      else if (okCount === 0) showMsg(`保存失败：${failed[0]}`, 'error')
      else showMsg(`已保存 ${okCount} 条，${failed.length} 条失败：${failed[0]}`, 'warning')
    } finally { setSaving(false) }
  }

  // 批准（对齐旧系统：确认 + loading；仅 Approver 权限可见）
  const approve = async (r: ProductRow) => {
    if (!r.id) return
    if (!window.confirm('确定要批准这条记录吗？')) return
    setApprovingId(r.id)
    try {
      await approveStockProduct(r.id, currentUser || 'admin')
      // 同步草稿里的批准状态：草稿存的是批准前的值，不同步的话这行随后一保存就把刚批的又打回待批准
      setDrafts(prev => prev[r.id!] ? { ...prev, [r.id!]: { ...prev[r.id!], approver: currentUser || 'admin' } } : prev)
      await load()
      showMsg('记录已批准', 'success')
    } catch (e: any) { showMsg(e?.response?.data?.message || '批准失败', 'error') }
    finally { setApprovingId(null) }
  }

  /** 启用/停用（按系统，需要「批准」权限）：停用后不进进出货下拉/总库存/手机版；有库存时后端会拒绝。
      停用/启用都**按货品编号**（后端按 product_code 匹配），所以文案里带上编号：
      一个名字常挂多个编号（如「CHICKEN BONELESS LEG」有 4 个），只显示名字会让操作人分不清停的是哪一个 */
  const toggleActive = async (r: ProductRow) => {
    if (!r.id || !canApprove) return
    const next = Number(r.active ?? 1) === 0 // 当前是"已停用" → 这次是启用
    const label = `「${r.product_name}」（编号 ${r.product_code || '-'}）`
    if (!next && !window.confirm(`确定停用${label}吗？\n停用后它不再出现在进出货的货品下拉、总库存和手机版列表里。\n（还有库存时不能停用）`)) return
    setActivatingId(r.id)
    try {
      await updateStockProduct(r.id, { active: next ? 1 : 0, system: currentSys.key })
      await load()
      showMsg(next ? `已启用${label}` : `已停用${label}`, 'success')
    } catch (e: any) { showMsg(e?.response?.data?.message || (next ? '启用失败' : '停用失败'), 'error') }
    finally { setActivatingId(null) }
  }

  // ---- 快捷键（对齐进出货页：Ctrl+S 从最上面逐行保存、Ctrl+Shift+S 批量保存、Ctrl+A 新增一行） ----
  // 用 ref 存最新处理函数：监听器只挂一次，不因 rows/drafts 变化反复解绑（对齐 StockInout 做法）
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    shortcutRef.current = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const isInput = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)
      const inTable = !!active?.closest('#excel-table tbody')
      if (!(e.ctrlKey || e.metaKey)) return
      // A. 批量保存 (Ctrl+Shift+S)：新行 + 所有编辑中行一次保存（单条失败只拦截该条）
      if (e.shiftKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
        e.preventDefault(); e.stopPropagation()
        saveAll(); return
      }
      // A2. 保存 (Ctrl+S)：从上往下存**第一条**待存行，不用先点光标。
      // 渲染顺序：新增行在上，已有记录（含编辑中的）在下 —— 所以先存第一条新增行，再存编辑中的。
      // 连按 Ctrl+S 即一条一条往下存（存掉的那条会离开待存列表）。
      if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') {
        e.preventDefault(); e.stopPropagation()
        if (newRows.length > 0) { saveNewRow(newRows[0]); return }
        const firstEditing = sortedRows.find(r => editing.has(Number(r.id)))
        if (firstEditing) { saveEdit(Number(firstEditing.id)); return }
        showMsg('没有需要保存的记录', 'info')
        return
      }
      // B. 新增一行 (Ctrl+A)：表格内可连续按；不在输入框里时也可用（不抢输入框内全选）
      if (!e.shiftKey && (e.code === 'KeyA' || e.key === 'a' || e.key === 'A')) {
        if (inTable || !isInput) { e.preventDefault(); e.stopPropagation(); addRow() }
        return
      }
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.ctrlKey || e.metaKey) shortcutRef.current(e) }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

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

  // 实时搜索（对齐旧系统 initRealTimeSearch：300ms 防抖自动搜索；直传最新关键字）
  const onSearchInput = (v: string) => {
    setKw(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { load(v) }, 300)
  }

  // 切换搜索模式后带关键字重查（对齐总库存 smartSearch 图标切换；直传新模式）
  const toggleExact = () => {
    const next = !exactMatch
    setExactMatch(next)
    setSearchExpanded(true)
    setTimeout(() => { searchRef.current?.focus(); if (kw.trim()) load(kw, next) }, 50)
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
  /** 展示顺序：待批准在前（待办浮在上面）+ 组内按表头选的排序（默认货品编号自然升序）；
   *  放在渲染时算 —— 点表头立刻重排，不用重新请求；同等时按 id 兜底保持稳定 */
  const sortedRows = useMemo(() => {
    const cmp = sortKey === 'code'
      ? (a: ProductRow, b: ProductRow) => cmpProductCode(String(a.product_code || ''), String(b.product_code || ''))
      : (a: ProductRow, b: ProductRow) => cmpProductName(String(a.product_name || ''), String(b.product_name || ''))
    const dir = sortDir === 'asc' ? 1 : -1
    const bySort = (a: ProductRow, b: ProductRow) => dir * cmp(a, b) || Number(a.id) - Number(b.id)
    const pending = rows.filter(r => !r.approver).sort(bySort)
    const approved = rows.filter(r => r.approver).sort(bySort)
    return [...pending, ...approved]
  }, [rows, sortKey, sortDir])

  // 单行可编辑单元格（编辑模式用）
  const EditableInput = ({ id, field, value, placeholder }: { id: number; field: keyof ProductRow; value?: string; placeholder?: string }) => (
    <input className="excel-input text-input" placeholder={placeholder} value={value || ''} onFocus={selectAllOnFocus}
      onChange={(e) => setDraft(id, { [field]: e.target.value } as any)} />
  )

  // 权限全关（配置过、一个系统都没勾）→ 整页锁定，不渲染任何库存数据
  if (locked) {
    return (
      <div className="sp-root">
        <div className="container">
          <div className="header"><div><h1>库存货品管理后台</h1></div></div>
          <div className="no-data" style={{ padding: '48px 20px', textAlign: 'center', color: '#6b7280' }}>
            <i className="fas fa-lock" style={{ fontSize: 34, color: '#d1d5db' }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: '#374151', marginTop: 10 }}>无权限访问</div>
            <div style={{ fontSize: 13.5, marginTop: 4 }}>权限设定已关闭全部系统（中央/J1/J2/J3）。如需使用请联系管理员开通。</div>
          </div>
        </div>
      </div>
    )
  }

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
                {/* 总览：只有"没配置权限"或"能看到 2 个以上系统"时才列出（只勾一间分店的账号不显示总览） */}
                {SYSTEMS.filter(s => s.key === 'overview'
                  ? showOverview
                  : (allowedSystems.length === 0 || allowedSystems.includes(s.key) || allowedSystems.some(x => x.toLowerCase() === s.value.toLowerCase()))).map(s => (
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
                {/* 左侧图标即搜索模式切换：放大镜=全能模糊 / 等号=精准（货品名完全等于关键字）；对齐总库存/进出货页 */}
                <span className="smartSearch-icon"
                  title={exactMatch ? '精准搜索：只显示货品名字完全等于关键字的行（点击切换为全能）' : '全能搜索：货品名字/编号/规格/类型/供应商/冰箱分类 任一包含关键字（点击切换为精准）'}
                  onClick={(e) => { e.stopPropagation(); toggleExact() }}>
                  <i className={'fas ' + (exactMatch ? 'fa-equals' : 'fa-search')} style={{ color: exactMatch ? '#ff7b00' : '#9ca3af' }} />
                </span>
                <input ref={searchRef} type="text" className="smartSearch-input" placeholder={exactMatch ? '精准：输入完整货品名字...' : '搜索名字/编号/规格/类型/供应商/冰箱分类...'}
                  onChange={(e) => onSearchInput(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="filter-group">
            {canApply && <button className="btn btn-success" onClick={addRow} title="添加一行（Ctrl+A）"><i className="fas fa-plus" /> 添加新记录</button>}
            {canApply && editing.size > 0 && (
              <button className="btn btn-secondary" onClick={cancelAllEdits} title="放弃所有编辑中行未保存的修改">
                <i className="fas fa-times" /> 取消编辑 ({editing.size})
              </button>
            )}
            {canApply && (
              <button className="btn btn-primary" onClick={saveAll} disabled={saving}
                title="把所有新增行和编辑中行一次保存（Ctrl+Shift+S）；单条失败只拦截该条，其他行照常保存">
                {saving ? <><span className="loading" style={{ width: 14, height: 14, borderTopColor: '#fff' }} /> 保存中...</> : <><i className="fas fa-save" /> 保存所有数据{pendingCount > 0 ? ` (${pendingCount})` : ''}</>}
              </button>
            )}
            {canApprove && freezerReady && (
              <button className={'btn btn-freezer' + (showFreezerMgr ? ' is-open' : '')}
                aria-expanded={showFreezerMgr}
                onClick={() => { setShowFreezerMgr(v => !v); reloadFreezer() }}
                title="维护冰箱分类：改名 / 拖动调顺序 / 删除 / 新增">
                <i className="fas fa-snowflake" /> 冰箱分类
              </button>
            )}
            <div className="stats-info">
              {/* 总览隐藏逻辑提示（普通员工无需知道过滤规则）；悬浮说明保留在代码注释：
                  总览只显示系统分配 ≥ 2 间的货品；单一间的不在此页，只出现在所属系统页 */}
              <div className="stat-item"><i className="fas fa-boxes" /> <span>总记录数: <span className="stat-value">{stats.total}</span></span></div>
              <div className="stat-item"><i className="fas fa-check-circle" /> <span>已批准: <span className="stat-value" style={{ color: '#065f46' }}>{stats.approved}</span></span></div>
              <div className="stat-item"><i className="fas fa-clock" /> <span>待批准: <span className="stat-value" style={{ color: '#92400e' }}>{stats.pending}</span></span></div>
            </div>
            <span className="sp-shortcut-hint" title="可多行同时进入编辑，逐行保存或一次全部保存；保存一行不会影响其他行未保存的修改">
              <i className="fas fa-keyboard" /> Ctrl+S 从最上面逐行保存 · Ctrl+Shift+S 全部保存 · Ctrl+A 新增行
            </span>
          </div>
        </div>

        {/* 冰箱分类维护面板：顺序 = 走冰箱的拣货顺序（也是总库存排序依据）；改名会级联更新货品 */}
        {showFreezerMgr && canApprove && freezerReady && (
          <div style={{ background: '#fff9f0', border: '1px solid #ffe8d1', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}><i className="fas fa-snowflake" /> 冰箱分类</strong>
              <span style={{ fontSize: 12, color: '#92400e' }}>
                <b>按住 ⠿ 拖动</b>即可调整顺序（= 走冰箱的拣货顺序，也是总库存的排序依据）；
                <b>直接改名字再按回车</b>即可重命名（会同步更新所有用了它的货品）；
                数字 = 有多少货品在用；🗑 = 删除（只删分类本身，货品上不再使用它时才建议删）。
              </span>
              <button className="fc-mini" style={{ marginLeft: 'auto', padding: '3px 10px' }} onClick={() => setShowFreezerMgr(false)}>收起</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {freezerPanelList.map((c, idx) => {
                // 序号取「显示顺序」的下标（不是服务端顺序）：拖动过程中就跟着实时变，像真的在挪位置
                const pos = c.registered === false ? -1 : idx
                const unregistered = c.registered === false
                const dragging = c.id != null && c.id === fcDragId
                return (
                  <div key={c.name} data-fcid={c.id ?? undefined}
                    className={'fc-chip' + (dragging ? ' is-dragging' : '')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, background: '#fff',
                      border: '1px solid #ffe8d1', borderRadius: 8, padding: '4px 8px',
                    }}>
                    {!unregistered && (
                      <span className="fc-grip" tabIndex={0} role="button"
                        title="按住拖动调整顺序（键盘：聚焦后按 ←→ 挪一格）"
                        onPointerDown={e => onGripDown(e, c.id!)}
                        onKeyDown={e => onGripKey(e, c.id!)}
                        aria-label={`拖动 ${c.name} 调整顺序，当前位置第 ${pos + 1} 位`}>
                        <i className="fas fa-grip-vertical" />
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 16, textAlign: 'right' }}>{pos >= 0 ? pos + 1 : '新'}</span>
                    {unregistered ? (
                      <>
                        <span style={{ fontSize: 13 }} title="货品上在用，但还没进分类清单">{c.name}</span>
                        <button className="fc-mini fc-primary" style={{ padding: '2px 8px' }}
                          onClick={() => registerFreezerCat(c.name)} disabled={fcBusy}
                          title="加入分类清单，之后就能改名和排序">＋ 加入</button>
                      </>
                    ) : (
                      <>
                        <input className="fc-name" value={fcDrafts[c.id!] ?? c.name} disabled={fcBusy}
                          onChange={e => setFcDrafts(p => ({ ...p, [c.id!]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          onBlur={() => { if (fcDrafts[c.id!] != null) renameFreezerCat(c.id!, c.name, fcDrafts[c.id!]) }}
                          title="改完按回车或点别处即生效"
                          style={{ width: 88, padding: '2px 6px', fontSize: 13 }} />
                        <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 20, textAlign: 'center' }}
                          title={`被 ${c.usage_count || 0} 个货品使用`}>{c.usage_count || 0}</span>
                        <button className="fc-mini fc-danger" disabled={fcBusy}
                          onClick={() => removeFreezerCat(c.id!, c.name, c.usage_count || 0)}
                          title={c.usage_count > 0
                            ? `删除（会让 ${c.usage_count} 个货品失去这个分类）`
                            : '删除'}><i className="fas fa-trash-alt" /></button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
              <input className="fc-name" placeholder="新冰箱分类名" value={fcNewName} disabled={fcBusy}
                onChange={e => setFcNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFreezerCat() }}
                style={{ width: 160, padding: '4px 8px' }} />
              <button className="btn btn-primary" style={{ padding: '4px 12px' }} onClick={addFreezerCat} disabled={fcBusy}>
                <i className="fas fa-plus" /> 新增分类
              </button>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>新分类排在最后，拖动手柄可以调整位置</span>
            </div>
          </div>
        )}

        <div className="excel-container">
          <div className="table-scroll-container">
            <table className={'excel-table' + (system !== 'overview' ? ' has-pos' : '')} id="excel-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th className="sortable" onClick={() => toggleSort('code')}
                    title="点击按「货品编号」排序，再点一次切换升/降序">
                    货品编号 <i className={'fas ' + (sortKey === 'code' ? (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort')} />
                  </th>
                  <th className="sortable" onClick={() => toggleSort('name')}
                    title="点击按「货品名字」排序，再点一次切换升/降序">
                    货品名字 <i className={'fas ' + (sortKey === 'name' ? (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort')} />
                  </th>
                  <th>规格</th>
                  <th>单价 (RM)</th>
                  <th>货品类型</th>
                  <th>供应商</th>
                  <th>申请人</th>
                  <th>系统分配</th>
                  <th>冰箱分类</th>
                  {system !== 'overview' && <th>位次</th>}
                  {system !== 'overview' && <th title="停用后不出现在进出货的货品下拉、总库存和手机版列表（需要「批准」权限）">启用</th>}
                  <th>{statusColTitle}</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="excel-tbody">
                {/* 新行（可编辑） */}
                {newRows.map((r, idx) => (
                  <tr key={String(r._key)} className="new-row" data-new-key={String(r._key)}>
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
                      {/* 总览：单价按系统各存一份，这里只读展示 4 套；要改到中央/J1/J2/J3 页面 */}
                      {system === 'overview'
                        ? <input className="excel-input" readOnly value={r.price_by_system || ''} title="各系统各自的单价：到中央/J1/J2/J3 页面修改" />
                        : <input className="excel-input text-input" type="number" min={0} step="0.00001" placeholder="0.00"
                            value={r.price || ''} onFocus={selectAllOnFocus} onChange={(e) => setNew(idx, { price: e.target.value })} />}
                    </td>
                    <td>
                      <select className="excel-select" value={r.category || ''} onChange={(e) => setNew(idx, { category: e.target.value })}>
                        <option value="">选择类型</option>
                        {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td><input className="excel-input text-input" placeholder="供应商名称" value={r.supplier || ''} onFocus={selectAllOnFocus} onChange={(e) => setNew(idx, { supplier: e.target.value })} /></td>
                    <td><input className="excel-input text-input readonly" readOnly value={r.applicant || ''} placeholder="申请人" /></td>
                    {/* 系统分配：总览可编辑；其它系统页只读，且显示**真实分配**（原来显示 currentSys.value 是假值，
                        既误导用户"这货只属于当前系统"，又和被保存覆盖的问题相互掩盖） */}
                    <td>
                      {system === 'overview'
                        ? <MultiSelect value={r.system_assign || ''} options={assignableOptions} onChange={(v) => setNew(idx, { system_assign: v })} />
                        : <input className="excel-input text-input readonly" readOnly value={r.system_assign || ''} title="仅总览可设置系统分配" />}
                    </td>
                    <td>
                      {/* 同上：总览只读展示 4 套 */}
                      {system === 'overview'
                        ? <input className="excel-input" readOnly value={r.freezer_by_system || ''} title="各系统各自的冰箱分类：到中央/J1/J2/J3 页面修改" />
                        : <MultiSelect value={r.freezer_category || ''} options={freezerOptions} creatable={canApprove} onCreate={createFreezerInline} onChange={(v) => setNew(idx, { freezer_category: v })} />}
                    </td>
                    {system !== 'overview' && <td><input className="excel-input" type="number" min={0} placeholder="如 1" value={r.freezer_position ?? ''} onChange={(e) => setNew(idx, { freezer_position: e.target.value === '' ? '' : Number(e.target.value) })} /></td>}
                    <td style={{ padding: 8 }}><span style={{ color: '#92400e', fontWeight: 600 }}>待批准</span></td>
                    <td className="action-cell">
                      <button className="edit-btn save-mode" onClick={() => saveNewRow(r)} title="保存这一行" disabled={saving}><i className="fas fa-save" /></button>
                      <button className="delete-row-btn" onClick={() => removeRow(r)} title="删除此行"><i className="fas fa-trash-alt" /></button>
                    </td>
                  </tr>
                ))}
                {/* 已有行 */}
                {sortedRows.map((r, idx) => {
                  const id = r.id!
                  const isEditing = editing.has(id)
                  const draft = drafts[id] || r
                  return (
                    <tr key={id} data-row-id={id} className={(r.approver ? 'status-approved' : 'status-pending') + (isEditing ? ' editing-row' : '') + (isHl(r) ? ' highlight-flash' : '')}>
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
                        {system === 'overview'
                          ? <input className="excel-input" readOnly value={r.price_by_system || ''} title={overviewPriceTip(r)} />
                          : isEditing
                            ? <input className="excel-input text-input" type="number" min={0} step="0.00001" placeholder="0.00" title={priceTip(r)}
                                value={draft.price || ''} onFocus={selectAllOnFocus} onChange={(e) => setDraft(id, { price: e.target.value })} />
                            : <input className="excel-input" readOnly value={r.price || ''} title={priceTip(r)} />}
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
                      <td><input className="excel-input text-input" readOnly title={[
                        `申请人: ${r.applicant || '-'}`,
                        `创建时间: ${r.created_at || '-'}`,
                        ...(r.updated_by ? [`编辑人: ${r.updated_by}`, `编辑时间: ${r.updated_at || '-'}`] : []),
                      ].join('\n')} value={draft.applicant || r.applicant || ''} /></td>
                      {/* 总览可编辑；打码行（还分配给无权限系统）保持只读 —— 保存时不送 system_assign，别家分配不受影响 */}
                      <td>
                        {system === 'overview' ? (
                          isEditing && !r._assignMasked
                            ? <MultiSelect value={draft.system_assign || ''} options={assignableOptions} onChange={(v) => setDraft(id, { system_assign: v })} />
                            : <input className="excel-input" readOnly value={r.system_assign || ''}
                                title={r._assignMasked ? '该货品还分配给其它系统（这里只显示你有权限的部分），保存不会改动系统分配' : undefined} />
                        ) : (
                          <input className="excel-input" readOnly value={r.system_assign || ''} title="仅总览可设置系统分配" />
                        )}
                      </td>
                      <td>
                        {system === 'overview'
                          ? <input className="excel-input" readOnly value={r.freezer_by_system || ''} title={overviewFreezerTip(r)} />
                          : isEditing
                            ? <MultiSelect value={draft.freezer_category || ''} options={freezerOptions} creatable={canApprove} onCreate={createFreezerInline} onChange={(v) => setDraft(id, { freezer_category: v })} />
                            : <input className="excel-input" readOnly value={r.freezer_category || ''} />}
                      </td>
                      {system !== 'overview' && (
                        <td>
                          {isEditing
                            ? <input className="excel-input" type="number" min={0} placeholder="如 1" value={draft.freezer_position ?? ''} onChange={(e) => setDraft(id, { freezer_position: e.target.value === '' ? '' : Number(e.target.value) })} />
                            : <input className="excel-input" readOnly value={r.freezer_position || ''} placeholder="未设置" />}
                        </td>
                      )}
                      {system !== 'overview' && (
                        <td>
                          {/* 启用/停用（按系统，2026-09-19）：停用后不进进出货下拉 / 总库存 / 手机版。
                              改这个需要「批准」权限（后端也校验）；还有库存时后端会拒绝并说明还剩多少 */}
                          {Number(r.active ?? 1) === 0 ? (
                            canApprove ? (
                              <button className="active-btn on" onClick={() => toggleActive(r)} disabled={activatingId === id} title="点击重新启用（恢复出现在进出货下拉/总库存）">
                                {activatingId === id ? '处理中…' : '启用'}
                              </button>
                            ) : <span style={{ color: '#9ca3af', fontWeight: 600, fontSize: 12 }}>已停用</span>
                          ) : (
                            canApprove ? (
                              <button className="active-btn" onClick={() => toggleActive(r)} disabled={activatingId === id} title="停用后不再出现在进出货的货品下拉、总库存和手机版列表；有库存时不能停用">
                                {activatingId === id ? '处理中…' : '停用'}
                              </button>
                            ) : <span style={{ color: '#6b7280', fontSize: 12 }}>启用</span>
                          )}
                        </td>
                      )}
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
                        {/* 打码行同样可操作（2026-09-19）：防覆盖改为"保存时不发 system_assign"，不再是整行锁死 */}
                        {/* 权限（2026-09-19 用户要求）：编辑/保存/取消 = 申请权限；**删除 = 批准权限**（只有申请权限的人不显示垃圾桶） */}
                        {(canApply || canApprove) && (isEditing ? (
                          <>
                            <button className="edit-btn save-mode" onClick={() => saveEdit(id)} title="保存这一行" disabled={saving}><i className="fas fa-save" /></button>
                            <button className="delete-row-btn" onClick={() => cancelEdit(id)} title="取消这一行的修改"><i className="fas fa-times" /></button>
                          </>
                        ) : (
                          <>
                            {canApply && (
                              <button className="edit-btn" onClick={() => startEdit(r)} title="编辑记录（可多行一起改，改完按 Ctrl+S 从最上面逐行保存，或 Ctrl+Shift+S 一次全存）"><i className="fas fa-edit" /></button>
                            )}
                            {canApprove && (
                              <button className="delete-row-btn" onClick={() => removeRow(r)} title="删除此行（需要「批准」权限）"><i className="fas fa-trash-alt" /></button>
                            )}
                          </>
                        ))}
                      </td>
                    </tr>
                  )
                })}
                {!loading && rows.length === 0 && newRows.length === 0 && (
                  <tr><td colSpan={system === 'overview' ? 12 : 14} style={{ padding: 40, color: '#6b7280' }}>暂无数据</td></tr>
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
