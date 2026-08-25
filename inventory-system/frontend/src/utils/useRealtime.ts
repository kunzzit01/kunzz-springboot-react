import { useEffect, useRef, useCallback } from 'react'

/**
 * 全站实时更新 hook：
 * 连接后端 WebSocket /ws/realtime，收到 stock_changed 信号时回调（前端自行调 API 刷新）
 *
 * 高峰期保护策略（节流 + 尾部补刷 + 忙时暂停）：
 * - throttleMs（默认 3s）：同一页面两次刷新之间至少间隔 throttleMs，
 *   高峰期连续写入也最多每 3 秒刷一次，避免「刷新风暴」打爆后端
 * - debounceMs（默认 1s）：写入停下后 debounceMs 内补做最后一次刷新（尾部），保证最终一致
 * - isBusy：返回 true 时（用户正在编辑/弹窗打开）跳过自动刷新，不打断输入；
 *   结束后由尾部定时器自动补刷
 *
 * system 传 '*' 表示订阅任意系统（收到任何 stock_changed 都触发）
 */
export function useRealtime(
  system: string | null,
  onUpdate: () => void,
  debounceMs = 1000,
  throttleMs = 3000,
  isBusy?: () => boolean,
) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const systemRef = useRef(system)
  systemRef.current = system
  const busyRef = useRef(isBusy)
  busyRef.current = isBusy
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRunRef = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)

  const run = useCallback(() => {
    lastRunRef.current = Date.now()
    onUpdateRef.current()
  }, [])

  // 忙时等待检查：用户正在编辑时每秒检查一次，编辑一结束就补刷最新数据
  const armBusyCheck = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (busyRef.current?.()) armBusyCheck()
      else run()
    }, debounceMs)
  }, [debounceMs, run])

  const notify = useCallback(() => {
    // 用户正在编辑/弹窗打开：不打断，等编辑结束后自动补刷
    if (busyRef.current?.()) {
      armBusyCheck()
      return
    }
    const now = Date.now()
    const wait = throttleMs - (now - lastRunRef.current)
    if (wait <= 0) {
      // 距上次刷新已超过 throttleMs → 立即刷新
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      run()
    } else if (!timerRef.current) {
      // 冷却期内收到信号 → 排一个尾部刷新，合并连续信号（高峰期只刷一次）
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        if (busyRef.current?.()) armBusyCheck()
        else run()
      }, wait)
    }
  }, [debounceMs, throttleMs, run, armBusyCheck])

  useEffect(() => {
    let closed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      // 本地开发（前端 5174）直连后端 8081；生产走同源 Nginx 反代 /ws
      const isDev = window.location.port === '5174' || window.location.port === '5175'
      const proto = isDev ? 'ws://' : (window.location.protocol === 'https:' ? 'wss://' : 'ws://')
      const host = isDev ? window.location.hostname + ':8081' : window.location.host
      const ws = new WebSocket(proto + host + '/ws/realtime')
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg && msg.type === 'stock_changed') {
            const sys = systemRef.current
            if (msg.system === 'all' || sys === '*' || msg.system === sys) {
              notify()
            }
          }
        } catch { /* ignore bad json */ }
      }
      ws.onclose = () => {
        if (!closed) retryTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [notify])
}
