import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { forgotPassword, resetPassword } from '../api'

/**
 * 忘记密码页（公开，无需登录）：输入邮箱 → 收 6 位验证码 → 设新密码
 * 后端限制：验证码 10 分钟有效；同一邮箱 60 秒才能重发一次；连续输错 5 次该验证码作废
 */
export default function ForgotPassword() {
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const navigate = useNavigate()

  // 重发倒计时（与后端 60 秒冷却保持一致）
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const sendCode = async () => {
    const addr = email.trim()
    if (!addr) { message.error('请输入邮箱'); return }
    setLoading(true)
    try {
      await forgotPassword({ email: addr })
      setCooldown(60)
      setStep('reset')
      message.success('验证码已发送，请查收邮箱（若没收到请看看垃圾邮件）')
    } catch {
      /* 拦截器已提示（未注册邮箱 / 发送过于频繁 / 邮件发不出去） */
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 'email') { await sendCode(); return }
    if (!code.trim()) { message.error('请输入验证码'); return }
    if (newPassword.length < 6) { message.error('新密码至少 6 位'); return }
    if (newPassword !== confirm) { message.error('两次输入的新密码不一致'); return }
    setLoading(true)
    try {
      await resetPassword({ email: email.trim(), code: code.trim(), newPassword })
      message.success('密码已重设，请使用新密码登入')
      navigate('/login', { replace: true })
    } catch {
      /* 拦截器已提示（验证码错误/过期/作废） */
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="login-section">
      <div className="login-form">
        <button type="button" className="back-button" onClick={() => navigate('/login')} aria-label="返回登入">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2>忘记密码</h2>

        {step === 'email' ? (
          <>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 6px', lineHeight: 1.6 }}>
              请输入您绑定系统账号的邮箱，我们会寄一组 <strong>6 位验证码</strong> 给您。
            </p>
            <form onSubmit={onSubmit}>
              <label className="input-label" htmlFor="fp-email">邮箱</label>
              <input id="fp-email" type="text" inputMode="email" autoComplete="email" placeholder="name@example.com"
                required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" disabled={loading} style={{ marginTop: 22 }}>
                {loading ? '发送中…' : '发送验证码'}
              </button>
            </form>
            <p style={{ marginTop: 16, fontSize: 12.5, color: '#999', lineHeight: 1.7 }}>
              忘记绑定哪个邮箱、或收不到验证码，请联系管理员协助重置。
            </p>
          </>
        ) : (
          <>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 6px', lineHeight: 1.6 }}>
              验证码已发送至 <strong style={{ color: '#ff5c00' }}>{email.trim()}</strong>，
              <strong>10 分钟内</strong>有效，请一并输入您要设置的新密码。
            </p>
            <form onSubmit={onSubmit}>
              <label className="input-label" htmlFor="fp-code">验证码（6 位数字）</label>
              <input id="fp-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                placeholder="000000" required autoFocus
                style={{ letterSpacing: 6, fontSize: 18, fontWeight: 700 }}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />

              <label className="input-label" htmlFor="fp-new">新密码（至少 6 位）</label>
              <div className="password-container">
                <input id="fp-new" type={visible ? 'text' : 'password'} required
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>

              <label className="input-label" htmlFor="fp-confirm">确认新密码</label>
              <div className="password-container">
                <input id="fp-confirm" type={visible ? 'text' : 'password'} required
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <img className="eye-icon" src="/static/images/眼睛.png" alt="显示密码"
                  onClick={() => setVisible(!visible)} style={{ cursor: 'pointer' }} />
              </div>

              <button type="submit" disabled={loading} style={{ marginTop: 22 }}>
                {loading ? '提交中…' : '确认修改'}
              </button>
            </form>
            <div className="form-options" style={{ marginBottom: 0 }}>
              <a href="#" style={{ color: cooldown > 0 ? '#bbb' : undefined }}
                onClick={(e) => { e.preventDefault(); if (cooldown === 0 && !loading) sendCode() }}>
                {cooldown > 0 ? `重新发送（${cooldown}s）` : '重新发送验证码'}
              </a>
              <a href="#" style={{ color: '#999' }}
                onClick={(e) => { e.preventDefault(); setCode(''); setStep('email') }}>
                换一个邮箱
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
