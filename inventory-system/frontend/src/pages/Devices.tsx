import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message, Modal } from 'antd'
import { getDevices, revokeDevice, revokeOtherDevices } from '../api'
import { clearSession, getDeviceId, getDeviceToken } from '../utils/authToken'
import type { DeviceItem } from '../types'

/**
 * 登录设备（2026-10-28，「记住我 = 记住这台设备」，WhatsApp 式的设备管理）
 *
 * 勾选「记住我」登录后，这台设备可以在 90 天内免密码进入后台（每次使用自动续期）。
 * 这里能看见「哪些设备被记住了」，并可单独撤销 —— 手机丢了、在别人电脑上登过，
 * 就在这里把它踢下线（撤销后那台设备下次打开就要重新输密码）。
 *
 * 撤销「当前设备」= 等于登出，会清掉本机凭据并回登录页。
 */
function fmtTime(ms?: number | null): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtAgo(ms?: number | null): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return fmtTime(ms)
}

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #f0e6dc',
  borderRadius: 16,
  padding: '16px 18px',
  marginBottom: 12,
  display: 'flex',
  gap: 14,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  boxShadow: '0 3px 12px rgba(255, 92, 0, 0.06)',
}

const MUTED: React.CSSProperties = { color: '#9ca3af', fontSize: 12.5 }

export default function Devices() {
  const navigate = useNavigate()
  const [list, setList] = useState<DeviceItem[] | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)

  const load = useCallback(async () => {
    try {
      setList(await getDevices())
    } catch {
      setList([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** 撤销某一台；如果是当前设备 → 等同登出 */
  const revokeOne = (d: DeviceItem) => {
    const isCurrent = d.current || (getDeviceId() != null && getDeviceId() === d.id)
    Modal.confirm({
      title: isCurrent ? '撤销这台设备（等于登出）？' : `撤销「${d.name || '这台设备'}」？`,
      content: isCurrent
        ? '撤销后本机会立即退出登录，需要重新输入密码。'
        : '撤销后那台设备下次打开后台需要重新输入密码，其它设备不受影响。',
      okText: '撤销',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setBusyId(d.id)
        try {
          await revokeDevice(d.id)
          message.success('已撤销')
          if (isCurrent) {
            clearSession()
            navigate('/login', { replace: true })
            return
          }
          await load()
        } catch {
          /* 拦截器已提示 */
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const revokeOthers = () => {
    Modal.confirm({
      title: '撤销其它所有设备？',
      content: '除当前这台设备外，其它记住过的设备都需要重新输入密码。',
      okText: '全部撤销',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setRevokingOthers(true)
        try {
          const n = await revokeOtherDevices(getDeviceToken())
          message.success(n > 0 ? `已撤销 ${n} 台设备` : '没有其它设备需要撤销')
          await load()
        } catch {
          /* 拦截器已提示 */
        } finally {
          setRevokingOthers(false)
        }
      },
    })
  }

  const others = (list || []).filter((d) => !(d.current || (getDeviceId() != null && getDeviceId() === d.id)))

  return (
    <div style={{ padding: '4px 2px 40px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#374151' }}>登录设备</h2>
        <button
          type="button"
          onClick={revokeOthers}
          disabled={revokingOthers || others.length === 0}
          style={{
            border: '1px solid #ff5c00', background: '#fff', color: '#ff5c00',
            borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: 600,
            cursor: others.length === 0 ? 'not-allowed' : 'pointer',
            opacity: others.length === 0 ? 0.45 : 1,
          }}
        >
          {revokingOthers ? '撤销中…' : '撤销其它所有设备'}
        </button>
      </div>
      <p style={{ margin: '0 0 18px', ...MUTED, lineHeight: 1.7 }}>
        勾选「记住我」登录的设备，<b>90 天内</b>可以免密码进入后台（每次使用自动续期）。
        在公用电脑或丢失的手机上，点「撤销」即可让它下次必须重新登录。
      </p>

      {list === null && <div style={{ ...MUTED, padding: '24px 4px' }}>正在加载…</div>}

      {list !== null && list.length === 0 && (
        <div style={{ ...CARD, flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 18px' }}>
          <div style={{ fontSize: 34, lineHeight: 1 }}>💻</div>
          <div style={{ fontWeight: 600, color: '#374151' }}>还没有记住的设备</div>
          <div style={MUTED}>在登录页勾选「记住我」后，这台设备就会出现在这里。</div>
        </div>
      )}

      {(list || []).map((d) => {
        const isCurrent = d.current || (getDeviceId() != null && getDeviceId() === d.id)
        return (
          <div key={d.id} style={CARD}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, flex: '0 0 auto',
              background: isCurrent ? '#fff2e8' : '#f5f5f5',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>
              {/iphone|ipad|android|mobile/i.test(d.name || '') ? '📱' : '💻'}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{d.name || '未知设备'}</span>
                {isCurrent && (
                  <span style={{ background: '#ff5c00', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                    当前设备
                  </span>
                )}
              </div>
              <div style={{ ...MUTED, marginTop: 6, lineHeight: 1.8 }}>
                最后活跃：{fmtAgo(d.lastSeenMs)}（{fmtTime(d.lastSeenMs)}）
                <br />
                登录时间：{fmtTime(d.createdAtMs)}
                {d.ip ? `　·　IP：${d.ip}` : ''}
                <br />
                免登录有效期至：{fmtTime(d.expiresAtMs)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => revokeOne(d)}
              disabled={busyId === d.id}
              style={{
                border: '1px solid #f0c9b0', background: '#fff', color: '#c2410c',
                borderRadius: 18, padding: '6px 14px', fontSize: 13, fontWeight: 600,
                cursor: busyId === d.id ? 'default' : 'pointer', alignSelf: 'center',
              }}
            >
              {busyId === d.id ? '撤销中…' : '撤销'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
