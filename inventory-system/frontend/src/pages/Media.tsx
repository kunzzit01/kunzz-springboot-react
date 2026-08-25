import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteMedia, getMediaList, getPageImages, uploadMedia, type PageMediaInfo } from '../api'
import '../styles/media.css'

/**
 * 媒体管理总览：媒体文件列表 + 页面媒体总览网格
 * （背景音乐 / 各页面上传已独立为 /media/music、/media/:key，对齐线上 bgmusicupload.php、homepage1upload.php 等）
 */
const pageKeys: [string, string][] = [
  ['homepage1', '首页 · 第一页'], ['about1', '关于我们 · 第一页'], ['about4', '关于我们 · 第四页'],
  ['tokyo1', 'Tokyo · 第一页'], ['tokyo2', 'Tokyo · 第二页'], ['tokyo3', 'Tokyo · 第三页'], ['tokyo5', 'Tokyo · 第五页'],
  ['join1', '加入我们 · 第一页'], ['join2', '加入我们 · 第二页'], ['join3', '加入我们 · 第三页'],
]

export default function Media() {
  const [tab, setTab] = useState<'files' | 'pages'>('files')
  const [files, setFiles] = useState<{ name: string; url: string }[]>([])
  const [pageImages, setPageImages] = useState<Record<string, PageMediaInfo>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const load = useCallback(() => {
    Promise.all([getMediaList(), getPageImages()])
      .then(([f, p]) => { setFiles(f); setPageImages(p) })
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const onUpload = async (file: File | undefined) => {
    if (!file) return
    try {
      await uploadMedia(file)
      load()
    } catch { /* 拦截器已提示 */ }
  }

  const renderPreview = (info?: PageMediaInfo) => {
    if (!info) {
      return <div className="preview-image preview-empty" style={{ minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: 8, color: '#999', fontSize: 12 }}>未上传</div>
    }
    return info.type === 'video'
      ? <video className="preview-video" controls src={info.url} />
      : <img className="preview-image" src={info.url} alt="" />
  }

  return (
    <div>
      <div className="kz-page-title">
        <span>媒体管理</span>
        <span className="sub">背景音乐、页面媒体与媒体文件</span>
      </div>
      <div className="kz-card">
        <div className="kz-filter-bar">
          <button className={'btn ' + (tab === 'files' ? 'btn-primary' : 'btn-default')} onClick={() => setTab('files')}>媒体文件</button>
          <button className={'btn ' + (tab === 'pages' ? 'btn-primary' : 'btn-default')} onClick={() => setTab('pages')}>页面媒体</button>
        </div>

        {/* ---------- 媒体文件 ---------- */}
        {tab === 'files' && (
          <div>
            <div className="kz-filter-bar">
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = '' }} />
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}><i className="fas fa-upload" /> 上传文件</button>
            </div>
            <table className="kz-table">
              <thead><tr><th>文件名</th><th>操作</th></tr></thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.name}>
                    <td><a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#ff5c00' }}>{f.name}</a></td>
                    <td><button className="btn btn-danger" style={{ padding: '3px 10px' }} onClick={async () => { await deleteMedia(f.name); load() }}>删除</button></td>
                  </tr>
                ))}
                {files.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无媒体文件</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* ---------- 页面媒体总览（各页独立管理） ---------- */}
        {tab === 'pages' && (
          <div className="kz-upload-grid">
            {pageKeys.map(([key, label]) => {
              const info = pageImages[key]
              return (
                <div key={key} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{label}</div>
                  {renderPreview(info)}
                  {info && (
                    <div style={{ fontSize: 12, color: '#888', margin: '6px 0' }}>
                      类型: {info.type === 'video' ? 'video' : 'image'} | 更新: {info.updated}
                    </div>
                  )}
                  <button className="btn btn-default" style={{ width: '100%', marginTop: 8 }} onClick={() => navigate('/media/' + key)}><i className="fas fa-edit" /> 管理此页</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
