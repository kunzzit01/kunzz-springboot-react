import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 全局兜底：任何组件在渲染期抛错，React 会把整棵树卸载（表现为白屏）。
 * 这里接住并显示「页面出错了 + 重新加载」，同时把错误打到控制台便于报障时排查。
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染出错：', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const msg = String(this.state.error?.message || this.state.error || '未知错误')
    return (
      <div style={{
        minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center',
      }}>
        <i className="fas fa-triangle-exclamation" style={{ fontSize: 40, color: '#f59e0b' }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: '#374151' }}>页面出错了</div>
        <div style={{ fontSize: 13.5, color: '#6b7280', maxWidth: 520, wordBreak: 'break-all' }}>
          多半是网络不稳定导致数据没取全。重新加载一次通常就好了。
        </div>
        <div style={{
          fontSize: 12, color: '#9ca3af', maxWidth: 620, wordBreak: 'break-all',
          background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px',
        }}>{msg}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button onClick={() => window.location.reload()}
            style={{
              padding: '9px 22px', borderRadius: 10, border: 'none', background: '#ff5c00', color: '#fff',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}>重新加载</button>
          <a href="/" style={{
            padding: '9px 22px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff',
            color: '#374151', textDecoration: 'none', fontWeight: 600, fontSize: 14, lineHeight: '20px',
          }}>返回首页</a>
        </div>
      </div>
    )
  }
}
