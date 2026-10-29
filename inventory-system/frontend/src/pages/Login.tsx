import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { login as loginApi } from '../api'
import { setToken, setDeviceAuth, clearDeviceAuth, hasValidToken, getDeviceToken } from '../utils/authToken'
import { resetAuthSession } from '../utils/authSession'

/** 后台登录页：老版视觉（原生 React） */
export default function Login() {
  // 「记住我」：勾选过就在下次打开时回填账号并保持勾选（以前只写不读，等于没作用）
  const [username, setUsername] = useState(() => localStorage.getItem('inv_remember') || '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => !!localStorage.getItem('inv_remember'))
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      const res = await loginApi({
        username, password, remember,
        // 带上这台浏览器上一轮的设备令牌：后端先撤销它再发新的，设备列表不会越登越多行
        previousDeviceToken: getDeviceToken(),
      })
      // 「记住我」：勾选→localStorage（关浏览器仍登录）；未勾选→sessionStorage（关浏览器即退出）
      setToken(res.token, remember)
      // 勾选「记住我」时后端会额外发一个设备令牌（90 天滚动）——
      // 它才是「重启电脑后打开 /dashboard 直接进页面」的依据，见 utils/authSession.ts
      if (remember && res.deviceToken) {
        setDeviceAuth(res.deviceToken, res.deviceId, res.deviceExpiresAtMs)
      } else {
        clearDeviceAuth() // 换账号/未勾选：别把上一轮设备令牌留着
      }
      resetAuthSession()
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
      //
      // 2026-10-23：这里用「整页跳转」而不是 navigate()。
      // 原因是登录是前端路由，不会重新拉 index.html —— 如果部署了新版本，
      // 用户登出再登入后跑的还是内存里的旧 JS（症状：进页面是旧版，F5 才变新）。
      // 整页跳转会重新取一次 index.html，顺带拿到最新 bundle。
      const redirectParam = new URLSearchParams(window.location.search).get('redirect')
      let target: string
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
        target = redirectParam
      } else {
        const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from
        target = (from?.pathname || '/dashboard') + (from?.search || '')
      }
      window.location.replace(target)
    } catch {
      /* 拦截器已提示 */
    } finally {
      setLoading(false)
    }
  }

  // 已经有有效登录态（含「记住我」静默续登）→ 点「员工登录」直接进后台，不再输密码。
  // 要换账号：在后台左下角点「登出」（会撤销本机的设备令牌）→ 回到本页。
  if (hasValidToken()) return <Navigate to="/dashboard" replace />

  return (
    <section className="login-section">
      <div className="login-form">
        <button type="button" className="back-button" onClick={() => {
          // 回公司官网首页（官网在 /home/，是独立 SPA，必须整页跳转）
          window.location.href = '/home/'
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
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/forgot-password') }}>忘记密码？</a>
          </div>
          <button type="submit" disabled={loading}>{loading ? '登入中…' : '登入'}</button>
        </form>
        <hr className="form-divider" />
        <div className="form-links" />
      </div>
    </section>
  )
}
