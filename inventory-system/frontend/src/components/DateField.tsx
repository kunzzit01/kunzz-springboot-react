import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/date-field.css'

/**
 * 统一日期输入组件（全站通用）。
 *
 * 为什么不直接用 <input type="date">：
 *   1. 显示格式由**操作系统/浏览器语言**决定（中文 Windows 上实测是 `10/27/2026`），跟系统走、不受控；
 *   2. 自带的日历弹层同样是浏览器语言（`October 2026 / Su Mo Tu / Clear / Today`），跟本站风格完全不搭；
 *   3. 聚焦后默认落在「月」，想改「日」还要按方向键。
 *
 * 本组件的行为：
 *   · 输入框固定显示 **YYYY/MM/DD**（年/月/日），输入数字自动补 `/`；
 *   · 聚焦时**直接选中「日」**（第 9–10 位），敲键盘就是改日；
 *   · 右侧日历按钮打开**自绘日历**（中文星期、年月切换、今天/清除、min/max 禁用），不用系统日历；
 *   · 失焦时半截日期回退成上一个有效值（所见即所提交）。
 */

type Props = {
  /** 受控值 'YYYY-MM-DD'；空字符串表示未填 */
  value: string
  /** 值变化回调，参数 'YYYY-MM-DD' */
  onChange: (iso: string) => void
  id?: string
  name?: string
  /** 透传给文本输入框的 class（如 'form-input' / 'table-input' / 'excel-input'） */
  className?: string
  /** 表格内小尺寸（按钮更窄、字号更小） */
  compact?: boolean
  required?: boolean
  disabled?: boolean
  /** 可选范围（'YYYY-MM-DD'），超出范围的日期在日历里禁用 */
  min?: string
  max?: string
  placeholder?: string
  /** 透传给文本输入框的内联样式（用来兼容原 type="date" 处已写的行内样式） */
  style?: React.CSSProperties
  /** 外层容器样式（例如在 flex 行里需要 flex:1） */
  wrapperStyle?: React.CSSProperties
  'aria-label'?: string
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']
const POPUP_W = 292
const POPUP_H = 336

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
  const y = Number(mm[1])
  const m = Number(mm[2])
  const d = Number(mm[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'（空值保持空） */
function toDisplay(v: string): string {
  const p = parseIso(v)
  return p ? `${String(p.y).padStart(4, '0')}/${pad2(p.m)}/${pad2(p.d)}` : ''
}

/** 数字串 → 边输边补 '/' */
function formatDigits(digits: string): string {
  const d = digits.slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}/${d.slice(4)}`
  return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6)}`
}

/** 是否是合法的一天（只看日历合法性，年份上下界交给 min/max 与后端兜底） */
function isCompleteDate(display: string): boolean {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(display)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= daysInMonth(y, mo)
}

/** 光标应落在「已输入 n 位数字」之后 */
function caretAfterDigits(formatted: string, n: number): number {
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++
      if (seen === n) return i + 1
    }
  }
  return formatted.length
}

/** 6×7 的月份网格（含上下月补白） */
function monthMatrix(y: number, m: number) {
  const first = new Date(y, m - 1, 1)
  const startWeekday = first.getDay() // 0=周日
  const cells: { y: number; m: number; d: number; cur: boolean }[] = []
  const prevMonthDays = daysInMonth(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1)
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    cells.push({ y: m === 1 ? y - 1 : y, m: m === 1 ? 12 : m - 1, d, cur: false })
  }
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push({ y, m, d, cur: true })
  let nm = m === 12 ? 1 : m + 1
  let ny = m === 12 ? y + 1 : y
  let d = 1
  while (cells.length < 42) {
    cells.push({ y: ny, m: nm, d: d++, cur: false })
    if (d > daysInMonth(ny, nm)) {
      d = 1
      nm = nm === 12 ? 1 : nm + 1
      if (nm === 1) ny += 1
    }
  }
  return cells
}

const DateField = forwardRef<HTMLInputElement, Props>(function DateField(
  { value, onChange, id, name, className, compact, required, disabled, min, max, placeholder, wrapperStyle, ...rest },
  ref,
) {
  const [text, setText] = useState<string>(() => toDisplay(value))
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const pendingCaret = useRef<number | null>(null)

  const selected = parseIso(value)
  const [view, setView] = useState(() => {
    const p = selected
    const t = new Date()
    return p ? { y: p.y, m: p.m } : { y: t.getFullYear(), m: t.getMonth() + 1 }
  })
  // 日历里用方向键移动的焦点日
  const [cursor, setCursor] = useState<string>(() => (selected ? value : todayIso()))

  /* ---------- 外部值同步 ---------- */
  useEffect(() => {
    setText((prev) => {
      const prevIsoStr = isCompleteDate(prev) ? prev.replace(/\//g, '-') : ''
      return prevIsoStr === (value || '') ? prev : toDisplay(value)
    })
    setInvalid(false)
  }, [value])

  useEffect(() => {
    const el = inputRef.current
    if (el && pendingCaret.current != null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  })

  /* ---------- 弹层定位（fixed，避免被表格 overflow 裁掉） ---------- */
  const updatePos = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let left = r.left
    if (left + POPUP_W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - POPUP_W - 8)
    let top = r.bottom + 6
    if (top + POPUP_H > window.innerHeight - 8) top = Math.max(8, r.top - POPUP_H - 6)
    setPos({ top, left })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    const onScroll = () => updatePos()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, updatePos])

  /* ---------- 点外面 / Esc 关闭 ---------- */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const setRefs = (el: HTMLInputElement | null) => {
    inputRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as { current: HTMLInputElement | null }).current = el
  }

  /* ---------- 文本输入 ---------- */
  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    const formatted = formatDigits(digits)
    setText(formatted)
    setInvalid(false)
    pendingCaret.current = caretAfterDigits(formatted, digits.length)
    if (isCompleteDate(formatted)) onChange(formatted.replace(/\//g, '-'))
  }

  /** 聚焦即高亮「日」 */
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    requestAnimationFrame(() => {
      if (el.value.length === 10) el.setSelectionRange(8, 10)
      else el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  /** 失焦：半截日期回退为上一个有效值（点日历按钮时不回退） */
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const toBtn = e.relatedTarget instanceof HTMLElement && !!e.relatedTarget.closest('.date-field__btn')
    if (toBtn) return
    if (text === '' || isCompleteDate(text)) return
    const fallback = toDisplay(value)
    setText(fallback)
    setInvalid(fallback === '')
  }

  /* ---------- 日历交互 ---------- */
  const isDisabledDay = (dayIso: string) => {
    if (min && dayIso < min) return true
    if (max && dayIso > max) return true
    return false
  }

  const openCalendar = () => {
    const p = selected
    const t = new Date()
    const base = p ?? { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }
    setView({ y: base.y, m: base.m })
    setCursor(iso(base.y, base.m, base.d))
    setOpen(true)
    requestAnimationFrame(() => popupRef.current?.focus())
  }

  const pick = (dayIso: string) => {
    if (isDisabledDay(dayIso)) return
    onChange(dayIso)
    setText(toDisplay(dayIso))
    setInvalid(false)
    setOpen(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(8, 10)
    })
  }

  const shiftMonth = (delta: number) => {
    setView((v) => {
      let m = v.m + delta
      let y = v.y
      while (m < 1) { m += 12; y -= 1 }
      while (m > 12) { m -= 12; y += 1 }
      return { y, m }
    })
  }

  const moveCursor = (days: number) => {
    const c = parseIso(cursor) ?? selected ?? { y: view.y, m: view.m, d: 1 }
    const dt = new Date(c.y, c.m - 1, c.d)
    dt.setDate(dt.getDate() + days)
    const next = iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
    setCursor(next)
    setView({ y: dt.getFullYear(), m: dt.getMonth() + 1 })
  }

  const onPopupKeyDown = (e: React.KeyboardEvent) => {
    // 弹窗（portal）在 React 树上仍属于外层表单/弹窗：不拦截冒泡的话，
    // 在这里按 Enter 选日期会同时触发外层「新增记录」弹窗的 Enter=创建记录。
    if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Enter', 't', 'T'].includes(e.key)) {
      e.stopPropagation()
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); setOpen(false); inputRef.current?.focus(); break
      case 'ArrowLeft': e.preventDefault(); moveCursor(-1); break
      case 'ArrowRight': e.preventDefault(); moveCursor(1); break
      case 'ArrowUp': e.preventDefault(); moveCursor(-7); break
      case 'ArrowDown': e.preventDefault(); moveCursor(7); break
      case 'PageUp': e.preventDefault(); shiftMonth(-1); break
      case 'PageDown': e.preventDefault(); shiftMonth(1); break
      case 'Enter': e.preventDefault(); pick(cursor); break
      case 't': case 'T': e.preventDefault(); pick(todayIso()); break
      default: break
    }
  }

  const cells = monthMatrix(view.y, view.m)
  const today = todayIso()
  const monthLabel = `${view.y} 年 ${view.m} 月`

  return (
    <div className={`date-field${compact ? ' date-field--compact' : ''}${invalid ? ' date-field--invalid' : ''}`} ref={wrapRef} style={wrapperStyle}>
      <input
        ref={setRefs}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? 'YYYY/MM/DD'}
        title="格式：年/月/日，聚焦后会直接选中「日」，可直接输入修改"
        className={`${className || ''} date-field__text${invalid ? ' date-field__text--invalid' : ''}`}
        value={text}
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
      />
      <button
        type="button"
        className="date-field__btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        disabled={disabled}
        aria-label="打开日历"
        aria-expanded={open}
        title="打开日历"
      >
        <i className="fas fa-calendar-alt" aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div
          className="date-cal"
          ref={popupRef}
          style={{ top: pos.top, left: pos.left }}
          tabIndex={-1}
          onKeyDown={onPopupKeyDown}
          role="dialog"
          aria-label="选择日期"
        >
          <div className="date-cal__head">
            <button type="button" className="date-cal__nav" onClick={() => setView((v) => ({ y: v.y - 1, m: v.m }))} aria-label="上一年">«</button>
            <button type="button" className="date-cal__nav" onClick={() => shiftMonth(-1)} aria-label="上个月">‹</button>
            <span className="date-cal__title">{monthLabel}</span>
            <button type="button" className="date-cal__nav" onClick={() => shiftMonth(1)} aria-label="下个月">›</button>
            <button type="button" className="date-cal__nav" onClick={() => setView((v) => ({ y: v.y + 1, m: v.m }))} aria-label="下一年">»</button>
          </div>

          <div className="date-cal__week">
            {WEEK_CN.map((w) => <span key={w}>{w}</span>)}
          </div>

          <div className="date-cal__grid">
            {cells.map((c) => {
              const cIso = iso(c.y, c.m, c.d)
              const cls = [
                'date-cal__day',
                c.cur ? '' : 'is-out',
                cIso === today ? 'is-today' : '',
                cIso === value ? 'is-selected' : '',
                cIso === cursor ? 'is-cursor' : '',
                isDisabledDay(cIso) ? 'is-disabled' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={cIso}
                  type="button"
                  className={cls}
                  disabled={isDisabledDay(cIso)}
                  onClick={() => pick(cIso)}
                  onMouseEnter={() => setCursor(cIso)}
                  tabIndex={-1}
                >
                  {c.d}
                </button>
              )
            })}
          </div>

          <div className="date-cal__foot">
            <button type="button" className="date-cal__link" onClick={() => pick(today)}>今天</button>
            <button
              type="button"
              className="date-cal__link"
              onClick={() => {
                onChange('')
                setText('')
                setOpen(false)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
            >
              清除
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
})

export default DateField
