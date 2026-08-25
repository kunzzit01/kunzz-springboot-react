import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { getEvalConfigs, getEvalStandards, saveEvalStandard, createEvalForm, getScheduleEmployees } from '../api'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import '../styles/evaluation.css'

interface CriteriaConfig {
  id: number
  department: string
  criteriaOrder: number
  criteriaNameZh: string
  criteriaNameEn: string
  isActive?: boolean
}
interface EvalStandard {
  id?: number
  department: string
  criteriaOrder: number
  score: number
  descriptionText?: string
}
interface ScheduleEmployee {
  id: number
  name: string
  phone?: string
  position?: string
  workArea?: string
  restaurant?: string
  isActive?: boolean
}

const DEPTS = ['service_line', 'sushi_bar', 'kitchen'] as const
type Dept = (typeof DEPTS)[number]

const DEPT_LABELS: Record<string, string> = {
  service_line: 'SERVICE LINE',
  sushi_bar: 'SUSHI BAR',
  kitchen: 'KITCHEN',
}
const TAB_LABELS: Record<string, string> = {
  service_line: 'SERVICE',
  sushi_bar: 'SUSHI',
  kitchen: 'KITCHEN',
}

function escapeHtml(str: string) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 考核表单：对齐线上 evaluation_form（创建表单评分 + 考核标准编辑，PDF 导出） */
export default function Evaluation() {
  // 模式：form 考核表单 / standards 考核标准
  const [mode, setMode] = useState<'form' | 'standards'>('form')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // ---- 表单模式 ----
  const [restaurant, setRestaurant] = useState('J1')
  const [department, setDepartment] = useState('')
  const [evaluatorName, setEvaluatorName] = useState('')
  const [evaluationDate, setEvaluationDate] = useState(() => new Date().toISOString().slice(0, 10))
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const [employees, setEmployees] = useState<ScheduleEmployee[]>([])
  const [criteria, setCriteria] = useState<CriteriaConfig[]>([])
  const [scores, setScores] = useState<Record<string, Record<number, string>>>({})
  const [formCreated, setFormCreated] = useState(false)

  // ---- 标准模式 ----
  const [activeDept, setActiveDept] = useState<Dept>('service_line')
  const [standards, setStandards] = useState<Record<string, Record<number, Record<number, string>>>>({})
  const [criteriaByDept, setCriteriaByDept] = useState<Record<string, CriteriaConfig[]>>({})

  const pdfRef = useRef<HTMLDivElement>(null)
  const standardsPdfRef = useRef<HTMLDivElement>(null)

  // 指标配置只拉一次，按部门分组
  useEffect(() => {
    getEvalConfigs()
      .then((list) => {
        const configs = (list || []) as unknown as CriteriaConfig[]
        const byDept: Record<string, CriteriaConfig[]> = {}
        for (const c of configs) {
          const dept = String(c.department || '')
          if (!byDept[dept]) byDept[dept] = []
          byDept[dept].push(c)
        }
        for (const d of Object.keys(byDept)) byDept[d].sort((a, b) => Number(a.criteriaOrder) - Number(b.criteriaOrder))
        setCriteriaByDept(byDept)
      })
      .catch(() => {})
  }, [])

  // 部门变化 → 加载员工 + 指标
  useEffect(() => {
    if (!department) {
      setEmployees([])
      setCriteria([])
      return
    }
    setCriteria(criteriaByDept[department] || [])
    getScheduleEmployees(restaurant, department)
      .then((emps) => setEmployees((emps || []).filter((e) => e.isActive === true || Number(e.isActive as unknown) === 1)))
      .catch(() => setEmployees([]))
  }, [department, restaurant, criteriaByDept])

  // 切换模式
  const switchToFormMode = () => {
    setMode('form')
    setDropdownOpen(false)
  }
  const switchToStandardsMode = () => {
    setMode('standards')
    setDropdownOpen(false)
    loadStandards()
  }

  // 加载考核标准（3 部门指标 + 标准文本）
  const loadStandards = async () => {
    try {
      const rows = await getEvalStandards().catch(() => [] as EvalStandard[])
      const init: Record<string, Record<number, Record<number, string>>> = {}
      for (const d of DEPTS) {
        init[d] = {}
        for (let i = 1; i <= 7; i++) {
          init[d][i] = {}
          for (let s = 1; s <= 5; s++) init[d][i][s] = ''
        }
      }
      for (const r of rows as EvalStandard[]) {
        if (init[r.department] && init[r.department][r.criteriaOrder] && init[r.department][r.criteriaOrder][r.score] !== undefined) {
          init[r.department][r.criteriaOrder][r.score] = r.descriptionText || ''
        }
      }
      setStandards(init)
    } catch (e) {
      console.error(e)
      message.error('加载考核标准失败')
    }
  }

  // ---------- 表单模式 ----------

  const createNewForm = () => {
    if (!department) { message.error('请选择部门'); return }
    if (!evaluatorName.trim()) { message.error('请输入评估人姓名'); return }
    if (!evaluationDate) { message.error('请选择评估日期'); return }
    if (employees.length === 0) { message.error('该部门暂无员工，请先添加员工'); return }
    setScores({})
    setFormCreated(true)
  }

  const setScore = (empId: number, idx: number, value: string) => {
    setScores((prev) => ({ ...prev, [empId]: { ...(prev[empId] || {}), [idx]: value } }))
  }

  const saveForm = async () => {
    if (saving) return
    if (!evaluatorName.trim() || !evaluationDate) {
      message.error('请填写评估人姓名和评估日期')
      return
    }
    const details = employees.map((emp) => {
      const s = scores[emp.id] || {}
      const detail: Record<string, unknown> = { employeeId: emp.id, employeeName: emp.name }
      criteria.forEach((_, i) => { detail['criteria' + (i + 1)] = s[i + 1] || '' })
      return detail
    })
    setSaving(true)
    try {
      await createEvalForm({
        formName: `${DEPT_LABELS[department]} - ${evaluationDate}`,
        department,
        restaurant,
        evaluatorName,
        evaluationDate,
        details,
      })
      message.success('表单保存成功')
    } catch { /* 拦截器已提示 */ }
    finally { setSaving(false) }
  }

  const downloadPDF = async () => {
    const el = pdfRef.current
    if (!el) { message.error('找不到表单内容'); return }
    message.success('正在生成PDF，请稍候...')
    el.style.display = 'block'
    await new Promise((r) => setTimeout(r, 300))
    try {
      const canvas = await html2canvas(el, {
        scale: 2.5, useCORS: true, logging: false, backgroundColor: '#ffffff',
        width: el.scrollWidth, height: el.scrollHeight,
        windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
      })
      const imgData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDF('l', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const marginX = 8, marginY = 8
      const availableWidth = pdfWidth - marginX * 2
      const availableHeight = pdfHeight - marginY * 2
      const imgWidth = canvas.width, imgHeight = canvas.height
      const ratio = Math.min(availableWidth / imgWidth, availableHeight / imgHeight)
      const w = imgWidth * ratio, h = imgHeight * ratio
      pdf.addImage(imgData, 'PNG', (pdfWidth - w) / 2, marginY, w, h)
      let heightLeft = h, position = marginY
      if (heightLeft > pdfHeight) {
        while (heightLeft > 0) {
          position = position - pdfHeight
          if (position < -imgHeight * ratio) break
          pdf.addPage()
          pdf.addImage(imgData, 'PNG', (pdfWidth - w) / 2, position, w, h)
          heightLeft -= pdfHeight
        }
      }
      const deptName = DEPT_LABELS[department] || department
      pdf.save(`考核表单_${deptName}_${evaluationDate}.pdf`)
      message.success('PDF下载成功')
    } catch (e) {
      console.error(e)
      message.error('生成PDF失败')
    } finally {
      el.style.display = 'none'
    }
  }

  // ---------- 标准模式 ----------

  const setStandardText = (dept: Dept, order: number, score: number, text: string) => {
    setStandards((prev) => ({
      ...prev,
      [dept]: { ...prev[dept], [order]: { ...(prev[dept]?.[order] || {}), [score]: text } },
    }))
  }

  const saveStandards = async () => {
    if (saving) return
    const items: EvalStandard[] = []
    for (const d of DEPTS) {
      for (let co = 1; co <= 5; co++) {
        for (let sc = 1; sc <= 5; sc++) {
          items.push({ department: d, criteriaOrder: co, score: sc, descriptionText: standards[d]?.[co]?.[sc] || '' })
        }
      }
    }
    setSaving(true)
    try {
      await saveEvalStandard(items as unknown as Record<string, unknown>)
      message.success('考核标准已保存')
    } catch (e) {
      console.error(e)
      message.error('保存失败')
    }
    finally { setSaving(false) }
  }

  const exportStandardsPDF = async () => {
    const el = standardsPdfRef.current
    if (!el) return
    message.success(`正在生成 ${TAB_LABELS[activeDept]} 标准PDF，请稍候...`)
    el.style.display = 'block'
    await new Promise((r) => setTimeout(r, 300))
    try {
      const canvas = await html2canvas(el, {
        scale: 2.2, useCORS: true, logging: false, backgroundColor: '#ffffff',
        width: el.scrollWidth, height: el.scrollHeight,
        windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
      })
      const imgData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDF('l', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const marginX = 8, marginY = 8
      const availableWidth = pdfWidth - marginX * 2
      const availableHeight = pdfHeight - marginY * 2
      const imgWidth = canvas.width, imgHeight = canvas.height
      const ratio = Math.min(availableWidth / imgWidth, availableHeight / imgHeight)
      const w = imgWidth * ratio, h = imgHeight * ratio
      const pages = el.querySelectorAll('.ev-standards-pdf-page')
      pages.forEach((_, i) => {
        if (i > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', (pdfWidth - w) / 2, marginY, w, h)
      })
      pdf.save(`考核标准_${TAB_LABELS[activeDept]}_${new Date().toISOString().slice(0, 10)}.pdf`)
      message.success(`${TAB_LABELS[activeDept]} 标准PDF下载成功`)
    } catch (e) {
      console.error(e)
      message.error('导出失败')
    } finally {
      el.style.display = 'none'
    }
  }

  // ---------- 渲染 ----------

  const activeCriteria = (criteriaByDept[activeDept] || []).slice(0, 5)
  const standardsPagesHtml = activeCriteria.map((c, idx) => {
    const co = Number(c.criteriaOrder || idx + 1)
    const title = c.criteriaNameZh || `指标${idx + 1}`
    return (
      <div className="ev-standards-page" key={co}>
        <div className="ev-standards-page-title">{title}</div>
        <table className="ev-standards-table">
          <thead><tr><th className="ev-standards-score">分数</th><th>说明</th></tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((s) => (
              <tr key={s}>
                <td className="ev-standards-score">{s}</td>
                <td>
                  <textarea
                    className="ev-standards-textarea"
                    value={standards[activeDept]?.[co]?.[s] || ''}
                    placeholder={`请输入 ${title} 的 ${s} 分说明...`}
                    onChange={(e) => setStandardText(activeDept, co, s, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  })

  return (
    <div className="ev-root">
      <div className="ev-container">
        <div className="ev-header">
          <h1>考核表单管理</h1>
          <div className="ev-controls">
            <div className="ev-toggle-standards-selector">
              <button className="ev-selector-button" onClick={() => setDropdownOpen(!dropdownOpen)}>
                <span>{mode === 'form' ? '考核表单' : '考核标准'}</span>
                <i className="fas fa-chevron-down" />
              </button>
              <div className={'ev-selector-dropdown' + (dropdownOpen ? ' show' : '')}>
                <div className={'ev-dropdown-item' + (mode === 'form' ? ' active' : '')} onClick={switchToFormMode}>考核表单</div>
                <div className={'ev-dropdown-item' + (mode === 'standards' ? ' active' : '')} onClick={switchToStandardsMode}>考核标准</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ev-content-wrapper">
          {mode === 'form' && (
            <div className="ev-sidebar">
              <div className="ev-form-section">
                <label htmlFor="ev-restaurant">餐厅</label>
                <select id="ev-restaurant" value={restaurant} onChange={(e) => setRestaurant(e.target.value)}>
                  <option value="J1">J1分店</option>
                  <option value="J2">J2分店</option>
                  <option value="J3">J3分店</option>
                </select>
              </div>

              <div className="ev-form-section">
                <label htmlFor="ev-department">部门</label>
                <select id="ev-department" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">请选择部门</option>
                  <option value="service_line">服务部门 (SERVICE LINE)</option>
                  <option value="sushi_bar">寿司吧 (SUSHI BAR)</option>
                  <option value="kitchen">厨房 (KITCHEN)</option>
                </select>
              </div>

              <div className="ev-form-section">
                <label htmlFor="ev-evaluator">评估人姓名</label>
                <input id="ev-evaluator" type="text" placeholder="请输入评估人姓名" value={evaluatorName} onChange={(e) => setEvaluatorName(e.target.value)} />
              </div>

              <div className="ev-form-section">
                <label htmlFor="ev-date">评估日期</label>
                <input id="ev-date" type="date" value={evaluationDate} onChange={(e) => setEvaluationDate(e.target.value)} />
              </div>

              <button className="ev-btn-primary" onClick={createNewForm}>
                <i className="fas fa-plus" /> 创建新表单
              </button>

              {formCreated && (
                <div className="ev-form-buttons">
                  <button className="ev-save-form-btn" onClick={saveForm} disabled={saving}>{saving ? '保存中...' : <><i className="fas fa-save" /> 保存表单</>}</button>
                  <button className="ev-print-btn" onClick={downloadPDF}><i className="fas fa-file-pdf" /> 下载PDF</button>
                </div>
              )}
            </div>
          )}

          <div className="ev-main-content">
            {mode === 'form' ? (
              !formCreated ? (
                <div className="ev-placeholder">
                  <i className="fas fa-clipboard-list" />
                  <p>请选择或创建一个考核表单</p>
                </div>
              ) : (
                <div>
                  <div className="ev-form-header">
                    <h2>TOKYO IZAKAYA</h2>
                    <div className="ev-form-info">
                      <div><strong>Name:</strong> {evaluatorName}</div>
                      <div><strong>Date:</strong> {evaluationDate}</div>
                    </div>
                  </div>
                  <div style={{ background: '#bf7f3b', color: 'white', padding: 20, margin: '-30px -30px 25px -30px', textAlign: 'center', fontWeight: 600, fontSize: 20, letterSpacing: 1 }}>
                    {(DEPT_LABELS[department] || department).toUpperCase()}
                  </div>
                  <table className="ev-evaluation-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        {criteria.map((c) => (
                          <th key={c.id}>{c.criteriaNameZh}<br /><small>{c.criteriaNameEn}</small></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.id}>
                          <td className="ev-employee-name">{emp.name}</td>
                          {criteria.map((c, cIndex) => (
                            <td key={c.id}>
                              <input
                                type="text"
                                className="ev-score-input"
                                maxLength={20}
                                value={scores[emp.id]?.[cIndex + 1] || ''}
                                onChange={(e) => setScore(emp.id, cIndex + 1, e.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* 隐藏的 PDF 版本（与线上 #pdf-content 一致） */}
                  <div className="ev-pdf-content" ref={pdfRef}>
                    <div className="ev-form-header">
                      <h2>TOKYO IZAKAYA</h2>
                      <div className="ev-form-info">
                        <div><strong>Name:</strong> {evaluatorName}</div>
                        <div><strong>Date:</strong> {evaluationDate}</div>
                      </div>
                    </div>
                    <div style={{ background: '#bf7f3b', color: 'white', padding: 22, textAlign: 'center', fontWeight: 600, fontSize: 24, marginBottom: 30, letterSpacing: 1.5 }}>
                      {(DEPT_LABELS[department] || department).toUpperCase()}
                    </div>
                    <table className="ev-evaluation-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          {criteria.map((c) => (
                            <th key={c.id}>{c.criteriaNameZh}<br /><small>{c.criteriaNameEn}</small></th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp) => (
                          <tr key={emp.id}>
                            <td className="ev-employee-name">{emp.name}</td>
                            {criteria.map((c, cIndex) => (
                              <td key={c.id}>{escapeHtml(scores[emp.id]?.[cIndex + 1] || '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : (
              <div className="ev-standards-wrap">
                <div className="ev-standards-toolbar">
                  <div className="ev-left">
                    <div className="ev-standards-tabs">
                      {DEPTS.map((d) => (
                        <button
                          key={d}
                          className={'ev-standards-tab' + (activeDept === d ? ' active' : '')}
                          onClick={() => setActiveDept(d)}
                        >
                          {TAB_LABELS[d]}
                        </button>
                      ))}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 14 }}>点击导出PDF将只生成当前选择部门的标准</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="ev-btn-secondary" onClick={exportStandardsPDF}><i className="fas fa-file-pdf" /> 导出标准PDF</button>
                    <button className="ev-btn-primary" style={{ width: 'auto' }} onClick={saveStandards} disabled={saving}>{saving ? '保存中...' : <><i className="fas fa-save" /> 保存标准</>}</button>
                  </div>
                </div>

                {standardsPagesHtml}

                <div className="ev-standards-pdf" ref={standardsPdfRef}>
                  {activeCriteria.map((c, idx) => {
                    const co = Number(c.criteriaOrder || idx + 1)
                    const title = c.criteriaNameZh || `指标${idx + 1}`
                    return (
                      <div className="ev-standards-pdf-page" key={co}>
                        <div className="ev-standards-page-title">{escapeHtml(title)}</div>
                        <table className="ev-standards-table">
                          <thead>
                            <tr>
                              <th className="ev-standards-score" style={{ width: 80 }}>分数</th>
                              <th>说明</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[1, 2, 3, 4, 5].map((sc) => (
                              <tr key={sc}>
                                <td className="ev-standards-score">{sc}</td>
                                <td style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6, padding: 18 }}>{escapeHtml(standards[activeDept]?.[co]?.[sc] || '')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
