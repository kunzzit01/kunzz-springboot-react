import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login as loginApi, getMe, getStockPerms } from '../api'
import { showToast } from '../utils/toast'
import '../styles/mobile-login.css'

/**
 * 手机用户专用登录页（1:1 对齐旧 /mobile/ch/login.html「登入 - KUNZZ HOLDINGS」+ login.css）：
 * phoneBG 背景 + 玻璃卡片 + 账号/密码（眼睛切换）+ 记住我开关 + 忘记密码 + 橙金渐变登入钮。
 * 登录成功后对齐旧 login.php 的 redirect 逻辑：
 *   ?redirect= 有值 → 直达；否则按 branch ∩ 权限树解析可用分店——单店直达 /mobile/out?system=jX、
 *   多分店（kh/多店）→ 大按钮分店选择、无分店权限 → 提示。
 */

const STORES = ['j1', 'j2', 'j3'] as const

export default function MobileLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState(() => localStorage.getItem('inv_remember') || '')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [choosing, setChoosing] = useState<string[] | null>(null)

  /** 过滤中文字符（对齐旧 login.html input 过滤） */
  const stripZh = (v: string) => v.replace(/[\u4e00-\u9fa5]/g, '')

  const go = (path: string) => {
    navigate(path, { replace: true })
  }

  /** 登录成功后：?redirect= 优先（对齐旧 login.php），否则解析有权限的分店 */
  const afterLogin = async () => {
    const redirect = searchParams.get('redirect')
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) { go(redirect); return }
    try {
      const [me, perms] = await Promise.all([getMe(), getStockPerms().catch(() => null)])
      const parts = (me.branch || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
      const branchAllowed = parts.includes('kh') ? [...STORES] : STORES.filter(s => parts.includes(s))
      const treeList = ((perms?.systems || []) as string[]).map(s => s.toLowerCase())
      const fallbackConfigured = (perms?.systems || []).length > 0 || (perms?.views || []).length > 0
      const configured = perms == null ? false : ((perms as any).configured ?? fallbackConfigured)
      const treeAllowed = !configured ? [...STORES] : STORES.filter(s => treeList.includes(s))
      const allowed = branchAllowed.filter(s => treeAllowed.includes(s))
      if (allowed.length === 1) go(`/mobile/out?system=${allowed[0]}`)
      else if (allowed.length > 1) setChoosing(allowed)
      else showToast('你的账号没有分店权限，请联系管理员', 'error')
    } catch { go('/mobile/out') }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      const res = await loginApi({ username, password })
      localStorage.setItem('inv_token', res.token)
      if (remember) localStorage.setItem('inv_remember', username)
      else localStorage.removeItem('inv_remember')
      if (res.mustChangePassword) {
        showToast('首次登录，请先在电脑端重设您的密码', 'warning')
        return
      }
      await afterLogin()
    } catch { /* 拦截器已提示 */ }
    finally { setLoading(false) }
  }

  return (
    <div className="moblogin-root">
      <section className="login-section">
        <div className="login-form">
          <h2>登入</h2>
          {choosing ? (
            <form onSubmit={e => e.preventDefault()}>
              <p className="branch-choose-title">请选择分店</p>
              {choosing.map(s => (
                <button key={s} type="button" className="branch-btn" onClick={() => go(`/mobile/out?system=${s}`)}>
                  {s.toUpperCase()}
                </button>
              ))}
              <button type="button" className="switch-account" onClick={() => { localStorage.removeItem('inv_token'); setChoosing(null) }}>
                切换账号
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmit}>
              <label htmlFor="m-username" className="input-label">账号</label>
              <input
                type="text"
                id="m-username"
                placeholder="邮箱、用户名或用户 ID"
                required
                value={username}
                onChange={e => setUsername(stripZh(e.target.value))}
                autoComplete="username"
              />
              <label htmlFor="m-password" className="input-label">密码</label>
              <div className="password-container">
                <input
                  type={visible ? 'text' : 'password'}
                  id="m-password"
                  placeholder="密码"
                  required
                  value={password}
                  onChange={e => setPassword(stripZh(e.target.value))}
                  autoComplete="current-password"
                />
                {/* 眼睛切换（对齐旧 eye.svg toggle） */}
                <svg className="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: visible ? '#000' : '#666' }}
                  onClick={() => setVisible(!visible)} aria-label="显示密码">
                  {visible ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </div>

              <div className="form-options">
                <label className="remember-me">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  记住我
                </label>
                <div className="forgot-password">
                  <a href="/change-password" onClick={e => { e.preventDefault(); showToast('忘记密码请联系管理员重置', 'info') }}>忘记密码？</a>
                </div>
              </div>
              <button type="submit" disabled={loading}>{loading ? '登入中…' : '登入'}</button>
            </form>
          )}
          <hr className="form-divider" />
        </div>
      </section>
    </div>
  )
}
