import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getMobilePriceTiers, getMobileTotals, batchSaveMobileRecords,
  type MobilePriceTier, type MobileTotalRow,
} from '../api/mobile'
import { getMe } from '../api'
import { showToast } from '../utils/toast'

/**
 * 电话版出货（对齐旧系统 /mobile/ch/stocklistjX.php「库存列表 (JX)」）
 * 业务：列表展示当前库存（隐藏 ≤0）→ 点 ✎ 改「剩余量」→ 保存时
 *   差值 = 出货量 → 实时按价格层预检 → HIFO 高价先扣拆行 → batch_save 原子提交。
 * 设计：像素级对齐旧版手机应用（白头区 + 双下拉 + 搜索钮 + stats + 大圆角卡片 + 奶油编辑块）。
 */

const SYSTEMS = [
  { key: 'j1', label: 'J1' },
  { key: 'j2', label: 'J2' },
  { key: 'j3', label: 'J3' },
]

const C = {
  bodyBg: '#f4f7f2', cardBg: '#fdf9f1', text: '#2f2a24', muted: '#7a736b',
  border: '#d8d0c5', primary: '#f7931e', success: '#2aa745',
  danger: '#ef4444', white: '#ffffff', cream: '#f4efe4',
}
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif'

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtMonthDay = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
const qty3 = (n?: number) => (n == null ? '0.000' : Number(n).toFixed(3))

export default function MobileInout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const system = useMemo(() => {
    const s = (searchParams.get('system') || 'j1').toLowerCase()
    return SYSTEMS.some(x => x.key === s) ? s : 'j1'
  }, [searchParams])

  const [me, setMe] = useState<{ username: string; branch: string } | null>(null)
  const [rows, setRows] = useState<MobileTotalRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [workDate, setWorkDate] = useState(fmtDay(new Date()))
  const [showCal, setShowCal] = useState(false)
  const [calDraft, setCalDraft] = useState(fmtDay(new Date()))
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    getMe().then(u => setMe({ username: u.username, branch: u.branch || '' })).catch(() => {})
  }, [])

  const allowedSystems = useMemo(() => {
    const parts = (me?.branch || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
    if (!me) return []
    if (parts.includes('kh')) return SYSTEMS.map(s => s.key)
    return SYSTEMS.map(s => s.key).filter(k => parts.includes(k))
  }, [me])
  const allowed = allowedSystems.includes(system)

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

  // 下拉选项（对齐旧版：库存分类 = category；区域 = freezer_category 逗号拆分）
  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => { if (r.type) set.add(r.type) })
    return Array.from(set).sort()
  }, [rows])

  const areaOptions = useMemo(() => {
    // 对齐旧版 updateFreezerCategoryOptions：区域选项跟随当前「库存分类」联动
    const set = new Set<string>()
    rows.forEach(r => {
      if (typeFilter && (r.type || '') !== typeFilter) return
      String(r.freezer_category || '').split(',').map(s => s.trim()).filter(Boolean).forEach(c => set.add(c))
    })
    return Array.from(set).sort()
  }, [rows, typeFilter])

  const visible = useMemo(() => {
    // 零库存过滤（对齐旧版：排除数量 ≤ 0）+ 搜索 + 类型 + 区域
    const term = search.toLowerCase().trim()
    return rows
      .filter(r => Number(r.total_qty) > 0)
      .filter(r => !typeFilter || (r.type || '') === typeFilter)
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
  }, [rows, search, typeFilter, areaFilter])

  useEffect(() => {
    if (areaFilter && !areaOptions.includes(areaFilter)) setAreaFilter('')
  }, [areaOptions, areaFilter])

  const startEdit = (id: number) => {
    const r = rows.find(x => x.id === id)
    if (!r) return
    setEditingId(id)
    setDraft(qty3(Number(r.total_qty)))
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  /** 电话版核心：保存「剩余量」→ 差值 = 出货量 → HIFO 拆行 → batch_save */
  const saveRecord = async (id: number) => {
    if (savingId != null) return
    const record = rows.find(r => r.id === id)
    if (!record) return
    let currentQty = Number.parseFloat(draft)
    if (Number.isNaN(currentQty) || currentQty < 0) currentQty = 0

    // ① 实时获取按价格分组的可用库存
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
      cancelEdit()
      return
    }
    if (Math.abs(outQty) < 0.0001) {
      showToast('数量未变化，已取消编辑', 'info')
      cancelEdit()
      return
    }

    // ④ 按价格从高到低拆行（每层时间 +1s，receiver=当前用户名）
    const base = new Date()
    const baseTime = base.toTimeString().slice(0, 8)
    const outRows = []
    if (tiers.length === 0) {
      outRows.push({
        time: baseTime, productName: record.product_name || '',
        codeNumber: record.code_number || undefined,
        specification: record.specification || undefined,
        type: record.type || undefined,
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
            type: t.type || record.type || undefined,
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

    // ⑤ 原子批量提交
    setSavingId(id)
    try {
      await batchSaveMobileRecords({ system, documentDate: workDate, rows: outRows })
      showToast(`已出货 ${outQty.toFixed(3)}（${outRows.length} 层）`, 'success')
      setEditingId(null)
      setDraft('')
      await loadTotals()
    } catch { /* 拦截器已提示 */ }
    setSavingId(null)
  }

  return (
    <div style={{ ...S.page, fontFamily: FONT }}>
      {/* ===== 白色头区：页头 + 双下拉 + 搜索 ===== */}
      <div style={S.whiteHead}>
        <div style={S.pageHeader}>
          <button onClick={() => navigate(`/records?system=${system}`)} style={S.sqBtn} title="返回桌面版">
            <span style={{ fontSize: 18 }}>←</span>
          </button>
          <h1 style={S.h1}>库存列表 ({system.toUpperCase()})</h1>
          <span style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{fmtMonthDay(workDate)}</span>
          <button onClick={() => { setCalDraft(workDate); setShowCal(true) }} style={S.sqBtn} title="选择工作日期">📅</button>
        </div>

        {/* 分店切换（按用户 branch 过滤；旧版由登录分店决定） */}
        <div style={{ display: 'flex', gap: 6, margin: '10px 0 2px' }}>
          {SYSTEMS.filter(s => allowedSystems.includes(s.key)).map(s => (
            <button key={s.key} onClick={() => navigate(`/mobile/inout?system=${s.key}`)}
              style={{ ...S.segBtn, ...(system === s.key ? S.segBtnOn : {}) }}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={S.selectsRow}>
          <div style={{ ...S.selectWrap, flex: 1 }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.select}>
              <option value="" disabled hidden>库存分类</option>
              <option value="">全部</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span style={S.selectIcon} />
          </div>
          <div style={{ ...S.selectWrap, flex: 1 }}>
            <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} style={S.select}>
              <option value="" disabled hidden>区域</option>
              <option value="">全部</option>
              {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={S.selectIcon} />
          </div>
        </div>
        <div style={S.searchRow}>
          <input style={S.input} value={search} onChange={e => setSearch(e.target.value)} placeholder="按商品名称 / 编号搜索" />
          <button style={S.searchBtn} onClick={() => { /* 实时过滤，按钮为对齐旧版视觉 */ }}>🔍</button>
        </div>
      </div>

      {/* stats（对齐旧版：显示记录/总记录） */}
      <div style={S.statsInfo}>
        <span>显示记录: <b style={{ color: C.text }}>{visible.length}</b></span>
        <span>总记录: <b style={{ color: C.text }}>{summaryCount}</b></span>
      </div>

      {!allowed ? (
        <div style={S.msg}>无权限操作 {system.toUpperCase()}（你的分店: {me?.branch || '—'}）</div>
      ) : (
        <>
          {loading && <div style={S.msg}>加载中…</div>}
          {!loading && visible.length === 0 && <div style={S.msg}>没有找到产品</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {visible.map(r => {
              const editing = editingId === r.id
              return (
                <div key={r.id} style={S.card}>
                  <div>
                    <div style={S.cardName}>{r.product_name}</div>
                    <div style={S.cardFooter}>
                      <span style={S.meta}>{r.code_number || '—'}</span>
                      <span style={{ color: 'rgba(122,115,107,.5)' }}>·</span>
                      <span style={S.meta}>{r.specification || '—'}</span>
                      <span style={S.sep}>｜</span>
                      <span style={S.meta}>数量：</span>
                      {editing ? (
                        <input type="number" inputMode="decimal" step="0.001" autoFocus
                          style={S.qtyInput} value={draft} onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRecord(r.id); if (e.key === 'Escape') cancelEdit() }} />
                      ) : (
                        <span style={{ ...S.meta, fontWeight: 700, color: C.text }}>{qty3(Number(r.total_qty))}</span>
                      )}
                    </div>
                  </div>
                  <div style={S.actions}>
                    {!editing && (
                      <button onClick={() => startEdit(r.id)} style={S.editBtn} title="改剩余量出货">✎</button>
                    )}
                    {editing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={() => saveRecord(r.id)} disabled={savingId === r.id}
                          style={{ ...S.editBtn, background: C.success, color: '#fff' }} title="保存出货">
                          {savingId === r.id ? '…' : '✓'}
                        </button>
                        <button onClick={cancelEdit} style={{ ...S.editBtn, fontSize: 13 }} title="取消">✕</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.7 }}>
            点 ✎ 把数量改成<b>出货后的剩余量</b> → ✓ 保存即出货<br />
            自动按价格从高到低分层扣货 · 工作日期 {workDate}
          </div>
        </>
      )}

      {/* 日历弹窗（对齐旧版 calendar-modal） */}
      {showCal && (
        <div style={S.calOverlay} onClick={() => setShowCal(false)}>
          <div style={S.calModal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: C.text }}>选择工作日期</h3>
            <input type="date" value={calDraft} onChange={e => setCalDraft(e.target.value)} style={S.calInput} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowCal(false)} style={{ ...S.calAction, background: '#e5e7eb', color: C.text }}>取消</button>
              <button onClick={() => { setWorkDate(calDraft); setShowCal(false) }} style={{ ...S.calAction, background: C.primary, color: '#fff' }}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- 内联样式（像素级对齐旧版 /mobile/ch/css/stocklist.css + 实测截图） ----------
const S: Record<string, React.CSSProperties> = {
  page: {
    width: '100%', maxWidth: 480, margin: '0 auto', background: C.bodyBg,
    minHeight: '100dvh', boxSizing: 'border-box',
    paddingBottom: 'max(48px, env(safe-area-inset-bottom))',
    display: 'flex', flexDirection: 'column',
  },
  whiteHead: {
    background: C.white, padding: '16px 16px 18px',
    boxShadow: '0 10px 18px rgba(44,44,44,.05)',
  },
  pageHeader: { display: 'flex', alignItems: 'center', gap: 14 },
  h1: { flex: 1, fontSize: 25, fontWeight: 700, margin: 0, color: '#000', letterSpacing: '0.01em', minWidth: 0 },
  sqBtn: {
    width: 52, height: 52, border: 'none', borderRadius: 16, background: C.primary,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#fff', fontSize: 17, padding: 0, flexShrink: 0,
  },
  segBtn: {
    height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border}`,
    background: C.white, color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  segBtnOn: { background: C.primary, borderColor: C.primary, color: '#fff' },
  selectsRow: { display: 'flex', gap: 12, marginTop: 16 },
  selectWrap: { position: 'relative', minWidth: 0 },
  select: {
    width: '100%', height: 60, padding: '0 44px 0 18px',
    border: '2px solid rgba(15,13,13,.12)', borderRadius: 18,
    background: C.white, fontSize: 18, color: C.text,
    appearance: 'none', WebkitAppearance: 'none', outline: 'none', cursor: 'pointer',
  },
  selectIcon: {
    position: 'absolute', right: 18, top: '50%', width: 11, height: 11,
    borderLeft: `2.5px solid ${C.muted}`, borderBottom: `2.5px solid ${C.muted}`,
    pointerEvents: 'none', transform: 'translateY(-70%) rotate(-45deg)',
  },
  searchRow: { display: 'flex', gap: 12, marginTop: 14 },
  input: {
    flex: 1, minWidth: 0, height: 60, border: '2px solid rgba(15,13,13,.12)',
    borderRadius: 18, padding: '0 18px', fontSize: 18, background: C.white, color: C.text, outline: 'none',
  },
  searchBtn: {
    width: 64, height: 60, border: 'none', borderRadius: 18, background: C.primary,
    fontSize: 20, cursor: 'pointer', flexShrink: 0,
  },
  statsInfo: {
    display: 'flex', justifyContent: 'flex-end', gap: 18,
    margin: '12px 4px 14px', fontSize: 15, color: C.muted,
  },
  card: {
    display: 'grid', gridTemplateColumns: '1fr auto',
    alignItems: 'center', gap: 12, background: C.white,
    border: '1px solid rgba(216,208,197,.5)', borderRadius: 24, padding: '20px 22px',
    boxShadow: '0 2px 10px rgba(44,44,44,.05)',
  },
  cardName: { fontSize: 20, fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word', color: '#000', marginBottom: 8 },
  cardFooter: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7, fontSize: 15, color: C.muted },
  meta: { lineHeight: 1.3, wordBreak: 'break-word' },
  sep: { color: 'rgba(122,115,107,.5)', margin: '0 2px' },
  actions: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  editBtn: {
    width: 68, height: 84, border: 'none', borderRadius: 20,
    background: C.cream, color: C.text,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 24,
  },
  qtyInput: {
    width: 110, boxSizing: 'border-box', height: 44, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: '4px 8px', fontSize: 16, fontWeight: 700, color: C.text,
    outline: 'none', fontVariantNumeric: 'tabular-nums',
  },
  msg: { textAlign: 'center', color: C.muted, fontSize: 14, padding: '36px 0' },
  calOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  calModal: {
    background: C.cardBg, borderRadius: 16, padding: 24, width: '100%', maxWidth: 340,
    boxShadow: '0 20px 40px rgba(0,0,0,.15)', border: `1px solid ${C.border}`,
  },
  calInput: {
    width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 16,
    border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', color: C.text,
  },
  calAction: { padding: '10px 20px', fontSize: 15, borderRadius: 10, border: 'none', fontWeight: 500, cursor: 'pointer' },
}
