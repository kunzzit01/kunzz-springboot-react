import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/select-field.css'

/**
 * 自绘下拉（替代原生 <select>）。
 *
 * 为什么要自己做：原生 `<select>` 展开后的选项列表由**操作系统/浏览器**绘制，
 * 灰白系统菜单，跟站内风格完全不搭，且无法控制行高、选中态、hover 色（2026-10-29 用户反馈）。
 *
 * 行为：
 *   · 触发按钮显示当前值（空值显示 placeholder），右侧 chevron 展开时旋转 180°；
 *   · 面板渲染到 body（fixed 定位），不会被弹窗/表格的 overflow 裁掉，空间不足时自动向上展开；
 *   · 选项 hover / 键盘上下键高亮，选中项橙色 + 勾；
 *   · 键盘：Enter/Space 打开，↑↓ 移动，Enter 选中，Esc 关闭；点击外部关闭。
 */

export type SelectOption = { value: string; label: string }

type Props = {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  /** 小尺寸（手机版导出弹窗等窄容器） */
  compact?: boolean
  'aria-label'?: string
}

const POP_MIN_W = 160
const POP_MAX_H = 260

export default function SelectField({
  options, value, onChange, id, placeholder = '请选择', disabled, compact, ...rest
}: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  const selectedIdx = options.findIndex((o) => o.value === value)
  const selected = selectedIdx >= 0 ? options[selectedIdx] : null

  const computePos = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.max(POP_MIN_W, r.width)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const need = Math.min(POP_MAX_H, options.length * 40 + 12)
    // 下方放得下就往下，否则向上（两边都不够时选空间大的一侧）
    if (below >= need || below >= above) {
      setPos({ top: r.bottom + 4, left, width, maxH: Math.min(POP_MAX_H, Math.max(96, below)) })
    } else {
      setPos({ bottom: window.innerHeight - r.top + 4, left, width, maxH: Math.min(POP_MAX_H, Math.max(96, above)) })
    }
  }, [options.length])

  const openPanel = () => {
    if (disabled) return
    computePos()
    setActive(selectedIdx >= 0 ? selectedIdx : 0)
    setOpen(true)
  }

  const pick = (opt: SelectOption) => {
    onChange(opt.value)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 跟随滚动/缩放重新定位（不关闭，避免选单被误关）
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

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      openPanel()
    }
  }

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape': e.preventDefault(); e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); break
      case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setActive((i) => Math.min(options.length - 1, i + 1)); break
      case 'ArrowUp': e.preventDefault(); e.stopPropagation(); setActive((i) => Math.max(0, i - 1)); break
      case 'Home': e.preventDefault(); setActive(0); break
      case 'End': e.preventDefault(); setActive(options.length - 1); break
      case 'Enter':
      case ' ':
        e.preventDefault(); e.stopPropagation()
        if (options[active]) pick(options[active])
        break
      default: break
    }
  }

  return (
    <div className={`sel-field${compact ? ' sel-field--compact' : ''}${open ? ' sel-field--open' : ''}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`sel-field__trigger${selected ? '' : ' is-placeholder'}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onTriggerKeyDown}
        {...rest}
      >
        <span className="sel-field__label">{selected ? selected.label : placeholder}</span>
        <i className="fas fa-chevron-down sel-field__chev" aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="sel-pop"
          role="listbox"
          tabIndex={-1}
          style={{
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxH,
          }}
          onKeyDown={onPanelKeyDown}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`sel-pop__opt${o.value === value ? ' is-selected' : ''}${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              <span>{o.label}</span>
              {o.value === value && <i className="fas fa-check" aria-hidden="true" />}
            </button>
          ))}
          {options.length === 0 && <div className="sel-pop__empty">没有可选项</div>}
        </div>,
        document.body,
      )}
    </div>
  )
}
