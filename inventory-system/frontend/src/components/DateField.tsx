import { forwardRef, useEffect, useRef, useState } from 'react'
import '../styles/date-field.css'

/**
 * 日期输入框（不跟随操作系统语言 / 区域格式）。
 *
 * 为什么不用原生 <input type="date">：
 *   它的显示格式由**操作系统/浏览器语言**决定（中文 Windows 上实测显示成 `10/27/2026`），
 *   而且聚焦后默认落在「月」那一段，用户想改「日」还得先按两次方向键。
 *
 * 本组件的固定行为：
 *   1. 显示永远是 **YYYY/MM/DD**（年/月/日），与系统语言无关；
 *   2. 输入数字自动补 `/`，满 8 位数字后立即回调（YYYY-MM-DD）；
 *   3. 聚焦（含弹窗自动聚焦）时**高亮「日」**（第 9–10 位），直接敲键盘就是改日；
 *   4. 右侧日历图标 → 打开系统原生日历选择器（隐藏的原生 date input + showPicker）。
 */

type Props = {
  /** 受控值，格式 'YYYY-MM-DD'；空字符串表示未填 */
  value: string
  /** 值变化回调，参数同为 'YYYY-MM-DD' */
  onChange: (iso: string) => void
  id?: string
  /** 透传给文本输入框的 class（例如 'form-input'，沿用页面已有样式） */
  className?: string
  required?: boolean
  disabled?: boolean
  'aria-label'?: string
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'（空值保持空） */
function toDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim())
  return m ? `${m[1]}/${m[2]}/${m[3]}` : ''
}

/** 数字串 → 边输边补 '/'：1231 → '1231'，202610 → '2026/10'，20261027 → '2026/10/27' */
function formatDigits(digits: string): string {
  const d = digits.slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}/${d.slice(4)}`
  return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6)}`
}

/** 是否是一天的合法写法（月 1-12、日 1-该月天数；不限制年份上下界，交给后端兜底校验） */
function isCompleteDate(display: string): boolean {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(display)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  const daysInMonth = new Date(Date.UTC(2000, mo, 0)).getUTCDate() // 闰年判断用 2000（闰年）不影响 2 月天数
  if (d > daysInMonth) return false
  return y >= 0
}

/** 光标应该落在「已输入 n 位数字」之后的位置（用于格式化后恢复光标，避免跳到末尾） */
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

const DateField = forwardRef<HTMLInputElement, Props>(function DateField(
  { value, onChange, id, className, required, disabled, ...rest },
  ref,
) {
  const [text, setText] = useState<string>(() => toDisplay(value))
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pickerRef = useRef<HTMLInputElement | null>(null)
  const pendingCaret = useRef<number | null>(null)

  // 外部值变化（例如弹窗打开时重置为今天）→ 同步显示
  useEffect(() => {
    setInvalid(false)
    setText((prev) => {
      const prevIso = isCompleteDate(prev) ? prev.replace(/\//g, '-') : ''
      return prevIso === (value || '') ? prev : toDisplay(value)
    })
  }, [value])

  // 格式化后把光标放回「刚输入的位数之后」
  useEffect(() => {
    const el = inputRef.current
    if (el && pendingCaret.current != null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  })

  const setRefs = (el: HTMLInputElement | null) => {
    inputRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as { current: HTMLInputElement | null }).current = el
  }

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    const formatted = formatDigits(digits)
    setText(formatted)
    setInvalid(false)
    pendingCaret.current = caretAfterDigits(formatted, digits.length)
    if (isCompleteDate(formatted)) onChange(formatted.replace(/\//g, '-'))
  }

  /** 聚焦即高亮「日」（满 10 位时），否则光标放到末尾 */
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    requestAnimationFrame(() => {
      if (el.value.length === 10) el.setSelectionRange(8, 10)
      else el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  /** 失焦时若没填完整 → 回退到上一个有效值，避免把半截日期带进业务逻辑。
   *  点右侧日历按钮时（relatedTarget 是本组件的按钮）不回退，让选择器直接填。 */
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const toCalendarBtn = e.relatedTarget instanceof HTMLElement && e.relatedTarget.classList.contains('date-field__btn')
    if (toCalendarBtn) return
    if (text === '' || isCompleteDate(text)) return
    const fallback = toDisplay(value)
    setText(fallback)
    setInvalid(fallback === '')
  }

  const openPicker = () => {
    const el = pickerRef.current
    if (!el) return
    const anyEl = el as HTMLInputElement & { showPicker?: () => void }
    try {
      if (typeof anyEl.showPicker === 'function') {
        anyEl.showPicker()
        return
      }
    } catch {
      /* 浏览器不支持 / 非用户手势调用 → 走下面的兜底 */
    }
    el.focus()
    el.click()
  }

  const nativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setText(toDisplay(v))
    setInvalid(false)
    onChange(v)
  }

  return (
    <div className="date-field">
      <input
        ref={setRefs}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY/MM/DD"
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
        onMouseDown={(e) => e.preventDefault()} /* 保持输入框焦点，避免先触发失焦 */
        onClick={openPicker}
        tabIndex={-1}
        disabled={disabled}
        aria-label="打开日历选择日期"
        title="打开日历"
      >
        <i className="fas fa-calendar-alt" aria-hidden="true" />
      </button>
      {/* 隐藏的原生 date input：只用于弹系统日历（保证不把它的区域格式露给用户） */}
      <input
        ref={pickerRef}
        type="date"
        className="date-field__native"
        value={value || ''}
        onChange={nativeChange}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
      />
    </div>
  )
})

export default DateField
