/**
 * 登录凭据的存取（2026-10-23 起；2026-10-28 扩「记住设备」）
 *
 * 三层凭据，不要混：
 *   ① inv_token     访问令牌（JWT，后端固定 24 小时）
 *        - 勾选「记住我」 → localStorage（关掉浏览器再开仍有效）
 *        - 未勾选         → sessionStorage（关掉浏览器即失效 → 下次要重新登录）
 *   ② inv_device_*  「记住我」的设备令牌（后端 90 天滚动，重启电脑后用它静默换新 JWT）
 *        只放 localStorage：它的语义就是「这台设备一直记着」。
 *   ③ inv_remember  登录页回填的账号名（纯 UI 便利，不含任何凭据）
 *
 * 注意：sessionStorage 是「按标签页」隔离的 —— 未勾选登录后，新开一个标签页仍需重新登录。
 * 所有读 token 的地方都要用 getToken()，不要再直接 localStorage.getItem('inv_token')，
 * 否则 sessionStorage 里的 token 会被漏掉（表现为「登录了但接口都 401」）。
 *
 * 免登录的完整链路见 utils/authSession.ts：
 *   JWT 过期/不存在 → getDeviceToken() → POST /api/auth/refresh → 新 JWT（用户无感）
 */

const TOKEN_KEY = 'inv_token'
const DEVICE_TOKEN_KEY = 'inv_device_token'
const DEVICE_ID_KEY = 'inv_device_id'
const DEVICE_EXP_KEY = 'inv_device_exp'

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

/** 解析 JWT 的 exp（不发网络请求）；解析不出来就当「已过期」处理，交给设备令牌兜底 */
export function isTokenExpired(token: string | null | undefined, skewSeconds = 120): boolean {
  if (!token) return true
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    )
    if (typeof json?.exp !== 'number') return true
    // skew：提前 2 分钟视为过期，避免「刚好在请求途中失效」
    return json.exp * 1000 <= Date.now() + skewSeconds * 1000
  } catch {
    return true
  }
}

/** 本地是否有一张「还没过期」的 JWT（过期了就要走设备令牌静默续登） */
export function hasValidToken(): boolean {
  const t = getToken()
  return !!t && !isTokenExpired(t)
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

// ---------------- 「记住这台设备」的设备令牌 ----------------

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY)
  } catch {
    return null
  }
}

export function getDeviceId(): number | null {
  try {
    const v = localStorage.getItem(DEVICE_ID_KEY)
    return v ? Number(v) || null : null
  } catch {
    return null
  }
}

export function getDeviceExpiresAt(): number | null {
  try {
    const v = localStorage.getItem(DEVICE_EXP_KEY)
    return v ? Number(v) || null : null
  } catch {
    return null
  }
}

/** 登录时后端签发的设备令牌：客户端只保存，服务端只存它的 SHA-256 */
export function setDeviceAuth(token: string, deviceId?: number | null, expiresAtMs?: number | null): void {
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
    if (deviceId) localStorage.setItem(DEVICE_ID_KEY, String(deviceId))
    else localStorage.removeItem(DEVICE_ID_KEY)
    if (expiresAtMs) localStorage.setItem(DEVICE_EXP_KEY, String(expiresAtMs))
    else localStorage.removeItem(DEVICE_EXP_KEY)
  } catch {
    /* ignore */
  }
}

export function clearDeviceAuth(): void {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY)
    localStorage.removeItem(DEVICE_ID_KEY)
    localStorage.removeItem(DEVICE_EXP_KEY)
  } catch {
    /* ignore */
  }
}

/** 退出/失效：JWT 与设备令牌一起清（登出必须撤销设备，否则下次打开又自动进去了） */
export function clearSession(): void {
  clearToken()
  clearDeviceAuth()
}
