import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { login as loginApi } from '../api'

/** 后台登录页：老版视觉（原生 React） */
export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      const res = await loginApi({ username, password })
      localStorage.setItem('inv_token', res.token)
      if (remember) localStorage.setItem('inv_remember', username)
      else localStorage.removeItem('inv_remember')
      // 首次登录（临时密码）→ 强制先去重设自己的密码
      if (res.mustChangePassword) {
        message.warning('首次登录，请先重设您的密码')
        navigate('/change-password', { replace: true })
        return
      }
      message.success('欢迎回来，' + (res.user.displayName || res.user.username) + '！')
      // 跳转优先级：?redirect= 参数（对齐旧手机版 login.php?redirect=stocklistjX.php）
      // > 登录前被拦截的页面（保留完整路径+查询，电话版 /mobile/*?system=jX 依赖 system 定位分店）> 主页
      const redirectParam = new URLSearchParams(window.location.search).get('redirect')
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
        navigate(redirectParam, { replace: true })
        return
      }
      const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from
      navigate((from?.pathname || '/') + (from?.search || ''), { replace: true })
    } catch {
      /* 拦截器已提示 */
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="login-section">
      <div className="login-form">
        <button type="button" className="back-button" onClick={() => {
    // 已登录直接回主页；未登录时若 history 有有效前页则后退，否则留登录页
    if (localStorage.getItem('inv_token')) {
      navigate('/', { replace: true })
    } else if (window.history.length > 1) {
      window.history.back()
    }
  }} aria-label="返回">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2>请登入您的账号</h2>
        <form onSubmit={onSubmit}>
          <label className="input-label" htmlFor="username">账号</label>
          <input id="username" type="text" placeholder="邮箱、用户名或用户 ID" required
            value={username} onChange={(e) => setUsername(e.target.value)} />
          <label className="input-label" htmlFor="password">密码</label>
          <div className="password-container">
            <input id="password" type={visible ? 'text' : 'password'} placeholder="密码" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <img className="eye-icon" src="/static/images/眼睛.png" alt="显示密码" onClick={() => setVisible(!visible)} />
          </div>
          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> 记住我
            </label>
            <a href="#" onClick={(e) => e.preventDefault()}>忘记密码？</a>
          </div>
          <button type="submit" disabled={loading}>{loading ? '登入中…' : '登入'}</button>
        </form>
        <hr className="form-divider" />
        <div className="form-links" />
      </div>
    </section>
  )
}
