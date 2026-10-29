import axios from 'axios'
import { getDeviceToken, hasValidToken, setToken } from './authToken'

/**
 * 会话续登（2026-10-28，「记住我 = 记住这台设备」）
 *
 * 目标：勾选「记住我」后，**重启电脑 / 关掉浏览器**再打开
 * https://www.kunzzgroup.com/dashboard（或点「员工登录」）直接进后台，不再输密码。
 *
 * 做法：
 *   - 后端登录时额外签发「设备令牌」（90 天滚动，见 DeviceTokenService）；
 *   - 本模块在每次页面启动时检查：本地 JWT 不存在/已过期 → 用设备令牌静默换新 JWT；
 *   - 接口返回 401 时（见 api/http.ts）也会先试一次，成功就重放原请求。
 *
 * 说明：这里刻意用**裸 axios**（不经过 api/http.ts 的拦截器），
 * 因为续登失败是预期内的正常路径，不应该弹「未登录或登录已过期」之类的错误提示。
 */

let inflight: Promise<boolean> | null = null
/** 设备令牌被服务端明确拒绝过（撤销/过期/账号不存在）→ 本次会话不再重试，避免无谓请求 */
let dead = false

/** 登录成功后调用：清掉上一轮会话的「已判死」状态 */
export function resetAuthSession(): void {
  dead = false
  inflight = null
}

/** 用设备令牌换一张新 JWT；成功返回 true */
export function refreshSession(): Promise<boolean> {
  if (dead) return Promise.resolve(false)
  const deviceToken = getDeviceToken()
  if (!deviceToken) return Promise.resolve(false)
  // 单飞：多个请求同时 401（或启动门禁与拦截器同时触发）只发一次续登请求
  if (!inflight) {
    inflight = requestRefresh(deviceToken).finally(() => {
      inflight = null
    })
  }
  return inflight
}

async function requestRefresh(deviceToken: string): Promise<boolean> {
  try {
    const res = await axios.post('/api/auth/refresh', { deviceToken }, { timeout: 20000 })
    const body = res.data
    if (body && body.code === 0 && body.data && body.data.token) {
      // 设备已被记住 → JWT 也放 localStorage，重启/多标签页表现一致
      setToken(body.data.token, true)
      return true
    }
    dead = true
    return false
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 401 || status === 403) dead = true
    // 网络异常（断网/超时）：不判死，用户下次打开还有机会
    return false
  }
}

/** 页面启动门禁：本地有可用 JWT 直接用；否则尝试用设备令牌续登 */
export async function ensureSession(): Promise<boolean> {
  if (hasValidToken()) return true
  if (!getDeviceToken()) return false
  return refreshSession()
}

/** 撤销本机设备令牌（登出时调用；失败也不阻塞，本地凭据照样清） */
export async function revokeThisDevice(): Promise<void> {
  const deviceToken = getDeviceToken()
  if (!deviceToken) return
  try {
    await axios.post('/api/auth/logout', { deviceToken }, { timeout: 8000 })
  } catch {
    /* 断网等场景忽略：本地清掉即可，服务端会按 90 天过期自然回收 */
  }
}
