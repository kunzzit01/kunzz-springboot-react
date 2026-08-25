import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { getComphotos, uploadComphoto, deleteComphoto, type ComphotoSlot } from '../api'
import '../styles/timeline.css'

/** 我们的足迹照片管理（对齐线上 joinpage2upload.php：30 格照片网格 + Lightbox） */
export default function JoinComphoto() {
  const navigate = useNavigate()
  const [data, setData] = useState<{ total: number; uploaded: number; pending: number; photos: ComphotoSlot[] } | null>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [uploading, setUploading] = useState<Record<number, boolean>>({})
  const [lightbox, setLightbox] = useState('')
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const load = useCallback(() => {
    getComphotos().then(setData).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const doUpload = async (n: number, file?: File) => {
    if (!file) return
    if (!/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)) {
      message.error('只支持图片格式（JPG, PNG, WebP）！')
      return
    }
    if (file.size > 10 * 1024 * 1024) { message.error('文件大小超过10MB限制！'); return }
    setUploading(prev => ({ ...prev, [n]: true }))
    try {
      await uploadComphoto(n, file)
      setAlert({ type: 'success', msg: `照片 #${n} 上传成功！` })
      load()
    } catch { /* 拦截器已提示 */ } finally {
      setUploading(prev => ({ ...prev, [n]: false }))
      if (fileRefs.current[n]) fileRefs.current[n]!.value = ''
    }
  }

  const doDelete = async (n: number) => {
    if (!window.confirm(`确定要删除照片 #${n} 吗？文件将被永久删除。`)) return
    try {
      await deleteComphoto(n)
      setAlert({ type: 'success', msg: `照片 #${n} 已成功删除！` })
      load()
    } catch { /* 拦截器已提示 */ }
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
                  <button className="delete-btn" title="删除照片" onClick={() => doDelete(slot.number)}>✕</button>
                  <div className="image-info">
                    <strong>已上传</strong>
                    <br />
                    <small>更新: {slot.updated}</small>
                  </div>
                </div>
              )}

              <div className="file-input" onClick={() => fileRefs.current[slot.number]?.click()}>
                <input ref={(el) => { fileRefs.current[slot.number] = el }} type="file" accept="image/*" style={{ display: 'none' }}
                  disabled={uploading[slot.number]}
                  onChange={(e) => { doUpload(slot.number, e.target.files?.[0]); e.target.value = '' }} />
                <div className="file-input-text">
                  {uploading[slot.number] ? '上传中...' : '点击选择图片'}
                  <br />
                  <small>支持 JPG, PNG, WebP（HEIC 自动转换）</small>
                </div>
              </div>

              <button className="upload-btn" disabled={uploading[slot.number]} onClick={() => fileRefs.current[slot.number]?.click()}>
                {slot.exists ? '更新照片' : '上传照片'}
              </button>
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
