import { useEffect, useState } from 'react'

type Status = 'connecting' | 'connected' | 'offline'

/**
 * 全站实时连接状态指示器（诊断/展示用，不参与数据刷新）
 * 独立维护一条轻量 WS 连接，只上报 onopen/onclose 状态
 * 绿=已连接 黄=连接中 红=离线自动重连
 */
export default function RealtimeStatus() {
  const [status, setStatus] = useState<Status>('connecting')

  useEffect(() => {
    let closed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      setStatus('connecting')
      const isDev = window.location.port === '5174' || window.location.port === '5175'
      const proto = isDev ? 'ws://' : (window.location.protocol === 'https:' ? 'wss://' : 'ws://')
      const host = isDev ? window.location.hostname + ':8081' : window.location.host
      const ws = new WebSocket(proto + host + '/ws/realtime')
      ws.onopen = () => { if (!closed) setStatus('connected') }
      ws.onclose = () => {
        if (closed) return
        setStatus('offline')
        retryTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  const cfg = {
    connecting: { dot: '#f59e0b', text: '实时连接中…' },
    connected: { dot: '#22c55e', text: '实时已连接' },
    offline: { dot: '#ef4444', text: '实时离线·重连中' },
  }[status]

  return (
    <div
      className="realtime-status"
      title="全站实时更新：任意窗口做库存写入后，其他窗口约 1 秒自动刷新"
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, boxShadow: '0 0 5px ' + cfg.dot, flexShrink: 0 }} />
      {cfg.text}
    </div>
  )
}
