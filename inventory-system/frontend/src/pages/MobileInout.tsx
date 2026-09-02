import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getMobilePriceTiers, getMobileTotals, batchSaveMobileRecords,
  type MobilePriceTier, type MobileTotalRow,
} from '../api/mobile'
import { getMe } from '../api'
import { showToast } from '../utils/toast'
import '../styles/mobile-stocklist.css'

/**
 * 电话版出货（对齐旧系统 /mobile/ch/stocklistjX.php「库存列表 (JX)」）
 * 业务：列表展示当前库存（隐藏 ≤0）→ 点 ✎ 改「剩余量」→ 保存时
 *   差值 = 出货量 → 实时按价格层预检 → HIFO 高价先扣拆行 → batch_save 原子提交。
 * 设计：1:1 对齐旧版手机应用（styles/mobile-stocklist.css 移植旧 stocklist.css）：
 *   退出登录 + 标题 + 日期/日历钮、吸顶双下拉 + 搜索、stats、紧凑卡片行（一屏 10+ 货品）。
 * 权限：分店用户经 URL 直达该分店（?system=jX），页面不提供分店切换与返回桌面入口。
 */

const SYSTEMS = ['j1', 'j2', 'j3'] as const

/** 旧版三店共用的固定区域选项（updateFreezerCategoryOptions 的 allFreezerCategories） */
const FIXED_AREAS = [
  'K1-1', 'K1-2', 'K1-3', 'K1-4', 'K1-5', 'K1-6', 'K1-7', 'C-1',
  'KDI-1', 'KDI-2', 'KDI-3', 'KDI-4',
  'S1-1', 'S1-2', 'S1-3', 'S1-4',
  'SBS-1', 'SBS-2', 'SBDI-1', 'SBDI-2',
]

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtMonthDay = (dateStr: string) => {
  const m = /^(?:\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  return m ? `${Number(m[1])}月${Number(m[2])}日` : ''
}
const qty3 = (n?: number) => (n == null ? '0.000' : Number(n).toFixed(3))

/** 旧版统一把 Drinks 显示为 Service Line（与后台一致） */
const normCategory = (c?: string) =>
  c === 'Drinks' || c === 'drinks' ? 'Service Line' : (c || '')

/** 图标（对齐旧版 icons/*.svg 的内联替代） */
const Icon = {
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </svg>
  ),
  pencil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
}

export default function MobileInout() {
  const [searchParams] = useSearchParams()
  const system = useMemo(() => {
    const s = (searchParams.get('system') || 'j1').toLowerCase()
    return (SYSTEMS as readonly string[]).includes(s) ? s : 'j1'
  }, [searchParams])

  const [me, setMe] = useState<{ username: string; branch: string } | null>(null)
  const [rows, setRows] = useState<MobileTotalRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  // 工作日期（对齐旧 workDateManager：按分店持久化 localStorage/sessionStorage）
  const [workDate, setWorkDateState] = useState(() => {
    const key = `${system}_stock_edit_date`
    try {
      const saved = sessionStorage.getItem(key) || localStorage.getItem(key)
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved
    } catch { /* ignore */ }
    return fmtDay(new Date())
  })
  const [showCal, setShowCal] = useState(false)
  const [calDraft, setCalDraft] = useState(fmtDay(new Date()))
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    getMe().then(u => setMe({ username: u.username, branch: u.branch || '' })).catch(() => {})
  }, [])

  // 权限（users.branch：kh 全通，否则须含分店；对齐旧 branch_check.php）
  const allowed = useMemo(() => {
    if (!me) return false
    const parts = (me.branch || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
    if (parts.includes('kh')) return true
    return parts.includes(system)
  }, [me, system])

  const [summaryCount, setSummaryCount] = useState(0)
  const loadTotals = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    try {
      const resp = await getMobileTotals(system)
      setRows(resp.items)
      setSummaryCount(resp.summaryCount)
    } catch { /* 拦截器已提示 */ }
    setLoading(false)
  }, [system, allowed])

  useEffect(() => { loadTotals() }, [loadTotals])

  // 工作日期持久化（对齐旧 setDefaultWorkDate：双写 localStorage + sessionStorage）
  const setWorkDate = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    setWorkDateState(d)
    try {
      localStorage.setItem(`${system}_stock_edit_date`, d)
      sessionStorage.setItem(`${system}_stock_edit_date`, d)
    } catch { /* ignore */ }
  }

  // 库存分类选项（对齐旧 updateProductCategoryOptions：全量唯一 + 排序；Drinks → Service Line）
  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => { const c = normCategory(r.type); if (c) set.add(c) })
    return Array.from(set).sort()
  }, [rows])

  // 区域选项（对齐旧 updateFreezerCategoryOptions：未选分类 = 固定 20 项；选了分类 = 该分类涉及的区域）
  const areaOptions = useMemo(() => {
    if (!typeFilter) return FIXED_AREAS
    const set = new Set<string>()
    rows.forEach(r => {
      if (normCategory(r.type) !== typeFilter) return
      String(r.freezer_category || '').split(',').map(s => s.trim()).filter(Boolean).forEach(c => set.add(c))
    })
    return FIXED_AREAS.filter(a => set.has(a))
  }, [rows, typeFilter])

  const visible = useMemo(() => {
    // 零库存过滤（对齐旧 generateTable：排除数量 ≤ 0）+ 搜索 + 分类 + 区域，最后按名称排序
    const term = search.toLowerCase().trim()
    return rows
      .filter(r => Number(r.total_qty) > 0)
      .filter(r => !typeFilter || normCategory(r.type) === typeFilter)
      .filter(r => {
        if (!areaFilter) return true
        const areas = String(r.freezer_category || '').split(',').map(s => s.trim())
        return areas.includes(areaFilter)
      })
      .filter(r => {
        if (!term) return true
        return (r.product_name || '').toLowerCase().includes(term) ||
          (r.code_number || '').toLowerCase().includes(term)
      })
      .sort((a, b) => (a.product_name || '').toLowerCase().localeCompare((b.product_name || '').toLowerCase()))
  }, [rows, search, typeFilter, areaFilter])

  useEffect(() => {
    if (areaFilter && !areaOptions.includes(areaFilter)) setAreaFilter('')
  }, [areaOptions, areaFilter])

  const totalRecords = summaryCount > 0 ? summaryCount : rows.filter(r => Number(r.total_qty) > 0).length

  const startEdit = (id: number) => {
    if (savingId != null) return
    const r = rows.find(x => x.id === id)
    if (!r) return
    setEditingId(id)
    setDraft(qty3(Number(r.total_qty)))
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  /** 电话版核心（对齐旧 saveRecord）：保存「剩余量」→ 差值 = 出货量 → HIFO 拆行 → batch_save */
  const saveRecord = async (id: number) => {
    if (savingId != null) return
    const record = rows.find(r => r.id === id)
    if (!record) return
    let currentQty = Number.parseFloat(draft)
    if (Number.isNaN(currentQty) || currentQty < 0) currentQty = 0

    // ① 实时获取按价格分组的可用库存（product_stock_by_price）
    let tiers: MobilePriceTier[] = []
    try {
      tiers = await getMobilePriceTiers(system, record.product_name || '', record.code_number || '')
    } catch { /* 拦截器已提示 */ }

    // ② 汇总所有价格层的可用库存（负数截 0）
    const totalStock = tiers.reduce((sum, t) => sum + Math.max(0, Number(t.available) || 0), 0)

    // ③ 本次出货量 = 实时库存 − 剩余量
    const outQty = totalStock - currentQty
    if (outQty < -0.0001) {
      showToast(`库存不足！当前库存: ${totalStock.toFixed(3)}，请输入 ≤ ${totalStock.toFixed(3)} 的数量`, 'error')
      setDraft(totalStock.toFixed(3)) // 对齐旧版：把输入纠正为最大可用量，保持编辑态
      return
    }
    if (Math.abs(outQty) < 0.0001) {
      showToast(`数量未变化，已取消编辑：${record.product_name}`, 'info')
      cancelEdit()
      return
    }

    // ④ 工作日期非今天 → 确认（对齐旧 confirmWorkDateBeforeSave）
    const today = fmtDay(new Date())
    if (workDate !== today && !window.confirm(`货单将保存到 ${workDate}（今天为 ${today}），是否继续？`)) return

    // ⑤ 按价格从高到低拆行（每层时间 +1s，receiver=当前用户名）
    const base = new Date()
    const baseTime = base.toTimeString().slice(0, 8)
    const outRows = []
    if (tiers.length === 0) {
      outRows.push({
        time: baseTime, productName: record.product_name || '',
        codeNumber: record.code_number || undefined,
        specification: record.specification || undefined,
        type: normCategory(record.type) || undefined,
        outQuantity: outQty, receiver: me?.username || 'Mobile',
      })
    } else {
      let remaining = outQty
      let i = 0
      for (const t of tiers) {
        if (remaining <= 0.001) break
        const available = Number(t.available) || 0
        if (available <= 0) continue
        const deduct = Math.min(remaining, available)
        if (deduct > 0.001) {
          const ts = new Date(base.getTime() + i * 1000)
          outRows.push({
            time: ts.toTimeString().slice(0, 8),
            productName: record.product_name || '',
            codeNumber: record.code_number || undefined,
            specification: t.specification != null ? String(t.specification) : (record.specification || undefined),
            type: t.type || normCategory(record.type) || undefined,
            outQuantity: deduct, price: Number(t.price),
            receiver: me?.username || 'Mobile',
          })
          remaining -= deduct
          i++
        }
      }
      if (remaining > 0.001) {
        showToast(`警告：库存不足！产品: ${record.product_name}，需要扣除 ${outQty.toFixed(3)}，实际可扣除 ${(outQty - remaining).toFixed(3)}`, 'error')
        return
      }
    }

    // ⑥ 原子批量提交
    setSavingId(id)
    try {
      await batchSaveMobileRecords({ system, documentDate: workDate, rows: outRows })
      // 对齐旧版成功提示：带各价格层明细（RM 单价: 数量）
      const details = outRows.map(r => `RM ${(r.price || 0).toFixed(2)}: ${r.outQuantity.toFixed(3)}`).join(', ')
      showToast(`已保存：${record.product_name}｜总出货 ${outQty.toFixed(3)}｜${details}`, 'success')
      setEditingId(null)
      setDraft('')
      await loadTotals()
    } catch { /* 拦截器已提示 */ }
    setSavingId(null)
  }

  // 退出登录（对齐旧 logout-button：清 token 回登录页；分店用户只有这条出口）
  const logout = () => {
    localStorage.removeItem('inv_token')
    sessionStorage.clear()
    window.location.href = '/login'
  }

  return (
    <div className="msl-page">
      {/* ===== 页头：退出 + 标题 + 日期 + 日历（对齐旧 page-header，无返回桌面/分店切换） ===== */}
      <header className="msl-header">
        <button className="msl-logout" onClick={logout} aria-label="退出登录" title="退出登录">
          {Icon.logout}
        </button>
        <h1 className="msl-title">库存列表 ({system.toUpperCase()})</h1>
        <div className="msl-header-right">
          <span className="msl-date">{fmtMonthDay(workDate)}</span>
          <button className="msl-cal-btn" onClick={() => { setCalDraft(workDate); setShowCal(true) }} aria-label="日历" title="选择工作日期">
            {Icon.calendar}
          </button>
        </div>
      </header>

      {/* ===== 筛选区（吸顶：双下拉 + 搜索，对齐旧 form-section） ===== */}
      <section className="msl-form">
        <div className="msl-selects-row">
          <div className="msl-select-group">
            <div className="msl-select-wrap">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="库存分类">
                <option value="" disabled hidden>库存分类</option>
                <option value="">全部</option>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="msl-select-icon" aria-hidden="true" />
            </div>
          </div>
          <div className="msl-select-group">
            <div className="msl-select-wrap">
              <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} aria-label="区域">
                <option value="" disabled hidden>区域</option>
                <option value="">全部</option>
                {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span className="msl-select-icon" aria-hidden="true" />
            </div>
          </div>
        </div>
        <div className="msl-search">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="按商品名称搜索" aria-label="按商品名称搜索" />
          <button className="msl-btn-search" onClick={() => { /* 实时过滤，按钮为对齐旧版视觉 */ }} aria-label="搜索">{Icon.search}</button>
        </div>
      </section>

      {/* stats（显示记录 / 总记录） */}
      <div className="msl-stats">
        <span>显示记录: <span className="msl-stat-value">{visible.length}</span></span>
        <span>总记录: <span className="msl-stat-value">{totalRecords}</span></span>
      </div>

      {!allowed ? (
        <div className="msl-msg is-error">无权限操作 {system.toUpperCase()}（你的分店: {me?.branch || '—'}）</div>
      ) : (
        <>
          {loading && <div className="msl-msg">加载中...</div>}
          {!loading && visible.length === 0 && <div className="msl-msg">没有找到产品</div>}
          <div className="msl-list">
            {visible.map(r => {
              const editing = editingId === r.id
              return (
                <div key={r.id} className="msl-row">
                  <div className="msl-name">{r.product_name}</div>
                  <div className="msl-footer">
                    <span className="msl-meta">{r.code_number || '—'}{r.specification ? ` · ${r.specification}` : ''}</span>
                    <span className="msl-sep" aria-hidden="true">|</span>
                    <span className="msl-qty-group">
                      <span className="msl-qty-label">数量：</span>
                      <input
                        type="number" min={0} step={0.01}
                        className={'msl-qty-input' + (editing ? ' editing' : '')}
                        value={editing ? draft : qty3(Number(r.total_qty))}
                        readOnly={!editing}
                        onChange={e => setDraft(e.target.value)}
                        onFocus={e => { if (editing) e.currentTarget.select() }}
                        onKeyDown={e => { if (e.key === 'Enter') saveRecord(r.id); if (e.key === 'Escape') cancelEdit() }}
                      />
                    </span>
                  </div>
                  <div className="msl-actions">
                    {/* 对齐旧版：单按钮切换 ✎（奶油）→ 保存（绿底白笔）；数量未变保存 = 取消 */}
                    <button
                      className={'msl-edit-btn' + (editing ? ' saving' : '')}
                      onClick={() => (editing ? saveRecord(r.id) : startEdit(r.id))}
                      disabled={savingId === r.id}
                      title={editing ? '保存' : '编辑'}
                    >
                      {Icon.pencil}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* 日历弹窗（对齐旧 calendar-modal：选择日期 / 取消 / 确定） */}
      {showCal && (
        <div className="msl-cal-overlay" onClick={() => setShowCal(false)}>
          <div className="msl-cal-modal" onClick={e => e.stopPropagation()}>
            <h3>选择日期</h3>
            <input type="date" className="msl-date-input" value={calDraft} onChange={e => setCalDraft(e.target.value)} aria-label="选择日期" />
            <div className="msl-cal-actions">
              <button className="msl-btn-cancel" onClick={() => setShowCal(false)}>取消</button>
              <button className="msl-btn-confirm" onClick={() => { if (calDraft) setWorkDate(calDraft); setShowCal(false) }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
