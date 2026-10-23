import { useEffect } from 'react'

/**
 * 新版本探测（2026-10-23）
 *
 * 背景：后台是 SPA，部署新版本后，**已经开着的标签页还在跑旧 JS**（登录走的是前端路由，
 * 不会重新拉 index.html），用户会看到旧界面，直到手动刷新。典型症状：
 * 「重新登录后进页面还是旧版，F5 一下才变新」。
 *
 * 做法：定时（+ 窗口重新获得焦点时）拉一次 /index.html，比较里面引用的
 *       主 bundle 文件名（带 hash）与当前页面正在跑的是否一致；不一致就回调，
 *       由调用方弹「系统已更新，请刷新」的提示（不自动刷新，避免打断填表）。
 */

const POLL_MS = 5 * 60 * 1000
const FIRST_CHECK_MS = 30 * 1000

/** 当前页面正在跑的入口 bundle（/assets/index-xxxx.js） */
function currentBundle(): string {
  const el = document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null
  const src = el?.getAttribute('src') || ''
  return src.replace(/^https?:\/\/[^/]+/, '')
}

/** 服务器上 index.html 现在引用的入口 bundle */
export async function fetchDeployedBundle(): Promise<string> {
  const res = await fetch('/index.html?ts=' + Date.now(), { cache: 'no-store' })
  if (!res.ok) return ''
  const html = await res.text()
  const m = html.match(/<script[^>]+src="([^"]*\/assets\/[^"]+\.js)"/i)
  return m ? m[1].replace(/^https?:\/\/[^/]+/, '') : ''
}

/** 是否有新版本（当前 bundle 与服务器不同） */
export async function hasNewVersion(): Promise<boolean> {
  const cur = currentBundle()
  if (!cur) return false
  try {
    const next = await fetchDeployedBundle()
    return !!next && next !== cur
  } catch {
    return false
  }
}

/** 挂到后台布局：发现新版本时回调一次 */
export function useVersionWatcher(onNewVersion: () => void) {
  useEffect(() => {
    let fired = false
    const run = async () => {
      if (fired) return
      if (!(await hasNewVersion())) return
      fired = true
      onNewVersion()
    }
    const timer = window.setTimeout(run, FIRST_CHECK_MS)
    const interval = window.setInterval(run, POLL_MS)
    const onFocus = () => { run() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
