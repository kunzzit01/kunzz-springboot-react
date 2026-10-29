import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/date-field.css'

/**
 * 日期区间选择（范围），与 DateField 共用同一套日历视觉。
 *
 * 背景（2026-10-29）：KPI 仪表盘 / 成本页的「日期范围」弹层是各页自己用行内样式拼的
 * （橙色方块导航 + 灰底范围块 + 取消/确定按钮），跟 DateField 的日历完全是两套观感。
 * 这里把弹层收敛成一个组件，样式复用 `.date-cal*`：
 *   · 点第一次 = 起点，点第二次 = 终点（自动应用并关闭；同一天点两次 = 单日）
 *   · 选起点后鼠标划过会实时预览区间
 *   · 键盘：←→ 移日、↑↓ 移周、PgUp/PgDn 移月、Enter 选中、Esc 关闭
 *   · 底部：今天 / 本月 / 取消
 *
 * 触发按钮沿用页面既有的 `.date-range-picker` 样式（各页 CSS 已定义），保证不动布局。
 */

type Props = {
  /** 'YYYY-MM-DD' */
  start: string
  end: string
  onChange: (range: { start: string; end: string }) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']
const POPUP_W = 300
const POPUP_H = 350

const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`
const todayIso = () => {
  const t = new Date()
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate())
}
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

function parseIso(v: string): { y: number; m: number; d: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v || '').trim())
  if (!mm) return null
  const y = Number(mm[1]); const m = Number(mm[2]); const d = Number(mm[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}

/** 2026年10月29日 */
function fmtCN(v: string): string {
  const p = parseIso(v)
  return p ? `${p.y}年${p.m}月${p.d}日` : ''
}

/** 6×7 网格（含上下月补白） */
function monthMatrix(y: number, m: number) {
  const startWeekday = new Date(y, m - 1, 1).getDay()
  const cells: { iso: string; d: number; cur: boolean }[] = []
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  const prevDays = daysInMonth(prevY, prevM)
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevDays - i
    cells.push({ iso: iso(prevY, prevM, d), d, cur: false })
  }
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push({ iso: iso(y, m, d), d, cur: true })
  let ny = m === 12 ? y + 1 : y
  let nm = m === 12 ? 1 : m + 1
  let d = 1
  while (cells.length < 42) {
    cells.push({ iso: iso(ny, nm, d), d, cur: false })
    d++
    if (d > daysInMonth(ny, nm)) { d = 1; nm = nm === 12 ? 1 : nm + 1; if (nm === 1) ny++ }
  }
  return cells
}

export default function DateRangeField({ start, end, onChange, placeholder = '选择日期范围', disabled, id }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState(() => {
    const p = parseIso(start) ?? parseIso(end)
    const t = new Date()
    return p ? { y: p.y, m: p.m } : { y: t.getFullYear(), m: t.getMonth() + 1 }
  })

  const triggerRef = useRef<HTMLDivElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  const label = start && end ? `${fmtCN(start)} - ${fmtCN(end)}` : placeholder

  const computePos = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POPUP_W - 8))
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    if (below >= POPUP_H || below >= above) setPos({ top: r.bottom + 6, left })
    else setPos({ bottom: window.innerHeight - r.top + 6, left })
  }, [])

  const openPanel = () => {
    if (disabled) return
    const p = parseIso(start) ?? parseIso(end)
    const t = new Date()
    setView(p ? { y: p.y, m: p.m } : { y: t.getFullYear(), m: t.getMonth() + 1 })
    setPending(null)
    setHover(null)
    computePos()
    setOpen(true)
    requestAnimationFrame(() => popRef.current?.focus())
  }

  const close = () => { setOpen(false); setPending(null); setHover(null) }

  const apply = (s: string, e: string) => { onChange({ start: s, end: e }); close() }

  const pick = (dayIso: string) => {
    if (!pending) { setPending(dayIso); setHover(null); return }
    const s = dayIso < pending ? dayIso : pending
    const e = dayIso < pending ? pending : dayIso
    apply(s, e)
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 滚动/缩放跟随
  useEffect(() => {
    if (!open) return
    const h = () => computePos()
    window.addEventListener('scroll', h, true)
    window.addEventListener('resize', h)
    return () => {
      window.removeEventListener('scroll', h, true)
      window.removeEventListener('resize', h)
    }
  }, [open, computePos])

  const shiftMonth = (delta: number) => {
    setView((v) => {
      let m = v.m + delta
      let y = v.y
      while (m < 1) { m += 12; y-- }
      while (m > 12) { m -= 12; y++ }
      return { y, m }
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const base = pending ?? (parseIso(start) ? start : todayIso())
    const move = (days: number) => {
      const p = parseIso(base)!
      const dt = new Date(p.y, p.m - 1, p.d + days)
      const next = iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
      setPending((cur) => (cur ? cur : next === start ? start : next))
      setView({ y: dt.getFullYear(), m: dt.getMonth() + 1 })
      setHover(next)
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); triggerRef.current?.focus(); break
      case 'ArrowLeft': e.preventDefault(); e.stopPropagation(); move(-1); break
      case 'ArrowRight': e.preventDefault(); e.stopPropagation(); move(1); break
      case 'ArrowUp': e.preventDefault(); e.stopPropagation(); move(-7); break
      case 'ArrowDown': e.preventDefault(); e.stopPropagation(); move(7); break
      case 'PageUp': e.preventDefault(); e.stopPropagation(); shiftMonth(-1); break
      case 'PageDown': e.preventDefault(); e.stopPropagation(); shiftMonth(1); break
      case 'Enter':
        e.preventDefault(); e.stopPropagation()
        if (hover) pick(hover)
        break
      default: break
    }
  }

  // 高亮区间（未选完时用 hover 预览）
  const rs = pending
    ? (hover && hover < pending ? hover : pending)
    : start
  const re = pending
    ? (hover && hover < pending ? pending : (hover ?? pending))
    : end

  const cells = monthMatrix(view.y, view.m)
  const today = todayIso()

  return (
    <>
      <div
        ref={triggerRef}
        id={id}
        className={`date-range-picker${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); openPanel() }
        }}
      >
        <i className="fas fa-calendar-alt" aria-hidden="true" />
        <span>{label}</span>
      </div>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="date-cal"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: POPUP_W }}
          tabIndex={-1}
          role="dialog"
          aria-label="选择日期范围"
          onKeyDown={onKeyDown}
        >
          <div className="date-cal__head">
            <button type="button" className="date-cal__nav" onClick={() => setView((v) => ({ y: v.y - 1, m: v.m }))} aria-label="上一年">«</button>
            <button type="button" className="date-cal__nav" onClick={() => shiftMonth(-1)} aria-label="上个月">‹</button>
            <span className="date-cal__title">{view.y} 年 {view.m} 月</span>
            <button type="button" className="date-cal__nav" onClick={() => shiftMonth(1)} aria-label="下个月">›</button>
            <button type="button" className="date-cal__nav" onClick={() => setView((v) => ({ y: v.y + 1, m: v.m }))} aria-label="下一年">»</button>
          </div>

          <div className="date-cal__week">
            {WEEK_CN.map((w) => <span key={w}>{w}</span>)}
          </div>

          <div className="date-cal__grid">
            {cells.map((c) => {
              const cls = [
                'date-cal__day',
                c.cur ? '' : 'is-out',
                c.iso === today ? 'is-today' : '',
                c.iso === rs && c.iso === re ? 'is-selected' : '',
                c.iso === rs && rs !== re ? 'is-range-start' : '',
                c.iso === re && rs !== re ? 'is-range-end' : '',
                c.iso > rs && c.iso < re ? 'is-in-range' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={c.iso}
                  type="button"
                  className={cls}
                  onClick={() => pick(c.iso)}
                  onMouseEnter={() => { if (pending) setHover(c.iso) }}
                  tabIndex={-1}
                >
                  {c.d}
                </button>
              )
            })}
          </div>

          <div className="date-cal__foot">
            <button type="button" className="date-cal__link" onClick={() => apply(today, today)}>今天</button>
            <button
              type="button"
              className="date-cal__link"
              onClick={() => apply(
                iso(view.y, view.m, 1),
                iso(view.y, view.m, daysInMonth(view.y, view.m)),
              )}
            >
              本月
            </button>
            <button type="button" className="date-cal__link date-cal__link--ghost" onClick={close}>取消</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
