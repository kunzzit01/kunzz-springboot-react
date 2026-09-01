// AI 助手显示开关（全局共享：侧边栏开关 ↔ 聊天球组件）
// 状态存 localStorage，跨组件用 CustomEvent 实时同步（避免引 Context 的重结构）
const KEY = 'ai-assistant-visible'

export function isAiVisible(): boolean {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

export function setAiVisible(v: boolean) {
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* 忽略 */ }
  window.dispatchEvent(new CustomEvent('ai-assistant-visible-change', { detail: v }))
}

export function onAiVisibleChange(cb: (v: boolean) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail === true)
  window.addEventListener('ai-assistant-visible-change', h)
  return () => window.removeEventListener('ai-assistant-visible-change', h)
}
