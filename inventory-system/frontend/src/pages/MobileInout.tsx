import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getMobileRecords, createMobileRecord, updateMobileRecord, deleteMobileRecord,
  getMobilePriceTiers, getMobileProductOptions, getMobileTotals,
  type MobileRecord, type MobilePriceTier, type MobileProductOption, type MobileTotalRow,
} from '../api/mobile'
import { showToast } from '../utils/toast'

/**
 * 手机版进出货（对齐旧系统 /mobile/ch/ 手机应用的设计语言）
 * 设计 tokens：--body-bg #f4f7f2 / --card #fdf9f1 / --primary #f7931e / --border #d8d0c5
 * 480px 竖屏布局 + 48px 大控件（radius 14）+ 卡片化列表（grid: name+action / footer+action）
 */

const SYSTEMS = [
  { key: 'j1', label: 'J1' },
  { key: 'j2', label: 'J2' },
  { key: 'j3', label: 'J3' },
]

const C = {
  bodyBg: '#f4f7f2', cardBg: '#fdf9f1', text: '#2f2a24', muted: '#7a736b',
  border: '#d8d0c5', primary: '#f7931e', primaryHover: '#ff5c00', success: '#2aa745',
  danger: '#ef4444', white: '#ffffff',
}
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif'

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const qtyText = (n?: number) => (n == null ? '0' : String(Number(n)))

interface SheetForm {
  mode: 'create' | 'edit'
  id?: number
  kind: 'in' | 'out'
  productName: string
  codeNumber: string
  specification: string
  type: string
  qty: string
  receiver: string
  date: string
  time: string
  price: number | null
}

export default function MobileInout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const system = useMemo(() => {
    const s = (searchParams.get('system') || 'j1').toLowerCase()
    return SYSTEMS.some(x => x.key === s) ? s : 'j1'
  }, [searchParams])

  const [view, setView] = useState<'records' | 'totals'>('records')
  const [date, setDate] = useState(fmtDay(new Date()))
  const [records, setRecords] = useState<MobileRecord[]>([])
  const [totals, setTotals] = useState<MobileTotalRow[]>([])
  const [totalSearch, setTotalSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const [options, setOptions] = useState<MobileProductOption[]>([])
  const [sheet, setSheet] = useState<SheetForm | null>(null)
  const [tiers, setTiers] = useState<MobilePriceTier[]>([])
  const [tiersLoading, setTiersLoading] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [showProductList, setShowProductList] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      setRecords(await getMobileRecords(system, date, date))
    } catch { /* 拦截器已提示 */ }
    setLoading(false)
  }, [system, date])

  const loadTotals = useCallback(async () => {
    setLoading(true)
    try {
      setTotals(await getMobileTotals(system))
    } catch { /* 拦截器已提示 */ }
    setLoading(false)
  }, [system])

  useEffect(() => { if (view === 'records') loadRecords(); else loadTotals() }, [view, loadRecords, loadTotals])
  useEffect(() => { getMobileProductOptions().then(setOptions).catch(() => {}) }, [])

  const shiftDate = (days: number) => {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setDate(fmtDay(d))
  }

  const openCreate = () => {
    setProductQuery('')
    setShowProductList(false)
    setTiers([])
    setSheet({
      mode: 'create', kind: 'in', productName: '', codeNumber: '', specification: '', type: '',
      qty: '', receiver: '', date, time: nowTime(), price: null,
    })
  }

  const openEdit = async (r: MobileRecord) => {
    setProductQuery(r.product_name)
    setShowProductList(false)
    setTiers([])
    const isOut = Number(r.out_quantity) > 0
    setSheet({
      mode: 'edit', id: r.id,
      kind: Number(r.in_quantity) > 0 ? 'in' : 'out',
      productName: r.product_name, codeNumber: r.code_number || '',
      specification: r.specification || '', type: r.type || '',
      qty: qtyText(isOut ? r.out_quantity : r.in_quantity),
      receiver: r.receiver || '', date: r.date, time: (r.time || '').slice(0, 5),
      price: isOut ? (Number(r.price) || null) : null,
    })
    if (isOut) {
      try { setTiers(await getMobilePriceTiers(system, r.product_name, r.code_number || '')) } catch { /* 忽略 */ }
    }
  }

  const pickProduct = async (o: MobileProductOption) => {
    if (!sheet) return
    setSheet({ ...sheet, productName: o.product_name, codeNumber: o.product_code || '', specification: o.specification || '', type: o.category || '' })
    setProductQuery(o.product_name)
    setShowProductList(false)
    setTiers([])
    if (sheet.kind === 'out') {
      setTiersLoading(true)
      try { setTiers(await getMobilePriceTiers(system, o.product_name, o.product_code || '')) } catch { /* 忽略 */ }
      setTiersLoading(false)
    }
  }

  const switchKind = async (kind: 'in' | 'out') => {
    if (!sheet) return
    setSheet({ ...sheet, kind, price: null })
    if (kind === 'out' && sheet.productName) {
      setTiersLoading(true)
      try { setTiers(await getMobilePriceTiers(system, sheet.productName, sheet.codeNumber)) } catch { /* 忽略 */ }
      setTiersLoading(false)
    }
  }

  const submit = async () => {
    if (!sheet || busy) return
    const qty = Number(sheet.qty)
    if (!sheet.productName) { showToast('请选择货品', 'error'); return }
    if (!sheet.qty || Number.isNaN(qty) || qty <= 0) { showToast('请填写数量', 'error'); return }
    if (sheet.kind === 'out' && !tiers.some(t => Number(t.available) > 0)) {
      showToast('该货品无可用库存，无法出货', 'error'); return
    }
    if (sheet.kind === 'out' && sheet.price == null) { showToast('出货请选择价格层', 'error'); return }
    setBusy(true)
    const payload = {
      system, date: sheet.date, time: sheet.time,
      productName: sheet.productName, codeNumber: sheet.codeNumber || undefined,
      specification: sheet.specification || undefined, type: sheet.type || undefined,
      inQuantity: sheet.kind === 'in' ? qty : 0,
      outQuantity: sheet.kind === 'out' ? qty : 0,
      receiver: sheet.receiver || undefined,
      price: sheet.kind === 'out' ? (sheet.price ?? undefined) : undefined,
    }
    try {
      if (sheet.mode === 'create') await createMobileRecord(payload)
      else if (sheet.id) await updateMobileRecord(sheet.id, payload)
      showToast(sheet.mode === 'create' ? '记录已保存' : '记录已更新', 'success')
      setSheet(null)
      await loadRecords()
    } catch { /* 拦截器已提示 */ }
    setBusy(false)
  }

  const remove = async (r: MobileRecord) => {
    if (!window.confirm(`删除 ${r.product_name} 这条记录？\n（将同步删除正式台账中的关联行）`)) return
    try {
      await deleteMobileRecord(r.id, system)
      showToast('已删除', 'success')
      await loadRecords()
    } catch { /* 拦截器已提示 */ }
  }

  const filteredOptions = productQuery.trim()
    ? options.filter(o =>
        (o.product_name || '').toLowerCase().includes(productQuery.toLowerCase()) ||
        (o.product_code || '').toLowerCase().includes(productQuery.toLowerCase()))
      .slice(0, 30)
    : []

  const totalsFiltered = totalSearch.trim()
    ? totals.filter(t =>
        (t.product_name || '').toLowerCase().includes(totalSearch.toLowerCase()) ||
        (t.code_number || '').toLowerCase().includes(totalSearch.toLowerCase()))
    : totals

  const dayLabel = useMemo(() => {
    const today = fmtDay(new Date())
    if (date === today) return '今天'
    const d = new Date(date + 'T00:00:00')
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
    return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 · ${wd}`
  }, [date])

  return (
    <div style={{ ...S.page, fontFamily: FONT }}>
      {/* 页头（对齐旧版：标题 + 橙色方形圆角按钮） */}
      <div style={S.pageHeader}>
        <button onClick={() => navigate(`/records?system=${system}`)} style={S.iconBtn} title="返回桌面版">←</button>
        <h1 style={S.h1}>进出货 · {system.toUpperCase()}</h1>
        <button onClick={() => navigate('/records')} style={{ ...S.iconBtn, fontSize: 12, fontWeight: 600 }}>桌面</button>
      </div>

      {/* 视图切换 + 分店 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          {(['records', 'totals'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ ...S.segBtn, ...(view === v ? S.segBtnOn : {}) }}>
              {v === 'records' ? '进出货记录' : '总库存'}
            </button>
          ))}
        </div>
        {SYSTEMS.map(s => (
          <button key={s.key} onClick={() => navigate(`/m/inout?system=${s.key}`)}
            style={{ ...S.segBtn, minWidth: 44, ...(system === s.key ? S.segBtnOn : {}) }}>
            {s.label}
          </button>
        ))}
      </div>

      {view === 'records' && (
        <>
          {/* 日期栏（对齐 calendar-button 42px 橙色方块） */}
          <div style={S.formSection}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => shiftDate(-1)} style={S.calBtn}>‹</button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{date}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{dayLabel}</div>
              </div>
              <button onClick={() => shiftDate(1)} style={S.calBtn}>›</button>
              <button onClick={() => setDate(fmtDay(new Date()))} style={S.calBtn}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>今</span>
              </button>
            </div>
          </div>
          {/* 记录卡片列表 */}
          {loading && <div style={S.msg}>加载中…</div>}
          {!loading && records.length === 0 && <div style={S.msg}>这一天没有记录</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.map(r => {
              const isIn = Number(r.in_quantity) > 0
              return (
                <div key={r.id} style={S.card} onClick={() => openEdit(r)}>
                  <div style={S.cardName}>
                    {r.product_name}
                    {r.code_number ? <span style={S.cardMeta}> · {r.code_number}</span> : null}
                  </div>
                  <div style={S.cardFooter}>
                    <span style={S.meta}>{r.specification || '—'}</span>
                    <span style={S.sep}>|</span>
                    <span style={S.meta}>{(r.time || '').slice(0, 5)}</span>
                    {r.receiver && (<><span style={S.sep}>|</span><span style={S.meta}>{r.receiver}</span></>)}
                  </div>
                  <div style={S.cardAction}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: isIn ? C.success : C.danger, fontVariantNumeric: 'tabular-nums' }}>
                      {isIn ? '+' : '−'}{qtyText(isIn ? r.in_quantity : r.out_quantity)}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{isIn ? '进货' : '出货'}</div>
                    <button onClick={e => { e.stopPropagation(); remove(r) }} style={S.miniBtn} title="删除">✕</button>
                  </div>
                </div>
              )
            })}
          </div>
          {/* 新增 FAB */}
          <button onClick={openCreate} style={S.fab} aria-label="新增">＋</button>
        </>
      )}

      {view === 'totals' && (
        <>
          <div style={S.formSection}>
            <div style={S.inputGroup}>
              <input style={S.input} value={totalSearch} onChange={e => setTotalSearch(e.target.value)} placeholder="搜索货品 / 编号" />
            </div>
          </div>
          {loading && <div style={S.msg}>加载中…</div>}
          {!loading && totalsFiltered.length === 0 && <div style={S.msg}>没有匹配的货品</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {totalsFiltered.map(t => (
              <div key={t.id} style={S.card}>
                <div>
                  <div style={S.cardName}>{t.product_name}</div>
                  <div style={S.cardFooter}>
                    {t.code_number && <span style={S.meta}>{t.code_number}</span>}
                    {t.code_number && <span style={S.sep}>|</span>}
                    <span style={S.meta}>{t.specification || '—'}</span>
                  </div>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: Number(t.total_qty) < 0 ? C.danger : C.text, fontVariantNumeric: 'tabular-nums', alignSelf: 'center' }}>
                  {qtyText(Number(t.total_qty))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 新增/编辑抽屉 */}
      {sheet && (
        <div style={S.overlay} onClick={() => setSheet(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetTitle}>{sheet.mode === 'create' ? '新增记录' : '编辑记录'}</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
              {(['in', 'out'] as const).map(k => (
                <button key={k} onClick={() => switchKind(k)}
                  style={{ ...S.btn, flex: 1, background: sheet.kind === k ? C.primary : C.white, color: sheet.kind === k ? '#fff' : C.muted, border: `1px solid ${sheet.kind === k ? C.primary : C.border}` }}>
                  {k === 'in' ? '进货' : '出货'}
                </button>
              ))}
            </div>
            <label style={S.lb}>货品 *</label>
            {sheet.mode === 'edit' ? (
              <div style={{ ...S.input, background: '#fff' }}>{sheet.productName}{sheet.codeNumber ? ` · ${sheet.codeNumber}` : ''}</div>
            ) : (
              <>
                <input style={S.input} value={productQuery} placeholder="输入货品名或编号搜索"
                  onChange={e => { setProductQuery(e.target.value); setShowProductList(true) }}
                  onFocus={() => setShowProductList(true)} />
                {showProductList && filteredOptions.length > 0 && (
                  <div style={S.optList}>
                    {filteredOptions.map(o => (
                      <div key={o.product_name + (o.product_code || '')} style={S.optItem} onClick={() => pickProduct(o)}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{o.product_name}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>{o.product_code} {o.specification || ''} {o.category || ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {sheet.kind === 'out' && (
              <>
                <label style={S.lb}>价格层（可用量）*</label>
                {tiersLoading && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>加载中…</div>}
                {!tiersLoading && tiers.length === 0 && <div style={{ fontSize: 13, color: C.danger, marginBottom: 8 }}>该货品无可用库存</div>}
                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tiers.map(t => {
                    const avail = Number(t.available)
                    const disabled = avail <= 0
                    const selected = sheet.price != null && Number(t.price) === sheet.price
                    return (
                      <div key={String(t.price)} onClick={() => !disabled && setSheet(s => s && { ...s, price: Number(t.price) })}
                        style={{ ...S.tier, borderColor: selected ? C.primary : C.border, background: selected ? '#fff' : C.white, opacity: disabled ? .55 : 1 }}>
                        <b style={{ color: C.text }}>RM {Number(t.price).toFixed(2)}</b>
                        <span style={{ color: disabled ? C.danger : C.success, marginLeft: 'auto', fontSize: 13 }}>
                          可用 {avail}{avail < 0 ? '（已超扣）' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            <div style={S.row2}>
              <div style={{ flex: 1 }}>
                <label style={S.lb}>{sheet.kind === 'in' ? '进货数量' : '出货数量'} *</label>
                <input type="number" inputMode="decimal" step="0.001" style={S.input} value={sheet.qty}
                  onChange={e => setSheet(s => s && { ...s, qty: e.target.value })} placeholder="0" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.lb}>收货人</label>
                <input style={S.input} value={sheet.receiver} onChange={e => setSheet(s => s && { ...s, receiver: e.target.value })} />
              </div>
            </div>
            <div style={S.row2}>
              <div style={{ flex: 1 }}>
                <label style={S.lb}>日期 *</label>
                <input type="date" style={S.input} value={sheet.date} onChange={e => setSheet(s => s && { ...s, date: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.lb}>时间 *</label>
                <input type="time" style={S.input} value={sheet.time} onChange={e => setSheet(s => s && { ...s, time: e.target.value })} />
              </div>
            </div>
            <button onClick={submit} disabled={busy} style={{ ...S.btn, width: '100%', marginTop: 18, background: C.primary }}>
              {busy ? '保存中…' : '保 存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- 内联样式（对齐旧版 /mobile/ch/css/stocklist.css 设计语言） ----------
const S: Record<string, React.CSSProperties> = {
  page: {
    width: '100%', maxWidth: 480, margin: '0 auto', background: C.bodyBg,
    minHeight: '100dvh', boxSizing: 'border-box',
    padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(88px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
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
  calBtn: {
    width: 42, height: 42, border: 'none', borderRadius: 12, background: C.primary,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#fff', fontSize: 20, padding: 0, flexShrink: 0,
  },
  card: {
    display: 'grid', gridTemplateColumns: '1fr auto', gridTemplateAreas: '"name action" "footer action"',
    gap: '8px 12px', alignItems: 'center', background: C.white,
    border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px',
    boxShadow: '0 2px 8px rgba(44,44,44,.04)', cursor: 'pointer',
  },
  cardName: { gridArea: 'name', fontSize: 15, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word', color: C.text },
  cardFooter: { gridArea: 'footer', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 13, color: C.muted },
  meta: { lineHeight: 1.3, wordBreak: 'break-word' },
  sep: { color: 'rgba(122,115,107,.45)' },
  cardAction: { gridArea: 'action', gridRow: '1 / -1', alignSelf: 'center', justifySelf: 'center', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  miniBtn: { border: 'none', background: 'rgba(244,239,228,.9)', color: C.muted, width: 28, height: 28, borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  fab: {
    position: 'fixed', right: 18, bottom: 'max(18px, env(safe-area-inset-bottom))',
    width: 56, height: 56, borderRadius: '50%', border: 'none', background: C.primary,
    color: '#fff', fontSize: 30, boxShadow: '0 4px 14px rgba(247,147,30,.5)', cursor: 'pointer', zIndex: 30,
  },
  msg: { textAlign: 'center', color: C.muted, fontSize: 13, padding: '36px 0' },
  inputGroup: { display: 'flex', alignItems: 'stretch' },
  input: {
    width: '100%', boxSizing: 'border-box', height: 48, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: '0 16px', fontSize: 16, background: C.white, color: C.text, outline: 'none',
  },
  optList: { position: 'relative', maxHeight: 200, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 14, marginTop: 4, background: C.white },
  optItem: { padding: '10px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' },
  tier: { display: 'flex', alignItems: 'center', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 14, cursor: 'pointer', fontSize: 15 },
  row2: { display: 'flex', gap: 10 },
  lb: { display: 'block', fontSize: 13, fontWeight: 500, color: C.muted, margin: '12px 0 6px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 },
  sheet: {
    width: '100%', maxWidth: 480, background: C.cardBg, borderRadius: '16px 16px 0 0',
    padding: '20px 16px max(20px, env(safe-area-inset-bottom))', boxSizing: 'border-box',
    maxHeight: '88vh', overflowY: 'auto', border: `1px solid ${C.border}`, boxShadow: '0 20px 40px rgba(0,0,0,.15)',
  },
  sheetTitle: { fontWeight: 600, fontSize: 18, marginBottom: 14, color: C.text },
  btn: {
    height: 48, padding: '0 16px', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600,
    color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
}
