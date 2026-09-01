import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getMobileRecords, createMobileRecord, updateMobileRecord, deleteMobileRecord,
  getMobilePriceTiers, getMobileProductOptions, getMobileTotals,
  type MobileRecord, type MobilePriceTier, type MobileProductOption, type MobileTotalRow,
} from '../api/mobile'
import { showToast } from '../utils/toast'

/**
 * 手机版进出货（对齐旧系统 /jX/jXstockeditmobile.php）
 * 竖屏单页：日视图记录 + 新增/编辑/删除 + 总库存视图；数据流走 /api/stock/mobile/*（四步同步）
 */

const SYSTEMS = [
  { key: 'j1', label: 'J1' },
  { key: 'j2', label: 'J2' },
  { key: 'j3', label: 'J3' },
]

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

  // ---- 表单：货品选择 → 拉价格层 ----
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
    setSheet({
      mode: 'edit', id: r.id,
      kind: Number(r.in_quantity) > 0 ? 'in' : 'out',
      productName: r.product_name, codeNumber: r.code_number || '',
      specification: r.specification || '', type: r.type || '',
      qty: qtyText(Number(r.in_quantity) > 0 ? r.in_quantity : r.out_quantity),
      receiver: r.receiver || '', date: r.date, time: (r.time || '').slice(0, 5),
      price: r.out_quantity > 0 ? Number(r.price ?? 0) || null : null,
    } as SheetForm)
    if (Number(r.out_quantity) > 0) {
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

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', minHeight: '100vh', background: '#faf7f2', paddingBottom: 88 }}>
      {/* 顶部 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'linear-gradient(135deg, #ff5c00, #ff9248)', color: '#fff', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(`/records?system=${system}`)} style={h.btnGhost}>←</button>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>手机进出货 · {system.toUpperCase()}</div>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,.25)', borderRadius: 8, overflow: 'hidden' }}>
            {(['records', 'totals'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ ...h.viewBtn, background: view === v ? '#fff' : 'transparent', color: view === v ? '#ff5c00' : '#fff' }}>
                {v === 'records' ? '进出货' : '总库存'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          {SYSTEMS.map(s => (
            <button key={s.key} onClick={() => navigate(`/m/inout?system=${s.key}`)}
              style={{ ...h.sysTab, background: system === s.key ? '#fff' : 'transparent', color: system === s.key ? '#ff5c00' : '#fff' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'records' && (
        <>
          {/* 日期栏 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', position: 'sticky', top: 88, zIndex: 19, background: '#faf7f2' }}>
            <button onClick={() => shiftDate(-1)} style={h.dayBtn}>‹</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={h.dateInput} />
            <button onClick={() => shiftDate(1)} style={h.dayBtn}>›</button>
            <button onClick={() => setDate(fmtDay(new Date()))} style={h.todayBtn}>今天</button>
          </div>
          {/* 记录列表 */}
          {loading && <div style={h.empty}>加载中…</div>}
          {!loading && records.length === 0 && <div style={h.empty}>这一天没有记录</div>}
          {records.map(r => {
            const isIn = Number(r.in_quantity) > 0
            return (
              <div key={r.id} style={h.card} onClick={() => openEdit(r)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>
                    {r.product_name}
                    {r.code_number ? <span style={{ color: '#999', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{r.code_number}</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>
                    {r.specification || '-'} · {r.type || '-'} · {(r.time || '').slice(0, 5)}
                    {r.receiver ? ` · ${r.receiver}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: isIn ? '#16a34a' : '#dc2626' }}>
                    {isIn ? '+' : '−'}{qtyText(isIn ? r.in_quantity : r.out_quantity)}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>{isIn ? '进货' : '出货'}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); remove(r) }} style={h.delBtn} title="删除">✕</button>
              </div>
            )
          })}
          {/* 新增 FAB */}
          <button onClick={openCreate} style={h.fab} aria-label="新增">＋</button>
        </>
      )}

      {view === 'totals' && (
        <div style={{ padding: '10px 14px' }}>
          <input value={totalSearch} onChange={e => setTotalSearch(e.target.value)} placeholder="搜索货品 / 编号" style={h.search} />
          {loading && <div style={h.empty}>加载中…</div>}
          {!loading && totalsFiltered.length === 0 && <div style={h.empty}>没有匹配的货品</div>}
          {totalsFiltered.map(t => (
            <div key={t.id} style={h.card}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>
                  {t.product_name}
                  {t.code_number ? <span style={{ color: '#999', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{t.code_number}</span> : null}
                </div>
                <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>{t.specification || '-'}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: Number(t.total_qty) < 0 ? '#dc2626' : '#111' }}>
                {qtyText(Number(t.total_qty))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑抽屉 */}
      {sheet && (
        <div style={h.overlay} onClick={() => setSheet(null)}>
          <div style={h.sheet} onClick={e => e.stopPropagation()}>
            <div style={h.sheetTitle}>{sheet.mode === 'create' ? '新增记录' : '编辑记录'} · {system.toUpperCase()}</div>
            {/* 类型 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['in', 'out'] as const).map(k => (
                <button key={k} onClick={() => switchKind(k)}
                  style={{ ...h.kindBtn, background: sheet.kind === k ? '#ff5c00' : '#fff', color: sheet.kind === k ? '#fff' : '#666' }}>
                  {k === 'in' ? '进货' : '出货'}
                </button>
              ))}
            </div>
            {/* 货品（编辑模式锁定） */}
            <label style={h.lb}>货品 *</label>
            {sheet.mode === 'edit' ? (
              <div style={{ ...h.input, background: '#f5f5f5' }}>{sheet.productName}{sheet.codeNumber ? ` · ${sheet.codeNumber}` : ''}</div>
            ) : (
              <>
                <input style={h.input} value={productQuery} placeholder="输入货品名或编号搜索"
                  onChange={e => { setProductQuery(e.target.value); setShowProductList(true) }}
                  onFocus={() => setShowProductList(true)} />
                {showProductList && filteredOptions.length > 0 && (
                  <div style={h.optList}>
                    {filteredOptions.map(o => (
                      <div key={o.product_name + (o.product_code || '')} style={h.optItem}
                        onClick={() => pickProduct(o)}>
                        <b style={{ fontSize: 13 }}>{o.product_name}</b>
                        <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>{o.product_code} {o.specification || ''} {o.category || ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {/* 出货价格层 */}
            {sheet.kind === 'out' && (
              <>
                <label style={h.lb}>价格层（可用量）*</label>
                {tiersLoading && <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>加载中…</div>}
                {!tiersLoading && tiers.length === 0 && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>该货品无可用库存</div>}
                <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 4 }}>
                  {tiers.map(t => {
                    const avail = Number(t.available)
                    const disabled = avail <= 0
                    const selected = sheet.price != null && Number(t.price) === sheet.price
                    return (
                      <div key={String(t.price)} onClick={() => !disabled && setSheet(s => s && { ...s, price: Number(t.price) })}
                        style={{ ...h.tier, borderColor: selected ? '#ff5c00' : '#eee', background: selected ? '#fff3e8' : '#fff', opacity: disabled ? .5 : 1 }}>
                        <b>RM {Number(t.price).toFixed(2)}</b>
                        <span style={{ color: disabled ? '#dc2626' : '#16a34a', marginLeft: 8, fontSize: 12 }}>
                          可用 {avail} {avail < 0 ? '（已超扣）' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            {/* 数量/收货人 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={h.lb}>{sheet.kind === 'in' ? '进货数量' : '出货数量'} *</label>
                <input type="number" inputMode="decimal" step="0.001" style={h.input} value={sheet.qty}
                  onChange={e => setSheet(s => s && { ...s, qty: e.target.value })} placeholder="0" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={h.lb}>收货人</label>
                <input style={h.input} value={sheet.receiver} onChange={e => setSheet(s => s && { ...s, receiver: e.target.value })} />
              </div>
            </div>
            {/* 日期/时间 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={h.lb}>日期 *</label>
                <input type="date" style={h.input} value={sheet.date} onChange={e => setSheet(s => s && { ...s, date: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={h.lb}>时间 *</label>
                <input type="time" style={h.input} value={sheet.time} onChange={e => setSheet(s => s && { ...s, time: e.target.value })} />
              </div>
            </div>
            <button onClick={submit} disabled={busy} style={h.submit}>{busy ? '保存中…' : '保 存'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- 内联样式 ----------
const h: Record<string, React.CSSProperties> = {
  btnGhost: { background: 'rgba(255,255,255,.25)', border: 'none', color: '#fff', fontSize: 18, width: 34, height: 34, borderRadius: 8, cursor: 'pointer' },
  viewBtn: { border: 'none', padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  sysTab: { border: '1px solid rgba(255,255,255,.6)', borderRadius: 8, padding: '4px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent' },
  dayBtn: { width: 36, height: 36, borderRadius: 8, border: '1px solid #e5e5e5', background: '#fff', fontSize: 18, cursor: 'pointer' },
  dateInput: { flex: 1, height: 36, border: '1px solid #e5e5e5', borderRadius: 8, padding: '0 10px', fontSize: 14, textAlign: 'center' },
  todayBtn: { height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #ff5c00', background: '#fff', color: '#ff5c00', fontWeight: 600, cursor: 'pointer' },
  empty: { textAlign: 'center', color: '#999', fontSize: 13, padding: '40px 0' },
  card: { display: 'flex', alignItems: 'center', gap: 10, margin: '0 14px 8px', padding: '10px 12px', background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.06)', cursor: 'pointer' },
  delBtn: { border: 'none', background: '#fee2e2', color: '#dc2626', width: 26, height: 26, borderRadius: '50%', fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  fab: { position: 'fixed', right: 18, bottom: 24, width: 56, height: 56, borderRadius: '50%', border: 'none', background: '#ff5c00', color: '#fff', fontSize: 30, boxShadow: '0 4px 14px rgba(255,92,0,.45)', cursor: 'pointer', zIndex: 30 },
  search: { width: '100%', boxSizing: 'border-box', height: 38, border: '1px solid #e5e5e5', borderRadius: 8, padding: '0 12px', fontSize: 14, marginBottom: 10 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 720, background: '#fff', borderRadius: '16px 16px 0 0', padding: '16px 16px 28px', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' },
  sheetTitle: { fontWeight: 700, fontSize: 16, marginBottom: 14, color: '#111' },
  kindBtn: { flex: 1, height: 40, borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  lb: { display: 'block', fontSize: 12, color: '#666', margin: '10px 0 4px' },
  input: { width: '100%', boxSizing: 'border-box', height: 40, border: '1px solid #ddd', borderRadius: 8, padding: '0 10px', fontSize: 14 },
  optList: { position: 'relative', maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e5e5', borderRadius: 8, marginTop: 4, background: '#fff' },
  optItem: { padding: '8px 10px', borderBottom: '1px solid #f2f2f2', cursor: 'pointer' },
  tier: { display: 'flex', alignItems: 'center', padding: '8px 10px', border: '1px solid #eee', borderRadius: 8, marginBottom: 6, cursor: 'pointer', fontSize: 14 },
  submit: { width: '100%', height: 44, marginTop: 16, border: 'none', borderRadius: 10, background: '#ff5c00', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
}
