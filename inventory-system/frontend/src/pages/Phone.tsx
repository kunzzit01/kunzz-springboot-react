import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { deleteScheduleEmployee, getPhoneRecordsByDate, getScheduleEmployees, savePhoneRecordsByDate, saveScheduleEmployee } from '../api'
import '../styles/phone.css'
import ModalClose from '../components/ModalClose'
import DateField from '../components/DateField'
import { showToast } from '../utils/toast'

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
  // 分店以 URL 的 ?restaurant= 为准，且必须用 useSearchParams 响应式读取：
  // 侧边栏 J1/J2/J3 走的是前端路由跳转（navigate，不刷新页面），只在挂载时读一次
  // window.location 的话，在手机记录页里点另一家分店会「地址栏变成 J2、内容还是 J1」
  // （组件没重新挂载，state 停在旧分店）。改分店用 replace，不额外压历史记录。
  const [searchParams, setSearchParams] = useSearchParams()
  const urlRestaurant = searchParams.get('restaurant')
  const restaurant = urlRestaurant && restaurants.includes(urlRestaurant) ? urlRestaurant : 'J1'
  const setRestaurant = useCallback((r: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('restaurant', r)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [employees, setEmployees] = useState<Emp[]>([])
  const [records, setRecords] = useState<PhoneRec[]>([])
  const [restaurantOpen, setRestaurantOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  // 员工管理面板
  const [panel, setPanel] = useState(false)
  const [empModal, setEmpModal] = useState(false)
  const [empId, setEmpId] = useState<number | null>(null)
  const [empName, setEmpName] = useState('')
  const [empPhone, setEmpPhone] = useState('')
  const [empArea, setEmpArea] = useState('service_line')
  const [empPosition, setEmpPosition] = useState('')

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  // 餐厅切换：同步 URL（缺 restaurant / 非法值时补成当前分店）+ 重新取数
  useEffect(() => {
    if (searchParams.get('restaurant') !== restaurant) {
      const next = new URLSearchParams(searchParams)
      next.set('restaurant', restaurant)
      setSearchParams(next, { replace: true })
    }
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

  /** 下载 PDF（纵向）—— 对齐旧版 phone_manage.js 的做法：
   *  克隆页面表格 → 重排版（勾选画成方框、时间变文字、统一字号）→ 离屏 200mm 容器 →
   *  html2canvas(scale 3) → 铺满 A4 宽，超高按页切片。成品与页面一致且字体够大、清晰。 */
  const downloadPDF = async () => {
    if (employees.length === 0) { showMsg('没有数据可下载', 'error'); return }
    const w = window as any
    if (!w.html2canvas || !w.jspdf) { showMsg('PDF 库未加载', 'error'); return }
    const { jsPDF } = w.jspdf
    showMsg('正在生成 PDF...', 'info')
    let container: HTMLDivElement | null = null
    try {
      const original = document.querySelector('.ph-root #phoneTable') as HTMLTableElement | null
      if (!original) { showMsg('找不到表格', 'error'); return }

      // ---------- 1. 克隆表格并重排版（对齐旧版） ----------
      const table = original.cloneNode(true) as HTMLTableElement
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:14px;margin:0'
      // 输入控件 → 静态内容：复选框画成方框（选中=黑底白✓）、时间转文本
      table.querySelectorAll('input').forEach((node) => {
        const input = node as HTMLInputElement
        const td = input.parentElement as HTMLTableCellElement
        if (!td) return
        if (input.type === 'checkbox') {
          const checked = input.checked
          td.innerHTML = `<div style="width:12px;height:12px;border:0.3px solid #000;margin:0 auto;`
            + `display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;`
            + `background:${checked ? '#000' : 'transparent'};color:${checked ? '#fff' : '#000'}">`
            + `${checked ? '✓' : ''}</div>`
          td.style.textAlign = 'center'
          td.style.padding = '4px'
        } else if (input.type === 'time') {
          td.textContent = input.value || ''
          td.style.textAlign = 'center'
        }
      })
      const exact = (el: HTMLElement) => {
        el.style.setProperty('-webkit-print-color-adjust', 'exact')
        el.style.setProperty('print-color-adjust', 'exact')
      }
      table.querySelectorAll('th').forEach((node) => {
        const th = node as HTMLTableCellElement
        th.style.background = '#f99e00'
        th.style.color = 'white'
        th.style.padding = '5px 3px'
        th.style.border = '0.3px solid #000'
        th.style.fontWeight = 'bold'
        th.style.textAlign = 'center'
        th.style.fontSize = '12px'
        exact(th)
      })
      // 隔行底色（与页面一致：奇数行浅橙）
      table.querySelectorAll('tbody tr').forEach((node, index) => {
        const tr = node as HTMLTableRowElement
        tr.style.backgroundColor = index % 2 === 1 ? 'rgb(255, 230, 183)' : '#ffffff'
        exact(tr)
      })
      table.querySelectorAll('tbody td').forEach((node) => {
        const td = node as HTMLTableCellElement
        td.style.padding = '4px 3px'
        td.style.border = '0.3px solid #000'
        td.style.textAlign = 'center'
        td.style.fontSize = '12px'
        exact(td)
      })

      // ---------- 2. 离屏容器（宽 200mm → 字号相对纸面够大） ----------
      // 放进 .ph-root 内，好让 phone.css 里的列宽规则（th.no-col/name-col/...）生效
      const root = document.querySelector('.ph-root') as HTMLElement | null
      container = document.createElement('div')
      container.style.cssText = 'position:absolute;left:-9999px;top:0;width:200mm;background:#fff;'
      exact(container)
      container.appendChild(table)
      ;(root || document.body).appendChild(container)
      await new Promise((resolve) => setTimeout(resolve, 100))

      const canvas = await w.html2canvas(container, {
        scale: 3, useCORS: true, backgroundColor: '#ffffff',
        width: container.offsetWidth, height: container.scrollHeight,
      })

      // ---------- 3. 铺到 A4 纵向（超高按页切片） ----------
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = canvas.width
      const imgH = canvas.height
      const finalW = pageW
      const finalH = imgH * pageW / imgW

      if (finalH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, finalW, finalH)
      } else {
        let sourceY = 0
        let pageIndex = 0
        while (sourceY < imgH) {
          const remainingSource = imgH - sourceY
          if (remainingSource <= 0) break
          const displayLeft = finalH - (sourceY / imgH) * finalH
          const pageDisplayH = Math.min(pageH, displayLeft)
          const srcH = Math.min((pageDisplayH / finalH) * imgH, remainingSource)
          if (srcH < 1) break
          if (pageIndex > 0) pdf.addPage()
          const slice = document.createElement('canvas')
          slice.width = imgW
          slice.height = srcH
          slice.getContext('2d')!.drawImage(canvas, 0, sourceY, imgW, srcH, 0, 0, imgW, srcH)
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, finalW, (srcH / imgH) * finalH)
          sourceY += srcH
          pageIndex++
        }
      }

      pdf.save(`手机管理_${restaurant}_${date.replace(/-/g, '')}.pdf`)
      showMsg('PDF 已下载')
    } catch (e) { console.error(e); showMsg('PDF 生成失败', 'error') }
    finally { container?.remove() }
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
  /** 打开「编辑员工」模态框：预填当前值（对齐旧系统：员工管理每行都有编辑/删除） */
  const openEditEmployee = (e: Emp) => {
    setEmpId(e.id)
    setEmpName(e.name || '')
    setEmpPhone(e.phone || '')
    setEmpArea(e.workArea || 'service_line')
    setEmpPosition(e.position || '')
    setEmpModal(true)
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
                  {/* 2026-10-29：去掉外层 .enhanced-date-picker（它自带边框），否则和 DateField 的胶囊边框叠成双框；
                      直接用 DateField，尺寸/间距按本页控件统一 */}
                  <DateField id="selected-date" value={date} onChange={setDate}
                    className="ph-date-input" wrapperStyle={{ width: 'clamp(150px, 12vw, 200px)' }} />
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
                        <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button className="btn-action btn-edit" style={{ padding: '6px 12px', fontSize: 12, marginRight: 8 }} onClick={() => openEditEmployee(e)}>编辑</button>
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
                {/* 已存档的职位不在当前区域的层级表里时，补一个选项，避免编辑时下拉显示空白 */}
                {empPosition && !(positionHierarchy[empArea] || []).includes(empPosition) &&
                  <option value={empPosition}>{empPosition}</option>}
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
