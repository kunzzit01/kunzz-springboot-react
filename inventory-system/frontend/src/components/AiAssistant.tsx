import { useEffect, useRef, useState } from 'react'
import { askAi, parseOrder, type AiDraft } from '../api/ai'
import { createStockInout } from '../api'
import { isAiVisible, onAiVisibleChange } from '../utils/aiAssistantStore'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 本地 AI 助手聊天球（挂在进出货页面）
 * 聊天球可拖拽到任意位置，位置自动记忆（localStorage）；面板智能贴合球体避免遮挡
 * 链路：本组件 → /api/ai/chat → 后端 AiService → 本地 Ollama（零费用）
 * 查询问答 + 进出货草稿（AI 生成草稿 → 用户确认 → 走原有 createStockInout 接口）
 */
const POS_KEY = 'ai-ball-pos-v1'
const BALL = 56
function clampPos(x: number, y: number) {
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - BALL - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - BALL - 8)),
  }
}
function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p?.x === 'number' && typeof p?.y === 'number') return clampPos(p.x, p.y)
    }
  } catch { /* 忽略 */ }
  // 默认右下角
  return clampPos(window.innerWidth - BALL - 28, window.innerHeight - BALL - 28)
}
export default function AiAssistant({ system, onSaved }: { system?: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: '你好！我是库存 AI 助手 🤖\n可以问我："apple sauce 还有多少"、"哪些货低于最低库存"，\n也可以直接吩咐："帮我进货 apple sauce 2 件"（生成草稿，你确认后才会执行）。',
    },
  ])
  const [drafts, setDrafts] = useState<AiDraft[]>([])
  const [draftBusy, setDraftBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // ---- 聊天球拖拽 + 位置记忆 ----
  const [pos, setPos] = useState(loadPos)
  const posRef = useRef(pos)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const onResize = () => {
      const p = clampPos(posRef.current.x, posRef.current.y)
      posRef.current = p
      setPos(p)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const onBallPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onBallPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    // 位移 <6px 视为点击而非拖动（避免误触）
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    if (!d.moved) { d.moved = true; setDragging(true) }
    const p = clampPos(d.ox + dx, d.oy + dy)
    posRef.current = p
    setPos(p)
  }
  const onBallPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!d) return
    if (d.moved) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)) } catch { /* 忽略 */ }
    } else {
      setOpen(true) // 未拖动 = 点击 → 打开面板
    }
  }

  // 显示开关（侧边栏底部可切换；关掉后整个组件不渲染）
  const [visible, setVisible] = useState(isAiVisible)
  useEffect(() => onAiVisibleChange(setVisible), [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    // 「确认执行」意图：有草稿直接执行，没草稿则提示先贴订单（不再抛回给模型）
    if (/^(确认执行|确认|执行|confirm|ok)$/i.test(text.trim())) {
      setLoading(false)
      if (drafts.length) { confirmAll() }
      else setMessages(m => [...m, { role: 'assistant', content: '当前没有待确认的草稿卡片。请先粘贴订单（如：udon-2 nama panko -2 tanaka sake-2 ...），解析出草稿后再点「确认执行全部」或在对话里发“确认执行”。' }])
      return
    }
    // 订单检测：多行行式 或 单行分段式（"udon-2 nama panko -2 ..."）→ 走确定性解析（毫秒级，不耗本地模型）
    const looksLikeOrder = (() => {
      const cleaned = text.replace(/\bJ[123]\b/gi, ' ').replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ')
      const segs = cleaned.match(/[A-Za-z0-9][A-Za-z0-9 .'/&()\\-]*?\s*[-*xX×]\s*\d+(?:\.\d+)?/g)
      if (segs && segs.length >= 2) return true
      const ls = text.split('\n').map(s => s.trim()).filter(Boolean)
      if (ls.length < 2) return false
      let hits = 0
      for (const l of ls) {
        const low = l.toLowerCase()
        if (/^(date|kitchen|sushi\s*bar|service\s*line|extra\s*add)/.test(low)) continue
        if (/\d+(?:\.\d+)?\s*(kg|kilo|pcs|pieces|units|pkt|btl)?\s*$/i.test(l) && /[a-zA-Z]/.test(l)) hits++
        else if (/^\d{1,2}[.、)]/.test(l) && /[a-zA-Z]/.test(l)) hits++
      }
      return hits >= 2
    })()
    if (looksLikeOrder) {
      try {
        const res = await parseOrder(text, system)
        if (res && ((res.drafts?.length ?? 0) > 0 || (res.unmatched?.length ?? 0) > 0)) {
          const parts = [`📋 订单解析完成：匹配 ${res.drafts?.length ?? 0} 条${res.orderDate ? `（日期 ${res.orderDate}）` : ''}`]
          if (res.unmatched?.length) parts.push(`❌ 未匹配 ${res.unmatched.length} 条：${res.unmatched.join('；')}`)
          if (res.drafts?.length) {
            setDrafts(res.drafts)
            parts.push('请核对卡片信息（可在卡片上改“送往”分店），点「确认执行全部」。')
          }
          setMessages([...next, { role: 'assistant', content: parts.join('\n') }])
          setLoading(false)
          return
        }
        // 解析不出 → 落回 AI 对话
      } catch { /* 落回 AI 对话 */ }
    }
    try {
      const res = await askAi(text, system)
      setMessages([...next, { role: 'assistant', content: res?.reply || '（空回复，请重试）' }])
      if (res?.drafts?.length) setDrafts(res.drafts)
    } catch (e: any) {
      const hint = e?.response?.status === 504 || e?.code === 'ECONNABORTED'
        ? '回复超时，本地模型可能仍在加载，请稍后重试'
        : e?.message || '请确认本地 Ollama 已启动'
      setMessages([...next, { role: 'assistant', content: '⚠️ 查询失败：' + hint }])
    } finally {
      setLoading(false)
    }
  }

  /** 修改草稿的送达分店（模型小不可靠，用户在卡片上直接选） */
  const updateDeliverTo = (i: number, v: string) => {
    setDrafts(ds => ds.map((d, j) => (j === i ? { ...d, deliverTo: v || null } : d)))
  }

  /** 确认执行全部草稿：逐条走原有 createStockInout 接口，汇总成功/失败 */
  const confirmAll = async () => {
    if (!drafts.length || draftBusy) return
    setDraftBusy(true)
    const fails: string[] = []
    let ok = 0
    for (const d of drafts) {
      try {
        const isIn = d.kind === 'in'
        await createStockInout({
          date: d.date || undefined,
          time: new Date().toTimeString().slice(0, 5),
          productName: d.productName,
          codeNumber: d.codeNumber || undefined,
          inQuantity: isIn ? d.inQuantity : undefined,
          outQuantity: !isIn ? d.outQuantity : undefined,
          specification: d.specification || undefined,
          price: d.price,
          receiver: d.receiver || undefined,
          remark: d.remark || undefined,
          type: d.type || undefined,
          needGenerateCode: isIn ? true : undefined,
          targetSystem: !isIn && d.system === 'central' && d.deliverTo
            ? d.deliverTo
            : (d.system === 'central' ? undefined : d.system),
        }, d.system === 'central' ? 'central' : d.system)
        ok++
      } catch (e: any) {
        fails.push(`${d.productName}：${e?.message || '失败'}`)
      }
    }
    setDrafts([])
    const lines = [`✅ 批量执行完成：成功 ${ok} 条${fails.length ? ` / 失败 ${fails.length} 条` : ''}`]
    fails.forEach(f => lines.push('⚠️ ' + f))
    lines.push('页面数据已刷新')
    setMessages(m => [...m, { role: 'assistant', content: lines.join('\n') }])
    onSaved?.()
    setDraftBusy(false)
  }

  // 被侧边栏开关隐藏 → 不渲染（ hook 已全部执行完毕，符合规则）
  if (!visible) return null

  // 面板贴合聊天球：球在右半屏→面板在球左侧；球靠下半屏→向上展开；始终完整在视口内
  const panelStyle = (() => {
    const W = 380, H = 520
    const vw = window.innerWidth, vh = window.innerHeight
    const onRight = pos.x > vw / 2
    let left = onRight ? pos.x - W - 12 : pos.x + BALL + 12
    left = Math.min(Math.max(8, left), Math.max(8, vw - W - 8))
    let top = pos.y > vh / 2 ? pos.y - H + BALL : pos.y + BALL + 12
    top = Math.min(Math.max(8, top), Math.max(8, vh - H - 8))
    return { ...S.panel, left, top, right: 'auto' as const, bottom: 'auto' as const, height: Math.min(H, vh - 16) }
  })()

  return (
    <>
      {!open && (
        <button
          style={{ ...S.ball, left: pos.x, top: pos.y, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
          onPointerDown={onBallPointerDown}
          onPointerMove={onBallPointerMove}
          onPointerUp={onBallPointerUp}
          onPointerCancel={onBallPointerUp}
          title="AI 助手（拖动可移到任意位置，点按打开）" aria-label="AI 助手"
        >
          🤖
        </button>
      )}
      {open && (
        <div style={panelStyle}>
          <div style={S.head}>
            <span>🤖 库存 AI 助手{system ? ` · ${system.toUpperCase()}` : ''}</span>
            <button style={S.close} onClick={() => setOpen(false)} aria-label="关闭">✕</button>
          </div>
          <div style={S.list} ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} style={{ ...S.row, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...(m.role === 'user' ? S.bubbleUser : S.bubbleAi), whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={S.row}>
                <div style={S.bubbleAi}>思考中…（本地模型首次回答可能需要较长时间）</div>
              </div>
            )}
            {drafts.length > 0 && (
              <div style={S.draftCard}>
                <div style={S.draftTitle}>
                  📝 订单草稿 {drafts.length} 条（需确认后才执行）
                </div>
                {drafts.map((d, i) => (
                  <div key={i} style={S.draftItem}>
                    <b>{i + 1}. {d.kind === 'in' ? '进货' : '出货'} {d.productName}</b>
                    <span>
                      {d.codeNumber || '-'} · {d.specification || '-'} ·{' '}
                      {d.kind === 'in' ? `进 ${d.inQuantity}` : `出 ${d.outQuantity}`} · RM {d.price}
                      {d.type ? ` · ${d.type}` : ''}
                    </span>
                    <span>
                      {d.kind === 'out' && d.system === 'central' && (
                        <>
                          送往：
                          <select
                            value={d.deliverTo || ''}
                            onChange={(e) => updateDeliverTo(i, e.target.value)}
                            style={S.draftSelect}
                          >
                            <option value="">中央内部</option>
                            <option value="j1">J1</option>
                            <option value="j2">J2</option>
                            <option value="j3">J3</option>
                          </select>
                        </>
                      )}
                      {d.warning && <span style={{ color: '#d46b08' }}> ⚠️ {d.warning}</span>}
                    </span>
                  </div>
                ))}
                <div style={S.draftBtns}>
                  <button style={S.draftOk} onClick={confirmAll} disabled={draftBusy}>
                    {draftBusy ? '执行中…' : `✅ 确认执行全部 (${drafts.length})`}
                  </button>
                  <button style={S.draftCancel} onClick={() => setDrafts([])} disabled={draftBusy}>✖ 取消</button>
                </div>
              </div>
            )}
          </div>
          <div style={S.inputRow}>
            <input
              style={S.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) send()
              }}
              placeholder="输入问题，回车发送"
              disabled={loading}
            />
            <button style={S.send} onClick={send} disabled={loading || !input.trim()}>
              发送
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ---------- 内联样式（自包含，不污染全局 CSS） ----------
const S: Record<string, React.CSSProperties> = {
  ball: {
    position: 'fixed', width: 56, height: 56,
    borderRadius: '50%', border: 'none', zIndex: 5100,
    fontSize: 26, lineHeight: '56px', textAlign: 'center', padding: 0,
    background: 'linear-gradient(135deg, #1677ff, #36cfc9)', color: '#fff',
    boxShadow: '0 4px 14px rgba(22,119,255,.45)',
  },
  panel: {
    position: 'fixed', width: 380, height: 520,
    background: '#fff', borderRadius: 12, zIndex: 5100, display: 'flex',
    flexDirection: 'column', boxShadow: '0 8px 30px rgba(0,0,0,.22)', overflow: 'hidden',
  },
  head: {
    padding: '12px 16px', background: 'linear-gradient(135deg, #1677ff, #36cfc9)',
    color: '#fff', fontWeight: 600, display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', fontSize: 14,
  },
  close: { background: 'transparent', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' },
  list: { flex: 1, overflowY: 'auto', padding: 12, background: '#f5f7fa', display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', width: '100%' },
  bubbleAi: {
    maxWidth: '85%', padding: '8px 12px', borderRadius: '10px 10px 10px 2px',
    background: '#fff', border: '1px solid #e5e8ec', fontSize: 13, lineHeight: 1.6, color: '#222',
  },
  bubbleUser: {
    maxWidth: '85%', padding: '8px 12px', borderRadius: '10px 10px 2px 10px',
    background: '#1677ff', color: '#fff', fontSize: 13, lineHeight: 1.6,
  },
  draftCard: {
    background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8,
    padding: 10, fontSize: 12, color: '#333', width: '100%', boxSizing: 'border-box',
  },
  draftTitle: { fontWeight: 600, marginBottom: 6, color: '#ad6800' },
  draftItem: {
    display: 'flex', flexDirection: 'column', gap: 1, padding: '5px 0',
    borderBottom: '1px dashed #f0e6b8', fontSize: 12,
  },
  draftBtns: { display: 'flex', gap: 8, marginTop: 8 },
  draftSelect: {
    height: 22, fontSize: 12, borderRadius: 4, border: '1px solid #d9d9d9',
    marginLeft: 4, background: '#fff',
  },
  draftOk: {
    flex: 1, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer',
    background: '#52c41a', color: '#fff', fontSize: 12,
  },
  draftCancel: {
    flex: 1, height: 30, border: '1px solid #d9d9d9', borderRadius: 6,
    cursor: 'pointer', background: '#fff', fontSize: 12,
  },
  inputRow: { display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #e5e8ec', background: '#fff' },
  input: {
    flex: 1, height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #d9d9d9',
    fontSize: 13, outline: 'none',
  },
  send: {
    height: 36, padding: '0 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#1677ff', color: '#fff', fontSize: 13,
  },
}
