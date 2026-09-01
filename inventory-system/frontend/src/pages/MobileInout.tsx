import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getMobilePriceTiers, getMobileTotals, batchSaveMobileRecords,
  type MobilePriceTier, type MobileTotalRow,
} from '../api/mobile'
import { getMe } from '../api'
import { showToast } from '../utils/toast'

/**
 * 电话版出货（对齐旧系统 /mobile/ch/stocklistjX.php 的「改剩余量即出货」业务）
 *
 * 流程：列表展示当前库存（jXstocklist_total，隐藏 ≤0）→ 点编辑改「剩余量」→ 保存时
 *   实时拉按价格分组的可用库存 → 出货量 = 库存 − 剩余量 → 按价格从高到低拆行
 *   → batch_save 原子提交（receiver=当前用户名，每层时间 +1s）。
 * 仅用于出货，没有进货。
 */

const SYSTEMS = [
  { key: 'j1', label: 'J1' },
  { key: 'j2', label: 'J2' },
  { key: 'j3', label: 'J3' },
]

const C = {
  bodyBg: '#f4f7f2', cardBg: '#fdf9f1', text: '#2f2a24', muted: '#7a736b',
  border: '#d8d0c5', primary: '#f7931e', success: '#2aa745',
  danger: '#ef4444', white: '#ffffff',
}
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif'

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const qtyText = (n?: number) => (n == null ? '0' : String(Number(n)))

interface RowVm extends MobileTotalRow {
  /** 编辑态 */
  editing?: boolean
  /** 编辑中的数量草稿 */
  draft?: string
}

export default function MobileInout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const system = useMemo(() => {
    const s = (searchParams.get('system') || 'j1').toLowerCase()
    return SYSTEMS.some(x => x.key === s) ? s : 'j1'
  }, [searchParams])

  const [me, setMe] = useState<{ username: string; branch: string } | null>(null)
  const [rows, setRows] = useState<RowVm[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [workDate, setWorkDate] = useState(fmtDay(new Date()))
  const [savingId, setSavingId] = useState<number | null>(null)

  useEffect(() => {
    getMe().then(u => setMe({ username: u.username, branch: u.branch || '' })).catch(() => {})
  }, [])

  // 权限：users.branch 含 kh（总部）全通，否则须包含对应分店（对齐旧 session branch 校验）
  const allowedSystems = useMemo(() => {
    const parts = (me?.branch || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
    if (!me) return []
    if (parts.includes('kh')) return SYSTEMS.map(s => s.key)
    // 严格口径（与后端一致）：branch 为空 → 无任何分店权限
    return SYSTEMS.map(s => s.key).filter(k => parts.includes(k))
  }, [me])
  const allowed = allowedSystems.includes(system)

  const loadTotals = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    try {
      setRows(await getMobileTotals(system))
    } catch { /* 拦截器已提示 */ }
    setLoading(false)
  }, [system, allowed])

  useEffect(() => { loadTotals() }, [loadTotals])

  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => { if (r.type) set.add(r.type) })
    return Array.from(set).sort()
  }, [rows])

  const visible = useMemo(() => {
    // 零库存过滤（对齐旧版：排除数量 ≤ 0 的行）+ 搜索 + 类型筛选
    const term = search.toLowerCase().trim()
    return rows
      .filter(r => Number(r.total_qty) > 0)
      .filter(r => !typeFilter || (r.type || '') === typeFilter)
      .filter(r => {
        if (!term) return true
        return (r.product_name || '').toLowerCase().includes(term) ||
          (r.code_number || '').toLowerCase().includes(term)
      })
  }, [rows, search, typeFilter])

  const startEdit = (id: number) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, editing: true, draft: qtyText(Number(r.total_qty)) } : r)))
  }
  const cancelEdit = (id: number) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, editing: false, draft: undefined } : r)))
  }
  const setDraft = (id: number, v: string) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, draft: v } : r)))
  }

  /** 电话版核心：保存「剩余量」→ 差值 = 出货量 → HIFO 拆行 → batch_save */
  const saveRecord = async (id: number) => {
    if (savingId != null) return
    const record = rows.find(r => r.id === id)
    if (!record) return
    let currentQty = Number.parseFloat(record.draft || '')
    if (Number.isNaN(currentQty) || currentQty < 0) currentQty = 0

    // ① 实时获取按价格分组的可用库存
    let tiers: MobilePriceTier[] = []
    try {
      tiers = await getMobilePriceTiers(system, record.product_name || '', record.code_number || '')
    } catch { /* 拦截器已提示 */ }

    // ② 汇总所有价格层的可用库存（负数截 0，对齐旧版）
    const totalStock = tiers.reduce((sum, t) => sum + Math.max(0, Number(t.available) || 0), 0)

    // ③ 本次出货量 = 实时库存 − 用户输入的剩余量
    const outQty = totalStock - currentQty
    if (outQty < -0.0001) {
      showToast(`库存不足！当前库存: ${totalStock.toFixed(3)}，请输入 ≤ ${totalStock.toFixed(3)} 的数量`, 'error')
      cancelEdit(id)
      return
    }
    if (Math.abs(outQty) < 0.0001) {
      showToast('数量未变化，已取消编辑', 'info')
      cancelEdit(id)
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
      setRows(rs => rs.map(r => (r.id === id ? { ...r, editing: false, draft: undefined } : r)))
      await loadTotals()
    } catch { /* 拦截器已提示 */ }
    setSavingId(null)
  }

  const visibleSystems = allowedSystems

  return (
    <div style={{ ...S.page, fontFamily: FONT }}>
      {/* 页头（对齐旧版：标题 + 橙色方形圆角按钮） */}
      <div style={S.pageHeader}>
        <button onClick={() => navigate(`/records?system=${system}`)} style={S.iconBtn} title="返回桌面版">←</button>
        <h1 style={S.h1}>电话出货 · {system.toUpperCase()}</h1>
        <button onClick={() => navigate('/records')} style={{ ...S.iconBtn, fontSize: 12, fontWeight: 600 }}>桌面</button>
      </div>

      {/* 分店切换（按用户 branch 过滤） */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {SYSTEMS.filter(s => visibleSystems.includes(s.key)).map(s => (
          <button key={s.key} onClick={() => navigate(`/mobile/inout?system=${s.key}`)}
            style={{ ...S.segBtn, minWidth: 52, ...(system === s.key ? S.segBtnOn : {}) }}>
            {s.label}
          </button>
        ))}
      </div>

      {!allowed ? (
        <div style={S.msg}>无权限操作 {system.toUpperCase()}（你的分店: {me?.branch || '—'}）</div>
      ) : (
        <>
          {/* 筛选区（sticky，对齐 form-section） */}
          <div style={S.formSection}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{workDate === fmtDay(new Date()) ? '今天' : workDate}</div>
                <div style={{ fontSize: 12, color: C.muted }}>工作日期（出货记到这天）</div>
              </div>
              <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} style={S.dateInput} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.select}>
                <option value="">全部类型</option>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input style={S.input} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索货品 / 编号" />
            </div>
            <div style={S.statsInfo}>
              <span>共 <b style={{ color: C.text }}>{visible.length}</b> 项</span>
            </div>
          </div>

          {/* 卡片列表：改「剩余量」= 出货 */}
          {loading && <div style={S.msg}>加载中…</div>}
          {!loading && visible.length === 0 && <div style={S.msg}>没有找到产品</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(r => (
              <div key={r.id} style={S.card}>
                <div>
                  <div style={S.cardName}>{r.product_name}</div>
                  <div style={S.cardFooter}>
                    {r.code_number && <span style={S.meta}>{r.code_number}</span>}
                    {r.code_number && <span style={S.sep}>|</span>}
                    <span style={S.meta}>{r.specification || '—'}</span>
                    <span style={S.sep}>|</span>
                    <span style={S.meta}>{r.type || '—'}</span>
                  </div>
                </div>
                <div style={S.qtyGroup}>
                  {r.editing ? (
                    <input type="number" inputMode="decimal" step="0.001" style={{ ...S.qtyInput, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 8px' }}
                      value={r.draft ?? ''} onChange={e => setDraft(r.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRecord(r.id); if (e.key === 'Escape') cancelEdit(r.id) }} autoFocus />
                  ) : (
                    <div style={S.qty}>{qtyText(Number(r.total_qty))}</div>
                  )}
                </div>
                <div style={S.actions}>
                  {r.editing ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => saveRecord(r.id)} disabled={savingId === r.id} style={{ ...S.editBtn, background: C.success, color: '#fff', fontSize: 14 }} title="保存出货">
                        {savingId === r.id ? '…' : '✓'}
                      </button>
                      <button onClick={() => cancelEdit(r.id)} style={{ ...S.editBtn, fontSize: 14 }} title="取消">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r.id)} style={S.editBtn} title="改剩余量出货">✎</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
            点 ✎ 把数量改成<b>出货后的剩余量</b> → ✓ 保存即出货<br />
            系统自动按价格从高到低分层扣货，记入正式台账
          </div>
        </>
      )}
    </div>
  )
}

// ---------- 内联样式（对齐旧版 /mobile/ch/css/stocklist.css 设计语言） ----------
const S: Record<string, React.CSSProperties> = {
  page: {
    width: '100%', maxWidth: 480, margin: '0 auto', background: C.bodyBg,
    minHeight: '100dvh', boxSizing: 'border-box',
    padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(48px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
    display: 'flex', flexDirection: 'column',
  },
  pageHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  h1: { flex: 1, fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 700, margin: 0, letterSpacing: '0.02em', color: C.text, minWidth: 0 },
  iconBtn: {
    width: 42, height: 42, border: 'none', borderRadius: 12, background: C.primary,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#fff', fontSize: 18, textDecoration: 'none', flexShrink: 0,
  },
  segBtn: {
    height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`,
    background: C.white, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  segBtnOn: { background: C.primary, borderColor: C.primary, color: '#fff' },
  formSection: {
    position: 'sticky', top: 0, zIndex: 20, padding: '12px 0 14px', margin: '0 0 10px',
    background: C.bodyBg, borderBottom: `1px solid ${C.border}`, boxShadow: '0 8px 16px rgba(44,44,44,.06)',
  },
  dateInput: {
    height: 40, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: '0 10px', fontSize: 14, background: C.white, color: C.text,
  },
  select: {
    width: 140, height: 48, border: `1px solid ${C.border}`, borderRadius: 14,
    background: C.white, fontSize: 15, color: C.text, padding: '0 12px', flexShrink: 0, outline: 'none',
  },
  input: {
    flex: 1, width: '100%', boxSizing: 'border-box', height: 48, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: '0 16px', fontSize: 16, background: C.white, color: C.text, outline: 'none', minWidth: 0,
  },
  statsInfo: { display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 13, color: C.muted },
  card: {
    display: 'grid', gridTemplateColumns: '1fr auto auto',
    alignItems: 'center', gap: 12, background: C.white,
    border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px',
    boxShadow: '0 2px 8px rgba(44,44,44,.04)',
  },
  cardName: { fontSize: 15, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word', color: C.text },
  cardFooter: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 13, color: C.muted, marginTop: 4 },
  meta: { lineHeight: 1.3, wordBreak: 'break-word' },
  sep: { color: 'rgba(122,115,107,.45)' },
  qtyGroup: { display: 'inline-flex', alignItems: 'center' },
  qty: { fontSize: 17, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' },
  qtyInput: { width: 88, fontSize: 15, fontWeight: 600, textAlign: 'center', color: C.text, fontVariantNumeric: 'tabular-nums', outline: 'none' },
  actions: { display: 'flex', alignItems: 'center' },
  editBtn: {
    width: 40, height: 40, minWidth: 40, border: 'none', borderRadius: 10,
    background: 'rgba(244,239,228,.9)', color: C.text,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15,
  },
  msg: { textAlign: 'center', color: C.muted, fontSize: 13, padding: '36px 0' },
}
