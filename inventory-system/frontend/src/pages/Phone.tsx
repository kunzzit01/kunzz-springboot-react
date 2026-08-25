import { useEffect, useMemo, useState } from 'react'
import { deleteScheduleEmployee, getPhoneRecordsByDate, getScheduleEmployees, savePhoneRecordsByDate, saveScheduleEmployee } from '../api'
import '../styles/phone.css'
import ModalClose from '../components/ModalClose'

interface Emp { id: number; name: string; phone?: string; position?: string; workArea?: string; restaurant?: string; isActive?: boolean }
interface PhoneRec { employeeId: number; name?: string; position?: string; workArea?: string; getChecked: boolean; startTime?: string; endTime?: string; returnChecked: boolean; hasRecord?: boolean }

const restaurants = ['J1', 'J2', 'J3']

const positionHierarchy: Record<string, string[]> = {
  service_line: ['MANAGER', 'ASST. MANAGER', 'SUPERVISOR', 'SENIOR CAPTAIN', 'CAPTAIN', 'SENIOR WAITRESS', 'SENIOR WAITER', 'WAITRESS', 'WAITER'],
  sushi_bar: ['HEAD CHEF', 'OUTLET CHEF', 'ASST. CHEF', 'COMIS 1', 'COMIS 2', 'COMIS 3', 'SUSHI HELPER'],
  kitchen: ['HEAD CHEF', 'OUTLET CHEF', 'ASST. CHEF', 'COMIS 1', 'COMIS 2', 'COMIS 3', 'KITCHEN HELPER']
}

const departments = [
  { key: 'service_line', name: 'SERVICE LINE' },
  { key: 'sushi_bar', name: 'SUSHI BAR' },
  { key: 'kitchen', name: 'KITCHEN' }
]

const getWorkAreaName = (area?: string) => ({ service_line: 'Service Line', sushi_bar: 'Sushi Bar', kitchen: 'Kitchen' })[area || ''] || area || ''

/** 手机管理系统：对齐线上 phone_manage.php（领取/归还 + 时间记录） */
export default function Phone() {
  const [restaurant, setRestaurant] = useState(() => {
    const r = new URL(window.location.href).searchParams.get('restaurant')
    return r === 'J1' || r === 'J2' || r === 'J3' ? r : 'J1'
  })
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [employees, setEmployees] = useState<Emp[]>([])
  const [records, setRecords] = useState<PhoneRec[]>([])
  const [restaurantOpen, setRestaurantOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  // 员工管理面板
  const [panel, setPanel] = useState(false)
  const [empModal, setEmpModal] = useState(false)
  const [empId, setEmpId] = useState<number | null>(null)
  const [empName, setEmpName] = useState('')
  const [empPhone, setEmpPhone] = useState('')
  const [empArea, setEmpArea] = useState('service_line')
  const [empPosition, setEmpPosition] = useState('')

  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 餐厅切换：同步 URL
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('restaurant', restaurant)
    window.history.replaceState({}, '', url)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, date])

  const loadData = async () => {
    setLoading(true)
    try {
      const es = await getScheduleEmployees(restaurant)
      setEmployees(es.filter(e => e.isActive !== false))
      const recs = await getPhoneRecordsByDate(restaurant, date)
      setRecords(recs)
    } catch { /* ignore */ }
    setLoading(false)
  }

  // 更新单条记录（本地状态）
  const updateRecord = (employeeId: number, field: string, value: boolean | string) => {
    setRecords(prev => {
      const idx = prev.findIndex(r => r.employeeId === employeeId)
      if (idx === -1) {
        const emp = employees.find(e => e.id === employeeId)
        return [...prev, { employeeId, name: emp?.name, position: emp?.position, workArea: emp?.workArea, getChecked: false, startTime: '', endTime: '', returnChecked: false, hasRecord: false, [field]: value } as any]
      }
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value, hasRecord: true }
      return next
    })
  }

  const saveAll = async () => {
    if (saving) return
    const payload = records.map(r => ({
      employeeId: r.employeeId,
      getChecked: !!r.getChecked,
      startTime: r.startTime || '',
      endTime: r.endTime || '',
      returnChecked: !!r.returnChecked
    }))
    setSaving(true)
    try {
      await savePhoneRecordsByDate(restaurant, date, payload)
      showMsg('保存成功')
    } catch { showMsg('保存失败，请重试', 'error') }
    finally { setSaving(false) }
  }

  const downloadPDF = async () => {
    if (employees.length === 0) { showMsg('没有数据可下载', 'error'); return }
    try {
      const w = window as any
      if (!w.html2canvas || !w.jspdf) { showMsg('PDF 库未加载', 'error'); return }
      const { jsPDF } = w.jspdf
      const table = document.querySelector('.ph-root #phoneTable')
      if (!table) return
      showMsg('正在生成 PDF...', 'info')
      const canvas = await w.html2canvas(table, { useCORS: true, backgroundColor: '#ffffff' })
      const img = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const imgH = canvas.height * pw / canvas.width
      let heightLeft = imgH
      let position = 0
      pdf.addImage(img, 'JPEG', 0, position, pw, imgH)
      heightLeft -= ph
      while (heightLeft > 0) {
        position -= ph
        pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, position, pw, imgH)
        heightLeft -= ph
      }
      pdf.save('phone_' + restaurant + '_' + date + '.pdf')
      showMsg('PDF 已下载')
    } catch (e) { console.error(e); showMsg('PDF 生成失败', 'error') }
  }

  // ---------- 员工管理 ----------
  const saveEmployee = async () => {
    if (saving) return
    if (!empName.trim() || !empPhone.trim()) { showMsg('请填写姓名和手机号码', 'error'); return }
    setSaving(true)
    try {
      await saveScheduleEmployee({ id: empId || undefined, name: empName.trim(), phone: empPhone.trim(), position: empPosition, workArea: empArea, restaurant })
      setEmpModal(false)
      showMsg('员工已保存')
      const es = await getScheduleEmployees(restaurant)
      setEmployees(es.filter(e => e.isActive !== false))
    } catch { showMsg('保存失败', 'error') }
    finally { setSaving(false) }
  }
  const deleteEmployee = async (id: number) => {
    if (!window.confirm('确定删除该员工吗？')) return
    try {
      await deleteScheduleEmployee(id)
      showMsg('员工已删除')
      const es = await getScheduleEmployees(restaurant)
      setEmployees(es.filter(e => e.isActive !== false))
    } catch { showMsg('删除失败', 'error') }
  }

  // 按部门分组 + 职位排序的行
  const rows = useMemo(() => {
    const out: { dept: string; emp: Emp; rec: PhoneRec | undefined }[] = []
    departments.forEach(dept => {
      const deptEmps = employees.filter(e => e.workArea === dept.key).sort((a, b) => {
        const ra = positionHierarchy[dept.key]?.indexOf(a.position || '') ?? 999
        const rb = positionHierarchy[dept.key]?.indexOf(b.position || '') ?? 999
        return ra - rb
      })
      deptEmps.forEach(emp => {
        out.push({ dept: dept.name, emp, rec: records.find(r => r.employeeId === emp.id) })
      })
    })
    return out
  }, [employees, records])

  return (
    <div className="ph-root">
      <div className="container">
        <div className="header">
          <h1 id="page-title">手机管理系统 - {restaurant}</h1>
          <div className="restaurant-selector">
            <button className="selector-button" onClick={() => setRestaurantOpen(!restaurantOpen)}>
              <span id="current-restaurant">{restaurant}</span>
              <i className="fas fa-chevron-down"></i>
            </button>
            <div className={'selector-dropdown' + (restaurantOpen ? ' show' : '')} id="restaurant-dropdown">
              {restaurants.map(r => (
                <div key={r} className={'dropdown-item' + (r === restaurant ? ' active' : '')} data-restaurant={r}
                  onClick={() => { setRestaurant(r); setRestaurantOpen(false) }}>{r}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="schedule-controls">
              <div className="controls-left">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="fas fa-calendar" style={{ color: '#ff5c00' }}></i>
                    选择日期
                  </label>
                  <div className="enhanced-date-picker" id="date-picker">
                    <input type="date" id="selected-date" value={date} onChange={(e) => setDate(e.target.value)}
                      style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 'clamp(8px, 0.74vw, 14px)', fontWeight: 600, color: '#374151', padding: 0, width: 140 }} />
                  </div>
                </div>
              </div>
              <div className="controls-right">
                <button className="btn-generate" onClick={() => setPanel(true)}>
                  <i className="fas fa-users"></i> 员工管理
                </button>
                <button className="btn-control" onClick={downloadPDF}>
                  <i className="fas fa-file-pdf"></i> 下载PDF
                </button>
                <button className="btn-control btn-save" onClick={saveAll} disabled={saving} style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>{saving ? '保存中...' : <><i className="fas fa-save" /> 保存所有</>}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-wrapper">
            <table id="phoneTable">
              <thead>
                <tr>
                  <th className="no-col" rowSpan={2}>NO</th>
                  <th colSpan={2} style={{ position: 'relative', width: 200, background: '#f99e00' }}>
                    <div style={{ textAlign: 'left', paddingLeft: 5, fontWeight: 'bold' }}>DATE: {date}</div>
                  </th>
                  <th className="position-col" rowSpan={2}>POSITION</th>
                  <th className="get-col" rowSpan={2}>GET</th>
                  <th className="time-start-col" colSpan={2} style={{ borderLeft: '2px solid #fff', borderRight: '2px solid #fff' }}>TIME</th>
                  <th className="return-col" rowSpan={2}>RETURN</th>
                </tr>
                <tr>
                  <th colSpan={2} style={{ position: 'relative', width: 200, background: '#f99e00' }}>
                    <div style={{ textAlign: 'left', paddingLeft: 5, fontWeight: 'bold' }}>NAME</div>
                  </th>
                  <th className="time-start-col" style={{ borderLeft: '2px solid #fff' }}>START</th>
                  <th className="time-end-col" style={{ borderRight: '2px solid #fff' }}>END</th>
                </tr>
              </thead>
              <tbody id="tableBody">
                {loading && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                      <div className="loading" style={{ margin: '0 auto 10px' }}></div>
                      <div>正在加载数据...</div>
                    </td>
                  </tr>
                )}
                {!loading && employees.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                      <div className="alert alert-error">没有找到员工数据，请先添加员工</div>
                    </td>
                  </tr>
                )}
                {!loading && rows.map((row, i) => {
                  const r = row.rec
                  return (
                    <tr key={row.emp.id} data-employee-id={row.emp.id}>
                      <td style={{ fontWeight: 'bold' }}>{i + 1}</td>
                      <td colSpan={2} style={{ textAlign: 'left', paddingLeft: 12, fontWeight: 'bold' }}>{row.emp.name.toUpperCase()}</td>
                      <td style={{ fontWeight: 'bold' }}>{getWorkAreaName(row.emp.workArea)}</td>
                      <td>
                        <input type="checkbox" data-field="get_checked"
                          checked={!!r?.getChecked}
                          onChange={(e) => updateRecord(row.emp.id, 'getChecked', e.target.checked)} />
                      </td>
                      <td>
                        <input type="time" data-field="start_time" value={r?.startTime || ''}
                          onChange={(e) => updateRecord(row.emp.id, 'startTime', e.target.value)} />
                      </td>
                      <td>
                        <input type="time" data-field="end_time" value={r?.endTime || ''}
                          onChange={(e) => updateRecord(row.emp.id, 'endTime', e.target.value)} />
                      </td>
                      <td>
                        <input type="checkbox" data-field="return_checked"
                          checked={!!r?.returnChecked}
                          onChange={(e) => updateRecord(row.emp.id, 'returnChecked', e.target.checked)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && (
        <div className={'alert alert-' + toast.type} style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, minWidth: 250, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>{toast.msg}</div>
      )}

      {/* 员工管理面板 */}
      {panel && (
        <div className="modal" style={{ display: 'block', zIndex: 10000 }} onClick={(e) => { if (e.target === e.currentTarget) setPanel(false) }}>
          <div className="modal-content" style={{ maxWidth: 900, maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <ModalClose onClick={() => setPanel(false)} />
              <h3 style={{ marginTop: 8 }}><i className="fas fa-users"></i> 员工管理</h3>
            </div>
            <div style={{ marginTop: 20 }}>
              <button className="btn-generate" onClick={() => { setEmpId(null); setEmpName(''); setEmpPhone(''); setEmpArea('service_line'); setEmpPosition(''); setEmpModal(true) }}>
                <i className="fas fa-user-plus"></i> 添加新员工
              </button>
              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>姓名</th>
                      <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>手机</th>
                      <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>职位</th>
                      <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>工作区域</th>
                      <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(e => (
                      <tr key={e.id}>
                        <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center' }}>{e.phone}</td>
                        <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center' }}>{e.position}</td>
                        <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center' }}>{departments.find(d => d.key === e.workArea)?.name || e.workArea}</td>
                        <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center' }}>
                          <button className="btn-action btn-delete" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => deleteEmployee(e.id)}>删除</button>
                        </td>
                      </tr>
                    ))}
                    {employees.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>暂无员工</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 员工模态框 */}
      {empModal && (
        <div className="modal" style={{ display: 'block', zIndex: 10001 }}>
          <div className="modal-content">
            <div className="modal-header">
              <ModalClose onClick={() => setEmpModal(false)} />
              <h3 style={{ marginTop: 8 }}><i className="fas fa-user-plus"></i> {empId ? '编辑员工' : '添加员工'}</h3>
            </div>
            <div className="form-group">
              <label>姓名:</label>
              <input type="text" id="employeeName" value={empName} onChange={(e) => setEmpName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>手机号码:</label>
              <input type="tel" id="employeePhone" value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label>工作区域:</label>
              <select id="employeeWorkArea" value={empArea} onChange={(e) => { setEmpArea(e.target.value); setEmpPosition('') }}>
                <option value="service_line">Service Line</option>
                <option value="sushi_bar">Sushi Bar</option>
                <option value="kitchen">Kitchen</option>
              </select>
            </div>
            <div className="form-group">
              <label>职位:</label>
              <select id="employeePosition" value={empPosition} onChange={(e) => setEmpPosition(e.target.value)}>
                <option value="">-- 请选择职位 --</option>
                {(positionHierarchy[empArea] || []).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-actions">
              <button className="btn-action btn-cancel" onClick={() => setEmpModal(false)}><i className="fas fa-times"></i> 取消</button>
              <button className="btn-action btn-save" onClick={saveEmployee} disabled={saving}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-check')}></i> 保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
