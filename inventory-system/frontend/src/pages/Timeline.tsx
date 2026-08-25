import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message, Modal, Input, InputNumber } from 'antd'
import {
  getTimeline, addTimeline, updateTimeline, uploadTimelinePhoto, deleteTimeline,
  type TimelineItem,
} from '../api'
import '../styles/timeline.css'

/** 发展历史管理（对齐线上 aboutpage4upload.php：年份 tab + 记录条目 + 照片上传/删除） */
const MONTHS_ZH = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const MONTHS_EN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Timeline() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [items, setItems] = useState<TimelineItem[]>([])
  const [activeYear, setActiveYear] = useState('')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear())
  const [newMonth, setNewMonth] = useState<number>(1)
  const [editDraft, setEditDraft] = useState<Record<string, { title: string; description1: string; description2: string; month: number }>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  const isEn = lang === 'en'
  const t = (zh: string, en: string) => (isEn ? en : zh)

  const load = useCallback((l: 'zh' | 'en') => {
    getTimeline(l).then((d) => {
      setItems(d.items)
      const years = [...new Set(d.items.map((it) => String(it.year ?? '')))].sort((a, b) => Number(a) - Number(b))
      setActiveYear((prev) => (years.includes(prev) ? prev : (years[0] || '')))
    }).catch(() => {})
  }, [])

  useEffect(() => { load(lang) }, [lang, load])

  const years = [...new Set(items.map((it) => String(it.year ?? '')))].sort((a, b) => Number(a) - Number(b))
  const yearItems = items.filter((it) => String(it.year) === activeYear)

  const doAdd = async () => {
    if (saving) return
    if (!newYear || !newMonth) { message.warning(t('请填写年份和月份', 'Please enter year and month')); return }
    setSaving(true)
    try {
      await addTimeline(lang, newYear, newMonth)
      setAddOpen(false)
      setAlert({ type: 'success', msg: t('新增记录成功！', 'Record added successfully!') })
      load(lang)
    } catch { /* 拦截器已提示 */ }
    finally { setSaving(false) }
  }

  const doSave = async (it: TimelineItem) => {
    if (saving) return
    const d = editDraft[String(it.id)] || {}
    setSaving(true)
    try {
      await updateTimeline(String(it.id), lang, {
        title: d.title ?? it.title ?? '',
        description1: d.description1 ?? it.description1 ?? '',
        description2: d.description2 ?? it.description2 ?? '',
        month: d.month ?? it.month ?? 1,
      })
      setAlert({ type: 'success', msg: t('保存成功！', 'Saved successfully!') })
      load(lang)
    } catch { /* 拦截器已提示 */ }
    finally { setSaving(false) }
  }

  const doUploadPhoto = async (it: TimelineItem, file?: File) => {
    if (!file) return
    if (!/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)) {
      message.error(t('只支持图片格式（JPG, PNG, WebP）！', 'Only image formats supported (JPG, PNG, WebP)!'))
      return
    }
    if (file.size > 10 * 1024 * 1024) { message.error(t('文件大小超过10MB限制！', 'File size exceeds 10MB limit!')); return }
    setUploading(prev => ({ ...prev, [String(it.id)]: true }))
    try {
      await uploadTimelinePhoto(String(it.id), lang, file)
      setAlert({ type: 'success', msg: t('照片上传成功！', 'Photo uploaded successfully!') })
      load(lang)
    } catch { /* 拦截器已提示 */ } finally {
      setUploading(prev => ({ ...prev, [String(it.id)]: false }))
    }
  }

  const doDelete = (it: TimelineItem) => {
    if (!window.confirm(t('确定要删除这条记录吗？', 'Are you sure you want to delete this record?'))) return
    deleteTimeline(String(it.id), lang).then(() => {
      setAlert({ type: 'success', msg: t('记录删除成功！', 'Record deleted successfully!') })
      load(lang)
    }).catch(() => {})
  }

  return (
    <div>
      <div className="header page-upload-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-upload-title" style={{ marginBottom: 0 }}>{t('发展历史管理', 'Timeline Management')}</h1>
        <div className="language-switch">
          <button className={'btn ' + (!isEn ? 'active' : '')} onClick={() => setLang('zh')} style={!isEn ? { background: '#f99e00' } : {}}>中文</button>
          <button className={'btn ' + (isEn ? 'active' : '')} onClick={() => setLang('en')} style={isEn ? { background: '#f99e00' } : {}}>English</button>
        </div>
      </div>

      <div className="page-breadcrumb">
        <a onClick={() => navigate('/')}>{t('仪表板', 'Dashboard')}</a> &gt;
        <a onClick={() => navigate('/media')}>{t('媒体管理', 'Media Management')}</a> &gt;
        <span>{t('发展历史管理', 'Timeline Management')}</span>
      </div>

      <div className="content">
        {alert && <div className={'alert alert-' + alert.type}>{alert.msg}</div>}

        <div className="media-section timeline-section">
          <h2>{t('时间线内容管理', 'Timeline Content Management')}</h2>

          <div className="year-management">
            <div className="year-tabs">
              {years.length === 0 && <span style={{ color: '#666' }}>{t('暂无记录', 'No records')}</span>}
              {years.map((y) => (
                <button key={y} className={'year-tab' + (y === activeYear ? ' active' : '')} onClick={() => setActiveYear(y)}>
                  {y}{isEn ? '' : '年'}
                </button>
              ))}
            </div>
            <div className="year-actions">
              <button className="btn btn-add" onClick={() => setAddOpen(true)}>+ {t('新增记录', 'Add Record')}</button>
            </div>
          </div>

          {activeYear && (
            <div className="timeline-content">
              <h3 className="timeline-year-title">
                {activeYear}{isEn ? '' : '年'} - {t('发展记录', 'Records')}
              </h3>
              {yearItems.length === 0 && (
                <div className="no-entries">{t('此年份暂无记录。点"新增记录"创建。', 'No records for this year. Click "Add Record" to create one.')}</div>
              )}
              {yearItems.map((it, idx) => {
                const draft = editDraft[String(it.id)] || {}
                const month = draft.month ?? it.month ?? 0
                return (
                  <div className="entry-container" key={String(it.id)}>
                    <div className="entry-header">
                      <h4>
                        {t('记录', 'Record')} #{idx + 1}
                        {month ? ' · ' + (isEn ? MONTHS_EN[month] || 'Month ' + month : MONTHS_ZH[month] || month + '月') : ''}
                      </h4>
                      <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => doDelete(it)}>
                        {t('删除', 'Delete')}
                      </button>
                    </div>

                    {/* 照片上传 */}
                    <div className="entry-photo">
                      {it.image_url ? (
                        <div className="entry-photo-preview">
                          <img src={it.image_url} alt="" />
                          <div className="entry-photo-info">
                            <strong>{t('已上传', 'Uploaded')}</strong>
                            <br />
                            <small>{t('更新', 'Updated')}: {it.updated}</small>
                          </div>
                        </div>
                      ) : (
                        <div className="entry-photo-empty">{t('暂无照片', 'No photo')}</div>
                      )}
                      <label className="btn btn-upload-photo">
                        <i className="fas fa-upload" />
                        {uploading[String(it.id)] ? t('上传中...', 'Uploading...') : t('上传照片', 'Upload Photo')}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          disabled={uploading[String(it.id)]}
                          onChange={(e) => { doUploadPhoto(it, e.target.files?.[0]); e.target.value = '' }} />
                      </label>
                    </div>

                    {/* 编辑表单 */}
                    <div className="entry-form">
                      <div className="entry-form-group">
                        <label>{t('标题', 'Title')}</label>
                        <input className="form-input" value={draft.title ?? it.title ?? ''}
                          placeholder={t('输入标题...', 'Enter title...')}
                          onChange={(e) => setEditDraft(p => ({ ...p, [String(it.id)]: { ...p[String(it.id)], title: e.target.value } }))} />
                      </div>
                      <div className="entry-form-group">
                        <label>{t('月份', 'Month')}</label>
                        <InputNumber min={1} max={12} value={month} onChange={(v) => setEditDraft(p => ({ ...p, [String(it.id)]: { ...p[String(it.id)], month: v || 1 } }))} style={{ width: '100%' }} />
                      </div>
                      <div className="entry-form-group">
                        <label>{t('第一段描述', 'First Description')}</label>
                        <textarea className="form-input" rows={3} value={draft.description1 ?? it.description1 ?? ''}
                          placeholder={t('输入第一段描述...', 'Enter first description...')}
                          onChange={(e) => setEditDraft(p => ({ ...p, [String(it.id)]: { ...p[String(it.id)], description1: e.target.value } }))} />
                      </div>
                      <div className="entry-form-group">
                        <label>{t('第二段描述', 'Second Description')}</label>
                        <textarea className="form-input" rows={3} value={draft.description2 ?? it.description2 ?? ''}
                          placeholder={t('输入第二段描述...', 'Enter second description...')}
                          onChange={(e) => setEditDraft(p => ({ ...p, [String(it.id)]: { ...p[String(it.id)], description2: e.target.value } }))} />
                      </div>
                      <div className="form-actions">
                        <button className="btn" onClick={() => doSave(it)} disabled={saving}>
                          <i className="fas fa-save" /> {saving ? t('保存中...', 'Saving...') : t('保存修改', 'Save Changes')}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Modal open={addOpen} title={t('新增发展记录', 'Add New Record')} onOk={doAdd} onCancel={() => setAddOpen(false)} okText={t('新增记录', 'Add Record')} cancelText={t('取消', 'Cancel')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ fontWeight: 600 }}>{t('年份', 'Year')}</label>
            <InputNumber min={1900} max={2100} value={newYear} onChange={(v) => setNewYear(v || new Date().getFullYear())} style={{ width: '100%', marginTop: 6 }} placeholder={t('输入年份，例如：2024', 'Enter year, e.g.: 2024')} />
          </div>
          <div>
            <label style={{ fontWeight: 600 }}>{t('月份', 'Month')}</label>
            <InputNumber min={1} max={12} value={newMonth} onChange={(v) => setNewMonth(v || 1)} style={{ width: '100%', marginTop: 6 }} placeholder={t('输入月份，1-12', 'Enter month, 1-12')} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
