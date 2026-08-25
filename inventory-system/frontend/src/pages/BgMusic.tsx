import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteBgMusic, getBgMusic, uploadBgMusic, type BgMusicInfo } from '../api'
import '../styles/media.css'

/**
 * 背景音乐管理（精确对齐线上 bgmusicupload.php 的结构与视觉）
 * 标题 + 面包屑 + alert + music-section（上传框 / 当前音乐信息网格 / 播放器 / 上传删除按钮）
 */
const ALLOWED_AUDIO = /\.(mp3|wav|ogg|m4a)$/i
const ALLOWED_AUDIO_MIME = ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/mpeg', 'audio/x-m4a']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export default function BgMusic() {
  const navigate = useNavigate()
  const [music, setMusic] = useState<BgMusicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    getBgMusic().then(setMusic).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!ALLOWED_AUDIO.test(file.name) && !ALLOWED_AUDIO_MIME.includes(file.type)) {
      setAlert({ type: 'error', msg: '请选择有效的音频文件（MP3, WAV, OGG, M4A）' })
      return
    }
    if (file.size > MAX_SIZE) {
      setAlert({ type: 'error', msg: '文件大小不能超过 10MB' })
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
      setAlert({ type: 'error', msg: '请先选择要上传的音乐文件' })
      return
    }
    try {
      const info = await uploadBgMusic(selectedFile)
      setMusic(info)
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      setAlert({ type: 'success', msg: '音乐文件上传成功！' })
    } catch { /* 拦截器已提示 */ }
  }
  const remove = async () => {
    if (!window.confirm('确定要删除当前音乐文件吗？文件将被永久删除。')) return
    try {
      await deleteBgMusic()
      setMusic(null)
      setAlert({ type: 'success', msg: '音乐文件已删除！' })
    } catch { /* 拦截器已提示 */ }
  }

  return (
    <div>
      <div className="header page-upload-header">
        <h1 className="page-upload-title">背景音乐管理</h1>
      </div>

      <div className="page-breadcrumb">
        <a onClick={() => navigate('/')}>仪表板</a> &gt;
        <a onClick={() => navigate('/media')}>媒体管理</a> &gt;
        <span>背景音乐</span>
      </div>

      <div className="content">
        {alert && <div className={'alert alert-' + alert.type}>{alert.msg}</div>}

        <div className="music-section">
          <h2 className="music-section-title">
            <span className="music-icon">🎵</span>
            网站背景音乐设置
          </h2>

          <div className="upload-form">
            <div className="form-group">
              <label>上传音乐文件</label>
              <div
                className={'file-input' + (dragOver ? ' drag-over' : '')}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileRef} type="file" id="music-file" name="music_file" accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
                />
                <div className="file-input-text">
                  {selectedFile
                    ? <>🎵 已选择: {selectedFile.name}<br /><small>点击"上传新音乐"按钮完成上传</small></>
                    : <>🎵 点击选择音乐文件或拖拽到此处<br /><small>支持 MP3, WAV, OGG, M4A 格式 | 建议文件大小不超过 10MB</small></>}
                </div>
              </div>

              {loading ? (
                <div className="current-music"><strong>状态:</strong> 加载中...</div>
              ) : music?.exists ? (
                <div className="current-music">
                  <strong>当前音乐文件:</strong> {music.original_name}
                  <div className="music-info">
                    <div className="info-item"><div className="label">格式</div><div className="value">{music.format}</div></div>
                    <div className="info-item"><div className="label">文件大小</div><div className="value">{music.size_formatted}</div></div>
                    <div className="info-item"><div className="label">上传时间</div><div className="value">{music.updated}</div></div>
                    <div className="info-item"><div className="label">最后修改</div><div className="value">{music.modified}</div></div>
                  </div>
                  <div className="audio-player">
                    <audio controls preload="metadata">
                      <source src={music.url} />
                    </audio>
                  </div>
                </div>
              ) : (
                <div className="current-music"><strong>状态:</strong> 暂未上传背景音乐文件</div>
              )}
            </div>

            <div className="btn-group">
              <button type="submit" className="btn" onClick={upload} disabled={!selectedFile}>
                <i className="fas fa-upload" /> 上传新音乐
              </button>
              {music?.exists && (
                <button className="btn btn-danger" onClick={remove}>
                  <i className="fas fa-trash" /> 删除当前音乐
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
