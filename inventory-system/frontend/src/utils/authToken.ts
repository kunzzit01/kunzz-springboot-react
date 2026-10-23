/**
 * 登录 token 的存取（2026-10-23）
 *
 * 「记住我」语义：
 *   - 勾选   → 存 localStorage（关掉浏览器再开仍登录）
 *   - 未勾选 → 存 sessionStorage（关掉浏览器即失效 → 下次要重新登录）
 *
 * 注意：sessionStorage 是「按标签页」隔离的 —— 未勾选登录后，新开一个标签页仍需重新登录。
 * 所有读 token 的地方都要用 getToken()，不要再直接 localStorage.getItem('inv_token')，
 * 否则 sessionStorage 里的 token 会被漏掉（表现为「登录了但接口都 401」）。
 */

const TOKEN_KEY = 'inv_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function hasToken(): boolean {
  return !!getToken()
}

/** 写入 token；remember=false 时只在本标签页/当前浏览器会话内有效 */
export function setToken(token: string, remember: boolean): void {
  clearToken()
  try {
    if (remember) localStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 隐私模式等场景下可能写不进去，忽略 */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
