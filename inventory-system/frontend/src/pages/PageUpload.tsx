import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPageImages, uploadPageImage, type PageMediaInfo } from '../api'
import '../styles/media.css'

/**
 * 页面媒体上传（精确对齐线上 homepage1upload.php 的结构与视觉）
 * 标题 + 面包屑 + alert 提示条 + media-section（上传框 / 当前文件预览 / 上传按钮）
 */
const PAGE_META: Record<string, { title: string; breadcrumb: string; section: string; label: string; accept?: string }> = {
  homepage1: { title: '首页媒体管理', breadcrumb: '首页媒体', section: '首页第一页背景视频', label: '上传背景视频/图片' },
  about1:    { title: '关于我们页面管理', breadcrumb: '关于我们媒体', section: '关于我们页面封面背景视频/图片', label: '上传背景视频/图片' },
  tokyo1:    { title: '旗下品牌媒体管理', breadcrumb: '旗下品牌媒体', section: 'Tokyo Cuisine 第一页背景', label: '上传背景视频/图片' },
  tokyo2:    { title: '旗下品牌媒体管理', breadcrumb: '旗下品牌媒体', section: 'Tokyo Cuisine 第二页背景', label: '上传背景视频/图片' },
  tokyo3:    { title: '旗下品牌媒体管理', breadcrumb: '旗下品牌媒体', section: 'Tokyo Cuisine 第三页背景', label: '上传背景视频/图片' },
  tokyo5:    { title: '旗下品牌媒体管理', breadcrumb: '旗下品牌媒体', section: 'Tokyo Cuisine 第五页背景', label: '上传背景视频/图片' },
  join1:     { title: '加入我们页面管理', breadcrumb: '加入我们媒体', section: '加入我们页面封面背景图片', label: '上传背景图片', accept: 'image/*' },
}

const ALLOWED_PAGE = /\.(mp4|webm|mov|avi|jpg|jpeg|png|webp|heic|heif)$/i
const ALLOWED_IMAGE = /\.(jpg|jpeg|png|webp|heic|heif)$/i
const HINT = '支持 MP4, WebM, MOV, AVI, JPG, PNG, WebP 格式（HEIC 自动转换）(1920x1080)'
const HINT_IMAGE = '支持 JPG, PNG, WebP 格式（HEIC 自动转换）'

export default function PageUpload() {
  const { key = 'homepage1' } = useParams()
  const navigate = useNavigate()
  const meta = PAGE_META[key] || PAGE_META.homepage1
  const [info, setInfo] = useState<PageMediaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    getPageImages()
      .then((map) => setInfo(map[key] || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [key])

  useEffect(() => { load() }, [load])

  const pick = (file: File | undefined) => {
    if (!file) return
    const imageOnly = meta.accept === 'image/*'
    if (!(imageOnly ? ALLOWED_IMAGE : ALLOWED_PAGE).test(file.name)) {
      setAlert({ type: 'error', msg: imageOnly ? '只支持图片格式（JPG, PNG, WebP）！' : '不支持的文件类型！请上传 MP4、WebM、MOV、AVI 视频或 JPG、PNG、WebP 图片。' })
      return
    }
    setSelectedFile(file)
    setAlert(null)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    pick(e.dataTransfer.files?.[0])
  }
  const upload = async () => {
    if (!selectedFile) {
      setAlert({ type: 'error', msg: '请先选择要上传的文件' })
      return
    }
    try {
      const res = await uploadPageImage(key, selectedFile)
      setInfo({ url: res.url, type: res.type, updated: new Date().toLocaleString() })
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      setAlert({ type: 'success', msg: '文件上传成功！' })
    } catch { /* 拦截器已提示 */ }
  }

  const fileName = info?.url.split('/').pop()?.split('?')[0] || ''

  return (
    <div>
      <div className="header page-upload-header">
        <h1 className="page-upload-title">{meta.title}</h1>
      </div>

      <div className="page-breadcrumb">
        <a onClick={() => navigate('/')}>仪表板</a> &gt;
        <a onClick={() => navigate('/media')}>媒体管理</a> &gt;
        <span>{meta.breadcrumb}</span>
      </div>

      <div className="content">
        {alert && <div className={'alert alert-' + alert.type}>{alert.msg}</div>}

        <div className="media-section">
          <h2>{meta.section}</h2>

          <div className="upload-form">
            <div className="form-group">
              <label>{meta.label}</label>
              <div
                className={'file-input' + (dragOver ? ' drag-over' : '')}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileRef} type="file" id={key + '-file'} name="media_file" accept={meta.accept || 'video/*,image/*'}
                  style={{ display: 'none' }}
                  onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
                />
                <div className="file-input-text">
                  {selectedFile
                    ? <>已选择: {selectedFile.name}</>
                    : <>点击选择文件或拖拽到此处<br /><small>{meta.accept === 'image/*' ? HINT_IMAGE : HINT}</small></>}
                </div>
              </div>

              {!loading && info && (
                <div className="current-file">
                  <strong>当前文件:</strong> {fileName}
                  <br />
                  <small>类型: {info.type === 'video' ? 'video' : 'image'} | 更新时间: {info.updated}</small>
                  <div className="preview-container">
                    {info.type === 'video'
                      ? <video className="preview-video" controls><source src={info.url} /></video>
                      : <img className="preview-image" src={info.url} alt="当前背景" />}
                  </div>
                </div>
              )}
            </div>

            <button type="submit" className="btn" onClick={upload} disabled={!selectedFile}>
              <i className="fas fa-upload" /> 上传文件
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
