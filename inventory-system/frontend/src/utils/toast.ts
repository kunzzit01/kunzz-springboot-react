/**
 * 全局 Toast 通知系统 —— 1:1 移植旧 live 系统 backend/js/toast.js
 * （源文件：C:/Users/kunzz/OneDrive/Desktop/kunzzgroup-main/backend/js/toast.js）
 *
 * Public API:
 *   showToast(message, type, duration)
 *     - type: 'success' | 'error' | 'warning' | 'info'  (default: 'success')
 *     - duration: 自动关闭毫秒数（默认 4000，0 = 不自动关闭）
 *
 *   showAlert(message, type)   — 旧系统兼容别名
 *   closeToast(id)             — 按 id 关闭某个 toast
 *
 * 样式见 src/styles/toast.css（1:1 复制旧系统 backend/css/toast.css）：
 * 右下角、白底、彩色左边框、图标 + 消息 + 关闭按钮 + 进度条，最多同时 5 条。
 */

const MAX_TOASTS = 5
const DEFAULT_DURATION = 4000

const ICONS: Record<string, string> = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle',
}

let toastCounter = 0

/** 容器（对齐旧系统 #global-toast-container，sidebar 注入的兜底逻辑） */
function getContainer(): HTMLElement {
  let container = document.getElementById('global-toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'global-toast-container'
    document.body.appendChild(container)
  }
  return container
}

/** 按 id 关闭 toast（对齐旧系统 closeToast：滑出动画 320ms 后移除 DOM） */
export function closeToast(toastId: string) {
  const el = document.getElementById(toastId)
  if (!el) return
  el.classList.remove('g-toast--visible')
  el.classList.add('g-toast--hiding')
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el)
  }, 320)
}

/** 简单 HTML 转义防 XSS（对齐旧系统 escapeHtml） */
function escapeHtml(text: unknown): string {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type ToastType = 'success' | 'error' | 'warning' | 'info'

/** 显示 toast（对齐旧系统 showToast） */
export function showToast(message: string, type: string = 'success', duration: number = DEFAULT_DURATION): string {
  const t: ToastType = (type && ICONS[type]) ? (type as ToastType) : 'success'
  const dur = (duration !== undefined && duration !== null) ? Number(duration) : DEFAULT_DURATION
  const container = getContainer()

  // 超过上限时逐出最旧的（MAX_TOASTS = 5）
  const existing = container.querySelectorAll('.g-toast')
  const toRemove = existing.length - (MAX_TOASTS - 1)
  for (let i = 0; i < toRemove; i++) {
    const el = existing[i] as HTMLElement | null
    if (el && el.id) closeToast(el.id)
  }

  const id = 'g-toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '-' + (toastCounter++)

  const toast = document.createElement('div')
  toast.className = 'g-toast g-toast--' + t + (dur > 0 ? ' g-toast--auto-dismiss' : '')
  toast.id = id
  if (dur > 0) {
    toast.style.setProperty('--toast-duration', (dur / 1000) + 's')
  }

  toast.innerHTML = [
    '<i class="fas ', ICONS[t], ' g-toast__icon"></i>',
    '<div class="g-toast__body">',
    '<span class="g-toast__message">', escapeHtml(message), '</span>',
    '</div>',
    '<button class="g-toast__close" aria-label="关闭">',
    '<i class="fas fa-times"></i>',
    '</button>',
    '<div class="g-toast__progress"></div>',
  ].join('')

  // 关闭按钮（React 环境不用 inline onclick，改为事件绑定）
  toast.querySelector('.g-toast__close')?.addEventListener('click', () => closeToast(id))

  container.appendChild(toast)

  // 下一帧触发过渡（对齐旧系统 requestAnimationFrame 双重包裹）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('g-toast--visible')
    })
  })

  if (dur > 0) {
    setTimeout(() => closeToast(id), dur)
  }

  return id
}

/** 旧系统兼容别名：showAlert(message, type = 'success') */
export function showAlert(message: string, type: string = 'success') {
  return showToast(message, type, DEFAULT_DURATION)
}
