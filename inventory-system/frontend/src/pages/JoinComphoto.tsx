import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { getComphotos, uploadComphoto, deleteComphoto, type ComphotoSlot } from '../api'
import '../styles/timeline.css'

/** 我们的足迹照片管理（对齐线上 joinpage2upload.php：30 格照片网格 + Lightbox）
 *
 * 2026-10-23 修复（task 2026-10-23-comphoto-upload-fix）：
 *  1. HEIC 真的转成 JPG 再上传（此前文案写「HEIC 自动转换」但代码里没有任何转换，
 *     上传后浏览器显示不出图片）；
 *  2. 手机原图（几 MB）先在前端等比缩小 + 重编码，弱网也能传上去
 *     （配合后端 multipart 限制放宽到 30MB）；
 *  3. 新增显眼的「删除照片」按钮：原来自绘的小 ✕ 因为 .image-info 是绝对定位
 *     盖在图片底部，被压在下面基本点不到。
 */
const MAX_UPLOAD = 30 * 1024 * 1024
const MAX_RAW = 60 * 1024 * 1024 // 原文件超过这个连浏览器都吃紧，直接拒绝
const MAX_EDGE = 2560 // 长边上限，超过就等比缩小
const COMPRESS_OVER = 2 * 1024 * 1024 // 大于 2MB 才重编码
const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/*'

const isHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /^image\/hei[cf]/i.test(f.type)

/** HEIC/HEIF → JPEG（Chrome/Edge/Firefox 都不能直接显示 HEIC） */
async function heicToJpeg(file: File): Promise<File> {
  const mod: any = await import('heic2any')
  const convert = mod.default ?? mod
  const blob = await convert({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  const out: Blob = Array.isArray(blob) ? blob[0] : blob
  return new File([out], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
}

/** 大图等比缩小 + 转 JPEG，避免几 MB 的原图上传失败/卡顿 */
async function shrink(file: File): Promise<File> {
  if (!/^image\//.test(file.type)) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode-failed'))
      el.src = url
    })
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    if (scale === 1 && file.size <= COMPRESS_OVER) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // 透明底叠白底：JPEG 不支持透明，不填会变成黑底（PNG 带 alpha 的情况）
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function prepareImage(file: File): Promise<File> {
  let out = file
  if (isHeic(file)) out = await heicToJpeg(file)
  try {
    out = await shrink(out)
  } catch {
    /* 缩图失败就用原文件，交给后端限制兜底 */
  }
  return out
}

export default function JoinComphoto() {
  const navigate = useNavigate()
  const [data, setData] = useState<{ total: number; uploaded: number; pending: number; photos: ComphotoSlot[] } | null>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [busy, setBusy] = useState<Record<number, string>>({})
  const [deleting, setDeleting] = useState<Record<number, boolean>>({})
  const [lightbox, setLightbox] = useState('')
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const load = useCallback(() => {
    getComphotos().then(setData).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const setStatus = (n: number, text: string) => setBusy(prev => ({ ...prev, [n]: text }))

  const doUpload = async (n: number, file?: File) => {
    if (!file) return
    if (!/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)) {
      message.error('只支持图片格式（JPG、PNG、WebP、HEIC）！')
      return
    }
    if (file.size > MAX_RAW) { message.error('这张图太大了（超过 60MB），请先在手机上压缩后再传'); return }
    try {
      setStatus(n, isHeic(file) ? 'HEIC 转换中...' : '处理中...')
      const prepared = await prepareImage(file)
      if (prepared.size > MAX_UPLOAD) {
        message.error('图片处理后仍超过 30MB，请换一张')
        return
      }
      setStatus(n, '上传中...')
      await uploadComphoto(n, prepared)
      setAlert({ type: 'success', msg: `照片 #${n} 上传成功！` })
      load()
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'decode-failed' || msg?.includes('HEIC')) {
        setAlert({ type: 'error', msg: 'HEIC 转换失败，请在手机上选择「兼容性最佳 / 最兼容」格式再拍，或先转成 JPG 后上传' })
      }
      /* 其余错误（后端业务提示、网络）由请求拦截器提示 */
    } finally {
      setStatus(n, '')
      if (fileRefs.current[n]) fileRefs.current[n]!.value = ''
    }
  }

  const doDelete = async (n: number) => {
    if (!window.confirm(`确定要删除照片 #${n} 吗？文件将被永久删除。`)) return
    setDeleting(prev => ({ ...prev, [n]: true }))
    try {
      await deleteComphoto(n)
      setAlert({ type: 'success', msg: `照片 #${n} 已删除` })
      load()
    } catch { /* 拦截器已提示 */ } finally {
      setDeleting(prev => ({ ...prev, [n]: false }))
    }
  }

  return (
    <div>
      <div className="header page-upload-header">
        <h1 className="page-upload-title">我们的足迹照片管理</h1>
      </div>

      <div className="page-breadcrumb">
        <a onClick={() => navigate('/')}>仪表板</a> &gt;
        <a onClick={() => navigate('/media')}>媒体管理</a> &gt;
        <span>我们的足迹照片</span>
      </div>

      <div className="content">
        {alert && <div className={'alert alert-' + alert.type}>{alert.msg}</div>}

        <div className="stats-bar">
          <div className="stats-item">总照片数: <span className="stats-number">{data?.total ?? 30}</span></div>
          <div className="stats-item">已上传: <span className="stats-number">{data?.uploaded ?? 0}</span></div>
          <div className="stats-item">待上传: <span className="stats-number">{data?.pending ?? 30}</span></div>
        </div>

        <h2 className="section-title">照片上传管理</h2>

        <div className="photos-grid">
          {(data?.photos ?? Array.from({ length: 30 }, (_, i) => ({ number: i + 1, exists: false }))).map((slot) => (
            <div className="photo-card" key={slot.number}>
              <div className="photo-header">
                <div className="photo-number">{slot.number}</div>
                <div className="photo-title">照片 #{slot.number}</div>
              </div>

              {slot.exists && (
                <div className="current-image">
                  <img src={slot.url} alt={`照片 ${slot.number}`} onClick={() => setLightbox(slot.url || '')} />
                  <button className="delete-btn" title="删除照片" disabled={deleting[slot.number]}
                    onClick={() => doDelete(slot.number)}>✕</button>
                  <div className="image-info">
                    <strong>已上传</strong>
                    <br />
                    <small>更新: {slot.updated}</small>
                  </div>
                </div>
              )}

              <div className="file-input" onClick={() => fileRefs.current[slot.number]?.click()}>
                <input ref={(el) => { fileRefs.current[slot.number] = el }} type="file" accept={ACCEPT} style={{ display: 'none' }}
                  disabled={!!busy[slot.number]}
                  onChange={(e) => { doUpload(slot.number, e.target.files?.[0]); e.target.value = '' }} />
                <div className="file-input-text">
                  {busy[slot.number] || '点击选择图片'}
                  <br />
                  <small>支持 JPG, PNG, WebP, HEIC（自动转 JPG）</small>
                </div>
              </div>

              <div className="photo-actions">
                <button className="upload-btn" disabled={!!busy[slot.number]} onClick={() => fileRefs.current[slot.number]?.click()}>
                  {busy[slot.number] || (slot.exists ? '更新照片' : '上传照片')}
                </button>
                {slot.exists && (
                  <button className="delete-photo-btn" disabled={deleting[slot.number]} onClick={() => doDelete(slot.number)}>
                    {deleting[slot.number] ? '删除中...' : '删除照片'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {lightbox && (
        <div className="photo-lightbox" onClick={() => setLightbox('')}>
          <span className="photo-lightbox-close" onClick={() => setLightbox('')}>✕</span>
          <img src={lightbox} alt="查看照片" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
