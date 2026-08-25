import axios from 'axios'
import { message } from 'antd'

const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
})

// 请求拦截：附加 JWT（独立 token 键，避免与其他系统冲突）
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('inv_token')
  if (token) {
    config.headers.Authorization = 'Bearer ' + token
  }
  return config
})

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
  (err) => {
    const status = err.response?.status
    if (status === 401) {
      localStorage.removeItem('inv_token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // 不在此自动弹窗，由各页面 catch 统一展示具体错误（避免双重提示）
    return Promise.reject(err)
  },
)

export default http
