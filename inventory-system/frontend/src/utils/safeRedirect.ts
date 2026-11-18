/**
 * 登录后回跳目标的同源校验（task 2026-11-18-react-router-v7）。
 *
 * `?redirect=` 来自 URL，任何人都能构造。以前只判断 `startsWith('/') && !startsWith('//')`，
 * 但 `/\evil.com`、`/\t/evil.com` 这类写法能绕过：浏览器会把反斜杠当成斜杠、并剔除制表符/换行，
 * 最终变成 `//evil.com`（协议相对地址）→ 跳到外站（开放重定向，钓鱼常用）。
 *
 * 做法：交给浏览器自己的 URL 解析器按当前站点解析，解析结果必须仍是本站，
 * 且归一化后的路径不能以 `//` 开头；不满足就返回 null，调用方走默认落地页。
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null
  try {
    const u = new URL(raw, window.location.origin)
    if (u.origin !== window.location.origin) return null
    const path = u.pathname + u.search + u.hash
    if (/^[/\\]{2}/.test(path)) return null
    return path
  } catch {
    return null
  }
}
