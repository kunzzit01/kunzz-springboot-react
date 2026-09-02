import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login as loginApi, getMe, getStockPerms } from '../api'
import { showToast } from '../utils/toast'
import '../styles/mobile-stocklist.css'

/**
 * 手机用户专用登录页（对齐旧 /mobile/ch/login.html「登入 - KUNZZ HOLDINGS」+ login.php 跳转逻辑）
 * 登录成功后自动去到用户有权限的分店电话版（/mobile/out?system=jX）：
 *   单一分店 → 直达；多分店（kh/多店）→ 大按钮分店选择；无分店权限 → 提示。
 * 支持 ?redirect= 参数（对齐旧 login.php?redirect=stocklistjX.php）。
 */

const STORES = ['j1', 'j2', 'j3'] as const

export default function MobileLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState(() => localStorage.getItem('inv_remember') || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [choosing, setChoosing] = useState<string[] | null>(null)

  const go = (path: string) => {
    showToast('欢迎回来！')
    navigate(path, { replace: true })
  }

  /** 登录成功后：解析有权限的分店 → 单店直达 / 多店选择 */
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
      localStorage.setItem('inv_remember', username)
      if (res.mustChangePassword) {
        showToast('首次登录，请先在电脑端重设您的密码', 'warning')
        return
      }
      await afterLogin()
    } catch { /* 拦截器已提示 */ }
    finally { setLoading(false) }
  }

  return (
    <div className="msl-page msl-login-page">
      <div className="msl-login-card">
        <div className="msl-login-brand">KUNZZ HOLDINGS</div>
        <h1 className="msl-login-title">登入</h1>
        {choosing ? (
          <>
            <p className="msl-login-sub">请选择你的分店</p>
            <div className="msl-login-branches">
              {choosing.map(s => (
                <button key={s} className="msl-login-branch-btn" onClick={() => go(`/mobile/out?system=${s}`)}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="msl-login-switch" onClick={() => { localStorage.removeItem('inv_token'); setChoosing(null) }}>切换账号</button>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="msl-login-label" htmlFor="m-username">账号</label>
            <input id="m-username" type="text" placeholder="邮箱、用户名或用户 ID" required
              value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
            <label className="msl-login-label" htmlFor="m-password">密码</label>
            <input id="m-password" type="password" placeholder="请输入密码" required
              value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            <button type="submit" className="msl-login-btn" disabled={loading}>
              {loading ? '登入中…' : '登入'}
            </button>
          </form>
        )}
      </div>
      <div className="msl-login-foot">KUNZZ HOLDINGS · 库存管理</div>
    </div>
  )
}
