import axios from 'axios'
import { message } from 'antd'
import { getToken, getDeviceToken, clearSession } from '../utils/authToken'
import { refreshSession } from '../utils/authSession'

const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
})

// 请求拦截：附加 JWT（独立 token 键，避免与其他系统冲突）
// 2026-10-23：改用 getToken()，兼容「记住我」未勾选时存 sessionStorage 的情况
// 2026-10-28：顺带带上「记住设备」的令牌（只给 /auth/devices 认「当前设备」用，服务端不用于鉴权）
http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = 'Bearer ' + token
  }
  const deviceToken = getDeviceToken()
  if (deviceToken) {
    config.headers['X-Device-Token'] = deviceToken
  }
  return config
})

/** 回登录页（手机版回手机登录页；已经在登录页就不要跳，避免刷新循环） */
function bailToLogin() {
  clearSession()
  const path = window.location.pathname
  if (path.includes('login')) return
  const mobile = path.startsWith('/mobile') || path.startsWith('/m/')
  window.location.href = mobile ? '/mobile/login' : '/login'
}

/** 已经因 401 重放过一次的请求（防无限循环；用 WeakSet 而不是给 config 加字段，避免 axios 合并时丢掉标记） */
const retriedConfigs = new WeakSet<object>()

// 响应拦截：解包 { code, message, data }
http.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        message.error(body.message || '操作失败')
        return Promise.reject(new Error(body.message))
      }
      return body.data
    }
    return body
  },
  async (err) => {
    const status = err.response?.status
    const cfg = err.config as import('axios').InternalAxiosRequestConfig | undefined

    // 401 先试一次「设备令牌静默续登」，成功了就重放原请求（重启电脑后第一次进页面的关键路径）
    if (status === 401 && cfg && !retriedConfigs.has(cfg)) {
      retriedConfigs.add(cfg)
      const refreshed = await refreshSession()
      if (refreshed) {
        // 旧 JWT 已失效，先摘掉；重放时请求拦截器会用新 token 重新写 Authorization
        if (cfg.headers && typeof cfg.headers.delete === 'function') cfg.headers.delete('Authorization')
        return http(cfg)
      }
      bailToLogin()
      return Promise.reject(err)
    }

    if (status === 401) {
      bailToLogin()
    }
    // 不在此自动弹窗，由各页面 catch 统一展示具体错误（避免双重提示）
    return Promise.reject(err)
  },
)

export default http
