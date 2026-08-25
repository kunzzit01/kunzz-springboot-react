import { useRef, useState } from 'react'

/**
 * 新增记录保存后：滚动到新行位置并闪烁高亮（系统统一行为）
 *
 * 用法：
 *   const { hlKey, flash, isHl } = useRowHighlight((r) => String(r.productName))
 *   保存成功后：flashAfterRow(containerSel, 'td:nth-child(4)', name, flash)
 *   行渲染：className={isHl(row) ? 'highlight-flash' : ''}
 */
export function useRowHighlight<T>(getKey: (item: T) => string, duration = 3000) {
  const [hlKey, setHlKey] = useState<string | null>(null)
  const timer = useRef<any>(null)
  const flash = (key: string) => {
    setHlKey(key)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHlKey(null), duration)
  }
  const isHl = (item: T) => hlKey !== null && getKey(item) === hlKey
  return { hlKey, flash, isHl }
}

/** 将滚动容器滚动到目标行（扣除表头高度） */
export function scrollToRow(container: Element | null | undefined, rowEl: Element | null | undefined, offset = 8) {
  if (!container || !rowEl) return
  let top = 0
  let el: HTMLElement | null = rowEl as HTMLElement
  while (el && el !== container) {
    top += el.offsetTop
    el = el.offsetParent as HTMLElement | null
  }
  const thH = container.querySelector('thead')?.getBoundingClientRect().height || 0
  if (container instanceof HTMLElement) {
    container.scrollTop = Math.max(0, top - thH - offset)
  } else {
    rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

/**
 * 保存后定位新行：等渲染完成后，在容器内按某列文本找到新行 → 滚动 → 高亮
 * @param containerSel 滚动容器选择器（如 '.table-scroll-container'；页面级滚动传 'body'）
 * @param cellSel      新行标识所在列选择器（如 'td:nth-child(4)'）
 * @param key          新行标识文本（如 productName）
 */
export function flashAfterRow(
  containerSel: string,
  cellSel: string,
  key: string,
  flash: (k: string) => void,
  delay = 250,
) {
  setTimeout(() => {
    const sc = document.querySelector(containerSel)
    const rows = document.querySelectorAll(containerSel + ' tbody tr')
    let target: Element | null = null
    for (const row of rows) {
      const td = row.querySelector(cellSel)
      if (td && td.textContent && td.textContent.trim() === key) { target = row; break }
    }
    if (containerSel === 'body' || containerSel === 'window' || containerSel === 'document') {
      if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } else if (sc && target) {
      scrollToRow(sc, target)
    }
    flash(key)
  }, delay)
}
