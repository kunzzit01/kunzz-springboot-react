import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobs, createJob, updateJob, deleteJob, type JobPosition } from '../api'
import '../styles/jobpositions.css'

/** 招聘职位管理（对齐线上 joinpage3upload.php：语言切换 + 添加/编辑职位表单 + 现有职位列表） */
const COMPANY_OPTIONS = ['KUNZZ HOLDINGS', 'TOKYO JAPANESE CUISINE', 'TOKYO IZAKAYA']
const DEPARTMENT_ZH = ['前台', '厨房', 'sushi bar']
const DEPARTMENT_EN = ['Front Desk', 'Kitchen', 'sushi bar']

interface Draft {
  jobTitle: string
  recruitmentCount: string
  workExperience: string
  publishDate: string
  companyCategory: string
  companyDepartment: string
  salary: string
  companyLocation: string
  jobDescription: string
}

const emptyDraft = (): Draft => ({
  jobTitle: '', recruitmentCount: '', workExperience: '',
  publishDate: new Date().toISOString().slice(0, 10),
  companyCategory: '', companyDepartment: '', salary: '',
  companyLocation: '', jobDescription: '',
})

export default function JobPositions() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [jobs, setJobs] = useState<JobPosition[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [editId, setEditId] = useState<number | null>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const isEn = lang === 'en'
  const t = (zh: string, en: string) => (isEn ? en : zh)

  const load = useCallback(() => {
    getJobs().then(setJobs).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const list = jobs
    .filter((j) => (!j.language || j.language === lang))
    .sort((a, b) => String(b.publishDate || '').localeCompare(String(a.publishDate || '')) || (b.id - a.id))

  const showDept = draft.companyCategory === 'TOKYO JAPANESE CUISINE' || draft.companyCategory === 'TOKYO IZAKAYA'

  const doSave = async () => {
    if (!draft.jobTitle.trim() || !draft.recruitmentCount.trim() || !draft.workExperience.trim()
      || !draft.publishDate || !draft.companyCategory || !draft.salary.trim() || !draft.jobDescription.trim()) {
      setAlert({ type: 'error', msg: t('请填写所有必填项！', 'Please fill in all required fields!') })
      return
    }
    if (!/^\d+-\d+$/.test(draft.salary.trim())) {
      setAlert({ type: 'error', msg: t('薪资范围格式应为 数字-数字（例如 3000-5000）', 'Salary range format should be digits-digits (e.g. 3000-5000)') })
      return
    }
    const payload = {
      jobTitle: draft.jobTitle.trim(),
      recruitmentCount: parseInt(draft.recruitmentCount, 10) || 1,
      workExperience: draft.workExperience.trim(),
      publishDate: draft.publishDate,
      companyCategory: draft.companyCategory,
      companyDepartment: showDept ? draft.companyDepartment : '',
      salary: draft.salary.trim(),
      companyLocation: draft.companyLocation.trim(),
      jobDescription: draft.jobDescription.trim(),
      language: lang,
    }
    try {
      if (editId !== null) {
        await updateJob(editId, payload)
        setAlert({ type: 'success', msg: t('职位更新成功！', 'Job position updated successfully!') })
      } else {
        await createJob(payload)
        setAlert({ type: 'success', msg: t('职位添加成功！', 'Job position added successfully!') })
      }
      setDraft(emptyDraft())
      setEditId(null)
      load()
    } catch { /* 拦截器已提示 */ }
  }

  const startEdit = (job: JobPosition) => {
    setEditId(job.id)
    setDraft({
      jobTitle: job.jobTitle || '',
      recruitmentCount: String(job.recruitmentCount ?? ''),
      workExperience: job.workExperience || '',
      publishDate: job.publishDate || new Date().toISOString().slice(0, 10),
      companyCategory: job.companyCategory || '',
      companyDepartment: job.companyDepartment || '',
      salary: job.salary || '',
      companyLocation: job.companyLocation || '',
      jobDescription: job.jobDescription || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => { setEditId(null); setDraft(emptyDraft()) }

  const doDelete = (job: JobPosition) => {
    if (!window.confirm(t('确定要删除这个职位吗？', 'Are you sure you want to delete this job position?'))) return
    deleteJob(job.id).then(() => {
      setAlert({ type: 'success', msg: t('职位删除成功！', 'Job position deleted successfully!') })
      load()
    }).catch(() => {})
  }

  const set = (k: keyof Draft, v: string) => setDraft(prev => ({ ...prev, [k]: v }))

  const deptOptions = isEn ? DEPARTMENT_EN : DEPARTMENT_ZH

  return (
    <div>
      <div className="header page-upload-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h1 className="page-upload-title" style={{ marginBottom: 0 }}>{t('招聘职位管理', 'Job Positions Management')}</h1>
        <div className="language-switch">
          <button className={'btn ' + (!isEn ? 'active' : '')} onClick={() => setLang('zh')} style={!isEn ? { background: '#f99e00' } : {}}>中文</button>
          <button className={'btn ' + (isEn ? 'active' : '')} onClick={() => setLang('en')} style={isEn ? { background: '#f99e00' } : {}}>English</button>
        </div>
      </div>

      <div className="page-breadcrumb">
        <a onClick={() => navigate('/')}>{t('仪表板', 'Dashboard')}</a> &gt;
        <a onClick={() => navigate('/media')}>{t('媒体管理', 'Media Management')}</a> &gt;
        <span>{t('招聘职位管理', 'Job Positions Management')}</span>
      </div>

      <div className="content">
        {alert && <div className={'alert alert-' + alert.type}>{alert.msg}</div>}

        {/* 添加/编辑职位表单 */}
        <div className="form-section">
          <h2>{editId !== null ? t('编辑职位', 'Edit Job Position') : t('添加新职位', 'Add New Job Position')}</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>{t('职位名称', 'Job Title')} *</label>
              <input type="text" value={draft.jobTitle} required onChange={(e) => set('jobTitle', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('招聘人数', 'Recruitment Count')} *</label>
              <input type="text" value={draft.recruitmentCount} required placeholder={t('例如：1人', 'e.g.: 1 person')} onChange={(e) => set('recruitmentCount', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('工作经验要求', 'Work Experience Required')} *</label>
              <input type="text" value={draft.workExperience} required placeholder={t('例如：3', 'e.g.: 3')} onChange={(e) => set('workExperience', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('发布日期', 'Publish Date')} *</label>
              <input type="date" value={draft.publishDate} required onChange={(e) => set('publishDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('公司分类', 'Company Category')} *</label>
              <select value={draft.companyCategory} required onChange={(e) => set('companyCategory', e.target.value)}>
                <option value="">{t('请选择公司', 'Please select company')}</option>
                {COMPANY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={showDept ? undefined : { display: 'none' }}>
              <label>{t('部门', 'Department')} *</label>
              <select value={draft.companyDepartment} onChange={(e) => set('companyDepartment', e.target.value)}>
                <option value="">{t('请选择部门', 'Please select department')}</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{t('薪资范围', 'Salary Range')} *</label>
              <input type="text" value={draft.salary} required placeholder={t('例如：3000-5000', 'e.g.: 3000-5000')}
                pattern="\d+-\d+" title={t('请输入薪资范围', 'Please enter salary range')} onChange={(e) => set('salary', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('公司地址', 'Company Address')}</label>
              <input type="text" value={draft.companyLocation} placeholder="25, Jln Tanjong 3, Taman Desa Cemerlang, 81800 Ulu Tiram, Johor" onChange={(e) => set('companyLocation', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label>{t('职位详情', 'Job Description')} *</label>
              <textarea value={draft.jobDescription} required placeholder={t('请输入详细的职位描述...', 'Please enter detailed job description...')} onChange={(e) => set('jobDescription', e.target.value)} />
            </div>
          </div>

          <div className="form-buttons">
            <button className="btn" onClick={doSave}>
              {editId !== null ? t('更新职位', 'Update Job Position') : t('添加职位', 'Add Job Position')}
            </button>
            {editId !== null && (
              <button className="btn btn-secondary" onClick={cancelEdit}>{t('取消编辑', 'Cancel Edit')}</button>
            )}
          </div>
        </div>

        {/* 现有职位列表 */}
        <div className="jobs-list">
          <h2>{t('现有职位列表', 'Current Job Positions')} ({list.length})</h2>
          {list.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: 40 }}>{t('暂无职位信息', 'No job positions available')}</p>
          ) : (
            list.map((job) => (
              <div className="job-item" key={job.id}>
                <div className="job-header-item">
                  <div>
                    <div className="job-title-item">{job.jobTitle}</div>
                    <div className="job-meta-list">
                      <span className="job-meta-item-list">👥 {t('人数', 'Count:')} {job.recruitmentCount}</span>
                      <span className="job-meta-item-list">💼 {t('经验', 'Experience:')} {job.workExperience}</span>
                      <span className="job-meta-item-list">📅 {t('发布', 'Published:')} {job.publishDate}</span>
                      <span className="job-meta-item-list">🏷️ {t('公司', 'Company:')} {job.companyCategory || t('未分类', 'Uncategorized')}</span>
                      {job.companyDepartment && <span className="job-meta-item-list">🏢 {t('部门', 'Department:')} {job.companyDepartment}</span>}
                      {job.salary && <span className="job-meta-item-list">💰 {t('薪资', 'Salary:')} {job.salary}</span>}
                      {job.companyLocation && <span className="job-meta-item-list">📍 {t('地址', 'Address:')} {job.companyLocation}</span>}
                    </div>
                    <div className="job-description-preview">
                      <strong>{t('职位详情：', 'Job Description:')}</strong>{job.jobDescription}
                    </div>
                  </div>
                  <div className="job-actions">
                    <button className="action-btn edit-btn" title={t('编辑', 'Edit')} onClick={() => startEdit(job)}>
                      <i className="fas fa-edit" />
                    </button>
                    <button className="action-btn delete-btn" title={t('删除', 'Delete')} onClick={() => doDelete(job)}>
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
