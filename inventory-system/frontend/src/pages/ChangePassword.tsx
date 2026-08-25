import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { changePassword } from '../api'

/**
 * 首次登录重设密码页（临时密码登录后被强制跳转到这里）
 * 校验旧密码（临时密码）→ 设置自己的新密码 → 清除 is_first_login
 */
export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const logout = () => {
    localStorage.removeItem('inv_token')
    navigate('/login', { replace: true })
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oldPassword || !newPassword || !confirm) return
    if (newPassword.length < 6) { message.error('新密码至少 6 位'); return }
    if (newPassword !== confirm) { message.error('两次输入的新密码不一致'); return }
    if (newPassword === oldPassword) { message.error('新密码不能与当前密码相同'); return }
    setLoading(true)
    try {
      await changePassword({ oldPassword, newPassword })
      message.success('密码已更新，请使用新密码登录')
      navigate('/', { replace: true })
    } catch (err: any) {
      // 拦截器已提示业务错误；这里补兜底
      if (!err?.message) message.error('重设密码失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="login-section">
      <div className="login-form">
        <h2>重设密码</h2>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 18px', lineHeight: 1.6 }}>
          首次登录，请设置您自己的密码。<br />当前密码为您收到的<strong>临时密码</strong>。
        </p>
        <form onSubmit={onSubmit}>
          <label className="input-label" htmlFor="old">当前密码（临时密码）</label>
          <div className="password-container">
            <input id="old" type={visible ? 'text' : 'password'} required autoFocus
              value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
          </div>
          <label className="input-label" htmlFor="new">新密码（至少 6 位）</label>
          <div className="password-container">
            <input id="new" type={visible ? 'text' : 'password'} required
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <label className="input-label" htmlFor="confirm">确认新密码</label>
          <div className="password-container">
            <input id="confirm" type={visible ? 'text' : 'password'} required
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <img className="eye-icon" src="/static/images/眼睛.png" alt="显示密码"
              onClick={() => setVisible(!visible)} style={{ cursor: 'pointer' }} />
          </div>
          <button type="submit" disabled={loading} style={{ marginTop: 20 }}>
            {loading ? '提交中…' : '确认修改'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); logout() }} style={{ color: '#999', fontSize: 13 }}>
            退出登录，稍后再改
          </a>
        </div>
      </div>
    </section>
  )
}
