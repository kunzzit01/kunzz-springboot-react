import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteScheduleEmployee, deleteScheduleRecord, deleteShift, getLeaveTypes, getScheduleEmployees, getScheduleRecords,
  getShifts, saveScheduleEmployee, saveScheduleRecords, saveShift, upsertScheduleRecord
} from '../api'
import '../styles/schedule.css'
import ModalClose from '../components/ModalClose'
import { showToast } from '../utils/toast'

interface Emp { id: number; name: string; phone?: string; position?: string; workArea?: string; restaurant?: string; isActive?: boolean }
interface Shift { id: number; shiftCode: string; restaurant?: string; startTime?: string; endTime?: string }
interface LeaveType { id?: number; code: string; name: string; color?: string; type?: string; description?: string }
interface Rec { id?: number; employeeId: number; scheduleDate: string; valueType: string; valueCode: string; notes?: string | null }
interface CellSel { employeeId: number; dateStr: string }

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

const defaultHolidayTypes: LeaveType[] = [
  { code: 'IPH', name: 'International Public Holiday', description: '国际公共假期', color: '#0ea5e9', type: 'holiday' },
  { code: 'ICPH', name: 'International School Public Holiday', description: '国际学校公共假期', color: '#8b5cf6', type: 'holiday' }
]

function formatTime(timeStr?: string) {
  if (!timeStr) return ''
  const parts = timeStr.split(':')
  const hour = parseInt(parts[0])
  const minute = parts[1]
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return hour12 + ':' + minute + ampm
}

function getLeaveTextColor(code: string) {
  const upper = (code || '').toUpperCase()
  return (upper === 'RO' || upper === 'DO') ? '#FFFFFF' : '#000000'
}

function getContrastColor(color?: string) {
  if (!color || color === 'transparent' || color === 'white') return '#000000'
  let r = 0, g = 0, b = 0
  if (color.startsWith('#')) {
    r = parseInt(color.substr(1, 2), 16); g = parseInt(color.substr(3, 2), 16); b = parseInt(color.substr(5, 2), 16)
  } else if (color.startsWith('rgb')) {
    const m = color.match(/\d+/g)
    if (m && m.length >= 3) { r = parseInt(m[0]); g = parseInt(m[1]); b = parseInt(m[2]) }
    else return '#000000'
  } else return '#000000'
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5 ? '#000000' : '#ffffff'
}

function decodeHolidayOverlayNotes(notes?: string | null) {
  if (!notes) return null
  const t = notes.trim()
  if (!t || t === 'null') return null
  if (t.startsWith('{')) {
    try {
      const d = JSON.parse(t)
      if (d && (d.overlay || d.original_type || d.original_code || d.original)) {
        return { type: d.original_type || d.original?.type || 'shift', code: d.original_code || d.original?.code || d.code || '', notes: d.original_notes || d.original?.notes || d.notes || '' }
      }
    } catch { /* ignore */ }
  }
  // 兼容老系统数据：notes 为普通文本时视为 shift 班次代码（公共假期上的加班班次）
  return { type: 'shift', code: t, notes: '' }
}

function encodeHolidayOverlayData(r?: Rec) {
  if (!r || !r.valueType || r.valueType === 'holiday') return r?.notes || null
  return JSON.stringify({ overlay: true, original_type: r.valueType, original_code: r.valueCode, original_notes: r.notes || '' })
}


export default function Schedule() {
  const [restaurant, setRestaurant] = useState(() => {
    const r = new URL(window.location.href).searchParams.get('restaurant')
    return r === 'J1' || r === 'J2' || r === 'J3' ? r : 'J1'
  })
  const [employees, setEmployees] = useState<Emp[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [records, setRecords] = useState<Rec[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [restaurantOpen, setRestaurantOpen] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [dateType, setDateType] = useState<'year' | 'month' | null>(null)
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  // 排班模态框
  const [cellSel, setCellSel] = useState<CellSel | null>(null)
  const [schType, setSchType] = useState('')
  const [schValue, setSchValue] = useState('')
  const [schNotes, setSchNotes] = useState('')
  // 管理面板
  const [panel, setPanel] = useState<'shifts' | 'employees' | 'legend' | null>(null)
  // 员工模态框
  const [empModal, setEmpModal] = useState(false)
  const [empId, setEmpId] = useState<number | null>(null)
  const [empName, setEmpName] = useState('')
  const [empPhone, setEmpPhone] = useState('')
  const [empArea, setEmpArea] = useState('service_line')
  const [empPosition, setEmpPosition] = useState('')
  // 班次模态框
  const [shiftModal, setShiftModal] = useState(false)
  const [shiftId, setShiftId] = useState<number | null>(null)
  const [shiftCode, setShiftCode] = useState('')
  const [shiftStart, setShiftStart] = useState('')
  const [shiftEnd, setShiftEnd] = useState('')
  // 整列假期
  const [colHoliday, setColHoliday] = useState<{ dateStr: string; day: number } | null>(null)
  // 修改集合（保存所有更改）
  const [modified, setModified] = useState<Map<string, { employeeId: number; dateStr: string; value: string; valueType: string }>>(new Map())
  const [selectedCells, setSelectedCells] = useState<string[]>([])
  const [batchModal, setBatchModal] = useState(false)
  const [batchValue, setBatchValue] = useState('')
  const [editModeHint, setEditModeHint] = useState(false)
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const autoSaveTimers = useRef<Map<string, any>>(new Map())
  const selectionStartRef = useRef<string | null>(null)
  const isSelectingRef = useRef(false)
  const recordsRef = useRef<Rec[]>([])
  recordsRef.current = records
  const modifiedRef = useRef<Map<string, { employeeId: number; dateStr: string; value: string }>>(new Map())
  const dirtyCellsRef = useRef<Map<string, string>>(new Map())

  const showMsg = useCallback((msg: string, type = 'success') => showToast(msg, type), [])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('restaurant', restaurant)
    window.history.replaceState({}, '', url)
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant])

  const loadAll = async () => {
    try {
      const [es, ss, ls] = await Promise.all([getScheduleEmployees(restaurant), getShifts(), getLeaveTypes()])
      setEmployees(es.filter(e => e.isActive !== false))
      setShifts(ss.filter(s => !s.restaurant || s.restaurant === restaurant))
      const lts: LeaveType[] = ls.length > 0 ? (ls as LeaveType[]) : []
      defaultHolidayTypes.forEach(d => {
        if (!lts.some(lt => lt.code === d.code && lt.type === d.type)) lts.push(d)
      })
      setLeaveTypes(lts)
    } catch { /* ignore */ }
    try {
      const monthStr = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
      const recs = await getScheduleRecords(monthStr)
      setRecords(recs)
    } catch { /* ignore */ }
  }

  // 年月变化重新加载记录
  useEffect(() => {
    const monthStr = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
    getScheduleRecords(monthStr).then(setRecords).catch(() => {})
  }, [year, month])

  const monthStr = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
  const daysInMonth = new Date(year, month, 0).getDate()
  const weekdayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  // 该餐厅员工 id 集合（用于过滤跨餐厅记录）
  const empIds = useMemo(() => new Set(employees.map(e => e.id)), [employees])
  const localRecords = useMemo(() => records.filter(r => empIds.has(r.employeeId)), [records, empIds])

  const findRec = (employeeId: number, dateStr: string) =>
    localRecords.find(r => r.employeeId === employeeId && r.scheduleDate === dateStr)

  const getCellDisplay = (r?: Rec) => {
    let color = 'transparent', textColor = '#000000', code = r?.valueCode || '', showText = true, shiftCode: string | null = null
    if (r) {
      if (r.valueType === 'shift') {
        color = 'transparent'; showText = true
      } else if (r.valueType === 'leave') {
        const lt = leaveTypes.find(x => x.code === r.valueCode)
        if (lt) { color = lt.color || 'transparent'; textColor = getLeaveTextColor(r.valueCode); showText = true }
      } else if (r.valueType === 'holiday') {
        const ht = leaveTypes.find(x => x.code === r.valueCode)
        const overlay = decodeHolidayOverlayNotes(r.notes)
        if (overlay && overlay.type === 'leave') {
          const lt = leaveTypes.find(x => x.code === overlay.code && x.type === 'leave')
          color = lt ? (lt.color || '') : (ht ? (ht.color || '') : '#f3f4f6')
          if (overlay.code) { code = overlay.code; showText = true }
        } else if (overlay && overlay.type === 'shift') {
          color = ht ? (ht.color || '') : '#f3f4f6'
          shiftCode = overlay.code || null
        } else {
          color = ht ? (ht.color || '') : '#f3f4f6'
          // 对齐 live：纯假期只显示底色，不显示假期代码文字
          showText = false
        }
      }
    }
    return { color, textColor, code, showText, shiftCode }
  }


  // ---------- 排班模态框 ----------
  const openSchModal = (employeeId: number, dateStr: string, name: string) => {
    setCellSel({ employeeId, dateStr })
    setSchType('')
    setSchValue('')
    setSchNotes('')
    const existing = findRec(employeeId, dateStr)
    if (existing && existing.valueType === 'holiday') {
      const overlay = decodeHolidayOverlayNotes(existing.notes)
      if (overlay && overlay.code) {
        setSchType(overlay.type === 'leave' ? 'leave' : 'shift')
        setSchNotes(overlay.notes || '')
        setSchValue(overlay.code)
      } else {
        // 纯假期：允许选择班次作为加班
        setSchType('')
      }
    }
  }
  const empNameOf = (id: number) => employees.find(e => e.id === id)?.name || ''

  const saveSchedule = async () => {
    if (saving) return
    if (!cellSel) return
    if (!schType || !schValue) { showMsg('请选择排班类型和值', 'error'); return }
    const existing = findRec(cellSel.employeeId, cellSel.dateStr)
    let notes: string | null = schNotes
    if (schType === 'holiday') {
      if (existing && existing.valueType !== 'holiday') notes = encodeHolidayOverlayData(existing)
      else if (existing && existing.valueType === 'holiday') notes = existing.notes || null
    }
    // 保存：写入记录（先本地合并，再全量保存）
    const others = records.filter(r => r.employeeId !== cellSel.employeeId || r.scheduleDate !== cellSel.dateStr)
    const newRec: Rec = { employeeId: cellSel.employeeId, scheduleDate: cellSel.dateStr, valueType: schType, valueCode: schValue, notes: notes || undefined }
    const all = [...others, newRec]
    setSaving(true)
    try {
      await saveScheduleRecords(monthStr, all)
      setRecords(all)
      setCellSel(null)
      showMsg('排班已保存')
    } catch { showMsg('保存失败', 'error') }
    finally { setSaving(false) }
  }

  const deleteSchedule = async () => {
    if (!cellSel) return
    const others = records.filter(r => r.employeeId !== cellSel.employeeId || r.scheduleDate !== cellSel.dateStr)
    try {
      await saveScheduleRecords(monthStr, others)
      setRecords(others)
      setCellSel(null)
      showMsg('排班已删除')
    } catch { showMsg('删除失败', 'error') }
  }

  // ---------- 整列公共假期 ----------
  const applyColumnHoliday = async (code: string, type: string) => {
    if (!colHoliday) return
    const dateStr = colHoliday.dateStr
    let next = [...records]
    employees.forEach(e => {
      const existing = next.find(r => r.employeeId === e.id && r.scheduleDate === dateStr)
      if (existing) {
        next = next.map(r => r === existing ? { ...r, valueType: 'holiday', valueCode: code, notes: encodeHolidayOverlayData(existing) } : r)
      } else {
        next.push({ employeeId: e.id, scheduleDate: dateStr, valueType: 'holiday', valueCode: code })
      }
    })
    try {
      await saveScheduleRecords(monthStr, next)
      setRecords(next)
      setColHoliday(null)
      showMsg('公共假期已应用到所有员工')
    } catch { showMsg('保存失败', 'error') }
  }

  const clearColumnSchedule = async () => {
    if (!colHoliday) return
    const dateStr = colHoliday.dateStr
    const next = records.filter(r => r.scheduleDate !== dateStr)
    try {
      await saveScheduleRecords(monthStr, next)
      setRecords(next)
      setColHoliday(null)
      showMsg('整列已清除')
    } catch { showMsg('清除失败', 'error') }
  }

  // ---------- 复制到下月 ----------
  const copyToNextMonth = async () => {
    if (localRecords.length === 0) { showMsg('当前月份没有排班数据可复制', 'error'); return }
    let ny = year, nm = month + 1
    if (nm > 12) { nm = 1; ny += 1 }
    if (!window.confirm('确定要将 ' + year + '年' + month + '月 的排班表复制到 ' + ny + '年' + nm + '月 吗？\n\n注意：如果 ' + ny + '年' + nm + '月 已有排班数据，将会被覆盖。')) return
    const nextMonthStr = String(ny).padStart(4, '0') + '-' + String(nm).padStart(2, '0')
    const daysNext = new Date(ny, nm, 0).getDate()
    // 拉取下月现有记录（保留其他餐厅）
    let nextRecs: Rec[] = []
    try { nextRecs = await getScheduleRecords(nextMonthStr) } catch { /* ignore */ }
    const otherRest = nextRecs.filter(r => !empIds.has(r.employeeId))
    const copied: Rec[] = []
    localRecords.forEach(r => {
      const day = Number(r.scheduleDate.split('-')[2])
      if (day <= daysNext) {
        copied.push({ ...r, id: undefined, scheduleDate: nextMonthStr + '-' + String(day).padStart(2, '0') })
      }
    })
    try {
      await saveScheduleRecords(nextMonthStr, [...otherRest, ...copied])
      showMsg('已复制到下个月')
    } catch { showMsg('复制失败', 'error') }
  }

  // ---------- 保存所有更改（批处理） ----------
  const saveAllChanges = async () => {
    if (saving) return
    const modifiedMap = modifiedRef.current
    if (modifiedMap.size === 0) { showMsg('没有需要保存的更改', 'info'); return }
    if (!window.confirm('确定要保存 ' + modifiedMap.size + ' 个更改吗？')) return
    setSaving(true)
    try {
      let next = [...records]
      for (const [key, data] of modifiedMap.entries()) {
        const existing = next.find(r => r.employeeId === data.employeeId && r.scheduleDate === data.dateStr)
        const v = data.value.trim().toUpperCase()
        if (!v) {
          next = next.filter(r => !(r.employeeId === data.employeeId && r.scheduleDate === data.dateStr))
        } else {
          const shiftCodes = new Set(shifts.map(s => s.shiftCode))
          const leaveCodes = new Set(leaveTypes.map(l => l.code))
          let vt = 'shift'
          if (leaveCodes.has(v) && !shiftCodes.has(v)) vt = 'leave'
          const rec: Rec = { employeeId: data.employeeId, scheduleDate: data.dateStr, valueType: vt, valueCode: v }
          if (existing) {
            const others = next.filter(r => !(r.employeeId === data.employeeId && r.scheduleDate === data.dateStr))
            next = [...others, rec]
          } else {
            next = [...next, rec]
          }
        }
      }
      await saveScheduleRecords(monthStr, next)
      setRecords(next)
      modifiedRef.current.clear()
      modifiedMap.forEach((_, key) => {
        const cell = cellRefs.current.get(key)
        if (cell) cell.classList.remove('modified')
      })
      dirtyCellsRef.current.clear()
      showMsg('所有更改已保存')
    } catch { showMsg('保存失败', 'error') }
    finally { setSaving(false) }
  }

  // ================= 编辑模式（对齐线上：contentEditable 直接编辑 + 自动保存 + 多选/复制/粘贴/批量输入） =================

  const cellKey = (empId: number, dateStr: string) => empId + '|' + dateStr

  const getCellRef = (empId: number, dateStr: string) => cellRefs.current.get(cellKey(empId, dateStr))

  const determineCellValueType = (value: string) => {
    if (!value) return null
    const up = value.toUpperCase()
    if (shifts.find(s => s.shiftCode === up)) return { type: 'shift', code: up }
    const leave = leaveTypes.find(lt => lt.code === up && lt.type === 'leave')
    if (leave) return { type: 'leave', code: up }
    const holiday = leaveTypes.find(lt => lt.code === up && lt.type === 'holiday')
    if (holiday) return { type: 'holiday', code: up }
    return { type: 'shift', code: up }
  }

  const applyCellStyle = (cell: HTMLDivElement, value: string, keepHolidayBg = false) => {
    if (!value) {
      if (!keepHolidayBg) cell.style.background = ''
      cell.style.color = '#000'
      return
    }
    const shift = shifts.find(s => s.shiftCode === value)
    if (shift) {
      cell.style.color = '#000'
      if (keepHolidayBg && cell.dataset.origBg) cell.style.background = cell.dataset.origBg
      else cell.style.background = ''
      return
    }
    const leave = leaveTypes.find(lt => lt.code === value && lt.type === 'leave')
    if (leave) {
      cell.style.background = leave.color || ''
      cell.style.color = getLeaveTextColor(value)
      return
    }
    const holiday = leaveTypes.find(lt => lt.code === value && lt.type === 'holiday')
    if (holiday) {
      cell.style.background = holiday.color || ''
      cell.style.color = '#000'
      return
    }
    cell.style.color = '#000'
    if (keepHolidayBg && cell.dataset.origBg) cell.style.background = cell.dataset.origBg
    else cell.style.background = ''
  }

  const markModified = (empId: number, dateStr: string, value: string) => {
    modifiedRef.current.set(cellKey(empId, dateStr), { employeeId: empId, dateStr, value })
    const cell = cellRefs.current.get(cellKey(empId, dateStr))
    if (cell) cell.classList.add('modified')
  }
  const unmarkModified = (key: string) => {
    if (!modifiedRef.current.has(key)) return
    modifiedRef.current.delete(key)
    const cell = cellRefs.current.get(key)
    if (cell) cell.classList.remove('modified')
  }

  /** 自动保存（800ms debounce，对齐线上 AUTO_SAVE_DEBOUNCE） */
  const scheduleAutoSave = (empId: number, dateStr: string, cell: HTMLDivElement) => {
    const key = cellKey(empId, dateStr)
    // 幂等：若已保存过（modified 已清除）则不再保存
    if (!modifiedRef.current.has(key)) return
    if (autoSaveTimers.current.has(key)) clearTimeout(autoSaveTimers.current.get(key))
    autoSaveTimers.current.set(key, setTimeout(() => {
      autoSaveTimers.current.delete(key)
      // 定时器触发时再次检查
      if (!modifiedRef.current.has(key)) return
      autoSaveCell(empId, dateStr, cell)
    }, 800))
  }

  const autoSaveCell = async (empId: number, dateStr: string, cell: HTMLDivElement) => {
    const value = (cell.textContent || '').trim().toUpperCase()
    const existing = findRec(empId, dateStr)
    try {
      if (!value) {
        if (existing && existing.valueType === 'holiday') {
          await upsertScheduleRecord({ employeeId: empId, scheduleDate: dateStr, valueType: 'holiday', valueCode: existing.valueCode, notes: null })
          const rec = { ...existing, notes: null }
          setRecords(prev => prev.map(r => r === existing ? rec : r))
          applyCellStyle(cell, existing.valueCode || '')
          if (existing.valueCode) cell.textContent = existing.valueCode
        } else {
          if (existing) await deleteScheduleRecord(empId, dateStr)
          setRecords(prev => prev.filter(r => !(r.employeeId === empId && r.scheduleDate === dateStr)))
          cell.style.background = ''
          cell.style.color = '#000'
          cell.innerHTML = '&nbsp;'
        }
        unmarkModified(cellKey(empId, dateStr))
        dirtyCellsRef.current.delete(cellKey(empId, dateStr))
        return
      }
      const valueInfo = determineCellValueType(value)
      if (!valueInfo) return
      let notes: string | null = null
      if (valueInfo.type === 'holiday') {
        if (existing && existing.valueType !== 'holiday') notes = encodeHolidayOverlayData(existing)
        else if (existing && existing.valueType === 'holiday') notes = existing.notes || null
      } else if (existing && existing.valueType === valueInfo.type) {
        notes = existing.notes || null
      }
      await upsertScheduleRecord({ employeeId: empId, scheduleDate: dateStr, valueType: valueInfo.type, valueCode: valueInfo.code, notes: notes || undefined })
      const rec = { employeeId: empId, scheduleDate: dateStr, valueType: valueInfo.type, valueCode: valueInfo.code, notes: notes || undefined }
      setRecords(prev => {
        const others = prev.filter(r => !(r.employeeId === empId && r.scheduleDate === dateStr))
        return [...others, rec]
      })
      applyCellStyle(cell, valueInfo.code)
      unmarkModified(cellKey(empId, dateStr))
      dirtyCellsRef.current.delete(cellKey(empId, dateStr))
    } catch (e) {
      console.error('自动保存失败:', e)
      showMsg('自动保存失败，请稍后重试', 'error')
    }
  }

  // ---------- 单元格事件 ----------
  const handleCellFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const cell = e.currentTarget
    const empId = Number(cell.dataset.empId)
    const dateStr = cell.dataset.date || ''
    const rec = findRec(empId, dateStr)
    const cd = getCellDisplay(rec)
    cell.dataset.origValue = (cell.textContent || '').trim()
    cell.dataset.origBg = cd.color !== 'transparent' ? cd.color : ''
    cell.dataset.origText = cd.textColor || '#000'
    const value = (cell.textContent || '').trim()
    if (!value || value === '' || value === '\u00A0') {
      cell.textContent = ''
    } else {
      const range = document.createRange()
      range.selectNodeContents(cell)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  const handleCellInput = (e: React.FormEvent<HTMLDivElement>) => {
    const cell = e.currentTarget
    const empId = Number(cell.dataset.empId)
    const dateStr = cell.dataset.date || ''
    let value = (cell.textContent || '').trim().toUpperCase()
    if ((cell.textContent || '').trim() !== value) {
      const sel = window.getSelection()
      let cursorPos = value.length
      try { if (sel && sel.rangeCount > 0) cursorPos = sel.getRangeAt(0).startOffset } catch { /* ignore */ }
      cell.textContent = value
      if (cell.firstChild && value.length > 0) {
        try {
          const range = document.createRange()
          range.setStart(cell.firstChild, Math.min(cursorPos, value.length))
          range.collapse(true)
          sel?.removeAllRanges()
          sel?.addRange(range)
        } catch { /* ignore */ }
      }
    }
    const hasHolidayBg = !!(cell.dataset.origBg && cell.dataset.origBg !== '' && cell.dataset.origBg !== 'transparent')
    applyCellStyle(cell, value, hasHolidayBg)
    cell.classList.add('modified')
    markModified(empId, dateStr, value)
    // 标记脏单元格：React 渲染时保持上次写入的 html，避免覆盖用户正在编辑的内容
    if (!dirtyCellsRef.current.has(cellKey(empId, dateStr))) {
      dirtyCellsRef.current.set(cellKey(empId, dateStr), cell.innerHTML)
    }
    // 输入停顿后自动保存（不依赖 blur，与线上"内容自动保存"一致）
    scheduleAutoSave(empId, dateStr, cell)
  }

  const handleCellBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const cell = e.currentTarget
    const empId = Number(cell.dataset.empId)
    const dateStr = cell.dataset.date || ''
    const value = (cell.textContent || '').trim().toUpperCase()
    const orig = (cell.dataset.origValue || '').trim().toUpperCase()
    const hasChanged = !(value === orig || (value === '' && orig === '\u00A0'))
    if (!hasChanged) {
      if (cell.dataset.origBg) cell.style.background = cell.dataset.origBg
      cell.style.color = cell.dataset.origText || '#000'
      if (!orig) cell.innerHTML = '&nbsp;'
      delete cell.dataset.origValue
      delete cell.dataset.origBg
      delete cell.dataset.origText
      unmarkModified(cellKey(empId, dateStr))
      dirtyCellsRef.current.delete(cellKey(empId, dateStr))
      return
    }
    delete cell.dataset.origValue
    delete cell.dataset.origBg
    delete cell.dataset.origText
    if (hasChanged) scheduleAutoSave(empId, dateStr, cell)
  }

  const handleCellKeydown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cell = e.currentTarget
    const empId = Number(cell.dataset.empId)
    const dateStr = cell.dataset.date || ''
    const move = (dir: string) => {
      e.preventDefault()
      cell.blur()
      const cells = getEditableCells()
      const idx = cells.findIndex(c => c === cell)
      const days = daysInMonth
      let target = -1
      if (dir === 'left' && idx % days !== 0) target = idx - 1
      else if (dir === 'right' && (idx + 1) % days !== 0) target = idx + 1
      else if (dir === 'up' && idx - days >= 0) target = idx - days
      else if (dir === 'down' && idx + days < cells.length) target = idx + days
      if (target >= 0) setTimeout(() => focusDateCell(cells[target]), 0)
    }
    if (e.key === 'Enter') move('right')
    else if (e.key === 'ArrowRight') move('right')
    else if (e.key === 'ArrowLeft') move('left')
    else if (e.key === 'ArrowUp') move('up')
    else if (e.key === 'ArrowDown') move('down')
    else if (e.key === 'Escape') {
      e.preventDefault()
      const orig = cell.dataset.origValue
      if (orig !== undefined) {
        if (orig) cell.textContent = orig
        else cell.innerHTML = '&nbsp;'
        if (cell.dataset.origBg) cell.style.background = cell.dataset.origBg
        cell.style.color = cell.dataset.origText || '#000'
      }
      dirtyCellsRef.current.delete(cellKey(empId, dateStr))
      cell.blur()
    }
  }

  const getEditableCells = () => [...cellRefs.current.values()]

  const focusDateCell = (cell: HTMLDivElement) => {
    clearSelection()
    cell.focus()
  }

  const clearSelection = () => {
    selectedCells.forEach(k => {
      const c = cellRefs.current.get(k)
      if (c) c.classList.remove('selected')
    })
    setSelectedCells([])
  }

  const updateSelection = (startKey: string, endKey: string) => {
    const keys = [...cellRefs.current.keys()]
    const si = keys.indexOf(startKey)
    const ei = keys.indexOf(endKey)
    if (si === -1 || ei === -1) return
    const minI = Math.min(si, ei)
    const maxI = Math.max(si, ei)
    const days = daysInMonth
    const sr = Math.floor(si / days), sc = si % days
    const er = Math.floor(ei / days), ec = ei % days
    const minR = Math.min(sr, er), maxR = Math.max(sr, er)
    const minC = Math.min(sc, ec), maxC = Math.max(sc, ec)
    const chosen: string[] = []
    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        const idx = row * days + col
        if (idx < keys.length) {
          chosen.push(keys[idx])
          const c = cellRefs.current.get(keys[idx])
          if (c) c.classList.add('selected')
        }
      }
    }
    setSelectedCells(chosen)
  }

  const handleCellMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const cell = e.currentTarget
    const empId = Number(cell.dataset.empId)
    const dateStr = cell.dataset.date || ''
    // 编辑前记录原始值（headless 下 focus 事件可能不触发，这里兜底）
    if (cell.dataset.origValue === undefined) {
      const rec = findRec(empId, dateStr)
      const cd = getCellDisplay(rec)
      cell.dataset.origValue = (cell.textContent || '').trim()
      cell.dataset.origBg = cd.color !== 'transparent' ? cd.color : ''
      cell.dataset.origText = cd.textColor || '#000'
    }
    const key = cellKey(empId, dateStr)
    if (e.shiftKey) {
      e.preventDefault()
      isSelectingRef.current = true
      selectionStartRef.current = key
      clearSelection()
      cell.classList.add('selected')
      setSelectedCells([key])
    }
  }
  const handleCellMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSelectingRef.current && selectionStartRef.current) {
      const key = cellKey(Number(e.currentTarget.dataset.empId), e.currentTarget.dataset.date || '')
      updateSelection(selectionStartRef.current, key)
    }
  }
  const handleCellMouseUp = () => { isSelectingRef.current = false }

  const handleCellPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const pasteData = e.clipboardData.getData('text')
    if (!pasteData) return
    const rows = pasteData.split('\n').filter(r => r.trim() !== '').map(r => r.split('\t'))
    if (rows.length === 0) return
    const startKey = selectedCells.length > 0 ? selectedCells[0] : cellKey(Number(e.currentTarget.dataset.empId), e.currentTarget.dataset.date || '')
    const keys = [...cellRefs.current.keys()]
    const startIdx = keys.indexOf(startKey)
    if (startIdx === -1) return
    const days = daysInMonth
    let idx = startIdx
    for (let ri = 0; ri < rows.length; ri++) {
      for (let ci = 0; ci < rows[ri].length; ci++) {
        const targetIdx = idx + ci
        if (targetIdx >= keys.length) break
        const k = keys[targetIdx]
        const cell = cellRefs.current.get(k)
        if (!cell) continue
        const v = (rows[ri][ci] || '').trim().toUpperCase()
        const [empIdStr, dateStr] = k.split('|')
        cell.textContent = v || '\u00A0'
        const hasHolidayBg = !!(cell.dataset.origBg && cell.dataset.origBg !== 'transparent')
        applyCellStyle(cell, v, hasHolidayBg)
        if (v) {
          cell.classList.add('modified')
          markModified(Number(empIdStr), dateStr, v)
        }
      }
      idx += days
    }
    showMsg('已粘贴')
  }

  /** 复制选中单元格（制表符分隔，对齐线上） */
  const copyCellsToClipboard = async () => {
    if (selectedCells.length === 0) return
    const keys = [...cellRefs.current.keys()]
    const days = daysInMonth
    const indices = selectedCells.map(k => keys.indexOf(k))
    const rows = indices.map(i => Math.floor(i / days))
    const cols = indices.map(i => i % days)
    const minR = Math.min(...rows), maxR = Math.max(...rows)
    const minC = Math.min(...cols), maxC = Math.max(...cols)
    let copyText = ''
    for (let row = minR; row <= maxR; row++) {
      const rowData: string[] = []
      for (let col = minC; col <= maxC; col++) {
        const index = row * days + col
        if (index < keys.length) {
          const cell = cellRefs.current.get(keys[index])
          const value = cell ? (cell.textContent || '').trim() : ''
          rowData.push((value === '' || value === '\u00A0') ? '' : value)
        } else rowData.push('')
      }
      copyText += rowData.join('\t') + '\n'
    }
    try {
      await navigator.clipboard.writeText(copyText)
      showMsg('已复制 ' + selectedCells.length + ' 个单元格')
    } catch (e) { console.error('复制失败:', e) }
  }

  /** 批量输入：应用到所有选中单元格 */
  const applyBatchInput = () => {
    const value = batchValue.trim().toUpperCase()
    if (!value) { showMsg('请输入代码', 'error'); return }
    const isShift = shifts.find(s => s.shiftCode === value)
    const isLeave = leaveTypes.find(lt => lt.code === value && lt.type === 'leave')
    const isHoliday = leaveTypes.find(lt => lt.code === value && lt.type === 'holiday')
    if (!isShift && !isLeave && !isHoliday) {
      if (!window.confirm('代码 "' + value + '" 未识别，确定要继续吗？\n它将被当作班次代码处理。')) return
    }
    let count = 0
    selectedCells.forEach(k => {
      const cell = cellRefs.current.get(k)
      if (!cell) return
      const [empIdStr, dateStr] = k.split('|')
      const hasHolidayBg = !!(cell.dataset.origBg && cell.dataset.origBg !== 'transparent')
      cell.textContent = value
      applyCellStyle(cell, value, hasHolidayBg)
      cell.classList.add('modified')
      markModified(Number(empIdStr), dateStr, value)
      count++
    })
    setBatchModal(false)
    setBatchValue('')
    showMsg('已应用到 ' + count + ' 个单元格')
  }

  /** 全局键盘：Ctrl+C 复制 / Delete 清除 / Enter 批量输入 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCells.length > 0) {
        e.preventDefault()
        copyCellsToClipboard()
      }
      if (e.key === 'Delete' && selectedCells.length > 0) {
        e.preventDefault()
        selectedCells.forEach(k => {
          const cell = cellRefs.current.get(k)
          if (!cell) return
          const [empIdStr, dateStr] = k.split('|')
          cell.innerHTML = '&nbsp;'
          cell.style.background = ''
          cell.style.color = '#000'
          cell.classList.add('modified')
          markModified(Number(empIdStr), dateStr, '')
          scheduleAutoSave(Number(empIdStr), dateStr, cell)
        })
        showMsg('已清除 ' + selectedCells.length + ' 个单元格')
      }
      if (e.key === 'Enter' && selectedCells.length > 1) {
        e.preventDefault()
        setBatchModal(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedCells])

  // 编辑模式提示（对齐线上 editModeInfoShown）
  useEffect(() => {
    if (employees.length > 0 && !editModeHint) {
      showMsg('已进入编辑模式：内容自动保存，可用 Shift 拖动多选，Enter 批量输入，Delete 清除。', 'info')
      setEditModeHint(true)
    }
  }, [employees.length])

  // 全局 mouseup 结束选择
  useEffect(() => {
    const up = () => { isSelectingRef.current = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])


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

  // ---------- 班次管理 ----------
  const saveShiftItem = async () => {
    if (saving) return
    if (!shiftCode.trim() || !shiftStart || !shiftEnd) { showMsg('请填写班次代码和时间', 'error'); return }
    setSaving(true)
    try {
      await saveShift({ id: shiftId || undefined, shiftCode: shiftCode.trim().toUpperCase(), restaurant, startTime: shiftStart + ':00', endTime: shiftEnd + ':00' })
      setShiftModal(false)
      showMsg('班次已保存')
      const ss = await getShifts()
      setShifts(ss.filter(s => !s.restaurant || s.restaurant === restaurant))
    } catch { showMsg('保存失败', 'error') }
    finally { setSaving(false) }
  }
  const deleteShiftItem = async (id: number) => {
    if (!window.confirm('确定删除该班次吗？')) return
    try {
      await deleteShift(id)
      showMsg('班次已删除')
      const ss = await getShifts()
      setShifts(ss.filter(s => !s.restaurant || s.restaurant === restaurant))
    } catch { showMsg('删除失败', 'error') }
  }

// ---------- 下载 PDF ----------
  // 恢复版本：html2canvas 直接截图页面真实元素（1:1，不 clone 不改样式）——排班表 + 图例
  const downloadPDF = async () => {
    if (employees.length === 0) { showMsg('没有数据可下载', 'error'); return }
    try {
      const w = window as any
      if (!w.html2canvas || !w.jspdf) { showMsg('PDF 库未加载', 'error'); return }
      const { jsPDF } = w.jspdf
      showMsg('正在生成 PDF...', 'info')

      const tableEl = document.querySelector('#scheduleContainer') as HTMLElement | null
      const legendEl = document.querySelector('.sch-root .print-legend') as HTMLElement | null
      if (!tableEl) return
      const prevDisplay = legendEl ? legendEl.style.display : ''
      if (legendEl) legendEl.style.display = 'block' // 临时显示图例（页面原样）
      const canvas1 = await w.html2canvas(tableEl, { useCORS: true, backgroundColor: '#ffffff', scale: 2, logging: false, windowWidth: tableEl.scrollWidth })
      let canvas2: HTMLCanvasElement | null = null
      if (legendEl) {
        try { canvas2 = await w.html2canvas(legendEl, { useCORS: true, backgroundColor: '#ffffff', scale: 2, logging: false }) } catch (e) { canvas2 = null }
      }
      if (legendEl) legendEl.style.display = prevDisplay
      const img1 = canvas1.toDataURL('image/jpeg', 0.78)
      const img2 = canvas2 ? canvas2.toDataURL('image/jpeg', 0.78) : null

      // A4 landscape 一页：表格在上、图例在下（等比缩放，不再分页）
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const contentW = pw - 12
      let tW = contentW
      let tH = canvas1.height * tW / canvas1.width
      let lW = 0, lH = 0
      if (img2 && canvas2) { lW = contentW; lH = canvas2.height * lW / canvas2.width }
      const totalH = tH + (lH ? lH + 8 : 0)
      if (totalH > ph - 8) {
        const s = (ph - 8) / totalH
        tW *= s; tH *= s
        if (img2) { lW *= s; lH *= s }
      }
      pdf.addImage(img1, 'JPEG', (pw - tW) / 2, 4, tW, tH)
      if (img2) pdf.addImage(img2, 'JPEG', (pw - lW) / 2, 4 + tH + 8, lW, lH)
      pdf.save('schedule_' + restaurant + '_' + year + '_' + String(month).padStart(2, '0') + '.pdf')
      showMsg('PDF 已下载')
    } catch (e) { console.error(e); showMsg('PDF 生成失败', 'error') }
  }


  // ---------- 渲染 ----------
  const renderDatePickerOptions = () => {
    if (!datePickerOpen || !dateType) return null
    if (dateType === 'year') {
      const years: number[] = []
      const cur = new Date().getFullYear()
      for (let y = cur - 5; y <= cur + 2; y++) years.push(y)
      return (
        <div className="year-grid" style={{ padding: 8 }}>
          {years.map(y => (
            <div key={y} className="date-option" style={{ padding: '6px 0', cursor: 'pointer', borderRadius: 4, background: y === year ? '#ff5c00' : 'transparent', color: y === year ? '#fff' : '#374151', fontWeight: 600, textAlign: 'center' }}
              onClick={() => { setYear(y); setDatePickerOpen(false) }}>
              {y}
            </div>
          ))}
        </div>
      )
    }
    const months = Array.from({ length: 12 }, (_, i) => i + 1)
    return (
      <div className="month-grid" style={{ padding: 8 }}>
        {months.map(m => (
          <div key={m} className="date-option" style={{ padding: '6px 0', cursor: 'pointer', borderRadius: 4, background: m === month ? '#ff5c00' : 'transparent', color: m === month ? '#fff' : '#374151', fontWeight: 600, textAlign: 'center' }}
            onClick={() => { setMonth(m); setDatePickerOpen(false) }}>
            {String(m).padStart(2, '0')}
          </div>
        ))}
      </div>
    )
  }

  const renderGrid = () => {
    if (employees.length === 0) {
      return <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}><div className="alert alert-error">没有找到员工数据，请先添加员工</div></div>
    }
    const gridCols = '50px 150px 120px 150px repeat(' + daysInMonth + ', 50px)'
    return (
      <div className="schedule-grid" style={{ gridTemplateColumns: gridCols }}>
        <div className="grid-cell grid-header sticky-col sticky-col-1">No.</div>
        <div className="grid-cell grid-header sticky-col sticky-col-2">名字</div>
        <div className="grid-cell grid-header">手机号码</div>
        <div className="grid-cell grid-header">职位</div>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const date = new Date(year, month - 1, day)
          const dow = date.getDay()
          const isWeekend = dow === 0 || dow === 6
          const dateStr = monthStr + '-' + String(day).padStart(2, '0')
          return (
            <div key={day} className={'grid-cell grid-header date-header ' + (isWeekend ? 'weekend' : '')} data-date={dateStr} data-day={day}
              onClick={() => setColHoliday({ dateStr, day })} title="点击设置整列公共假期">
              {weekdayNames[dow]}<br />{month}/{day}
            </div>
          )
        })}
        {departments.map(dept => {
          const deptEmps = employees.filter(e => e.workArea === dept.key).sort((a, b) => {
            const ra = positionHierarchy[dept.key]?.indexOf(a.position || '') ?? 999
            const rb = positionHierarchy[dept.key]?.indexOf(b.position || '') ?? 999
            return ra - rb
          })
          return (
            <div key={dept.key} style={{ display: 'contents' }}>
              <div className="grid-cell grid-department">{dept.name}</div>
              {deptEmps.map((emp, idx) => {
                return (
                  <div key={emp.id} style={{ display: 'contents' }}>
                    <div className="grid-cell grid-no sticky-col sticky-col-1">{idx + 1}</div>
                    <div className="grid-cell grid-employee-info grid-employee-name sticky-col sticky-col-2"><strong>{emp.name.toUpperCase()}</strong></div>
                    <div className="grid-cell grid-employee-info">{emp.phone}</div>
                    <div className="grid-cell grid-employee-info">{emp.position}</div>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                      const date = new Date(year, month - 1, day)
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6
                      const dateStr = monthStr + '-' + String(day).padStart(2, '0')
                      const rec = findRec(emp.id, dateStr)
                      const cd = getCellDisplay(rec)
                      const modKey = emp.id + '|' + dateStr
                      const isMod = modified.has(modKey)
                      let cls = 'grid-cell grid-date'
                      if (isWeekend) cls += ' weekend'
                      if (rec) cls += ' has-value'
                      if (isMod) cls += ' modified'
                      const style: any = {}
                      if (rec && cd.color !== 'transparent') { style.background = cd.color; style.color = cd.textColor }
                      else style.color = cd.textColor
                      const key = cellKey(emp.id, dateStr)
                      const content = cd.shiftCode ? cd.shiftCode : (cd.showText && cd.code ? cd.code : '\u00A0')
                      // 脏单元格：保持 React 上次写入的 html，避免重渲染覆盖用户正在编辑的内容
                      const dirtyHtml = dirtyCellsRef.current.get(key)
                      return (
                        <div key={day} className={cls} style={style}
                          contentEditable suppressContentEditableWarning
                          data-emp-id={emp.id} data-date={dateStr}
                          ref={(el) => { if (el) cellRefs.current.set(key, el) }}
                          onFocus={handleCellFocus}
                          onInput={handleCellInput}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeydown}
                          onMouseDown={handleCellMouseDown}
                          onMouseEnter={handleCellMouseEnter}
                          onMouseUp={handleCellMouseUp}
                          onPaste={handleCellPaste}
                          dangerouslySetInnerHTML={{ __html: dirtyHtml !== undefined ? dirtyHtml : content }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }


  return (
    <div className="sch-root">
      <div className="container">
        <div className="header">
          <h1 id="page-title">员工排班管理系统 - {restaurant}</h1>
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
                    选择年份和月份
                  </label>
                  <div className="enhanced-date-picker" id="schedule-date-picker">
                    <div className={'date-part' + (datePickerOpen && dateType === 'year' ? ' active' : '')} data-type="year"
                      onClick={() => { setDatePickerOpen(true); setDateType('year') }}>
                      <span id="schedule-year-display">{year}</span>
                    </div>
                    <span className="date-separator">年</span>
                    <div className={'date-part' + (datePickerOpen && dateType === 'month' ? ' active' : '')} data-type="month"
                      onClick={() => { setDatePickerOpen(true); setDateType('month') }}>
                      <span id="schedule-month-display">{String(month).padStart(2, '0')}</span>
                    </div>
                    <span className="date-separator">月</span>
                    <div className={'date-dropdown' + (datePickerOpen ? ' show' : '')} id="schedule-dropdown">
                      {renderDatePickerOptions()}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ margin: 0, visibility: 'hidden' }}>占位</label>
                  <button className="btn-control btn-copy" onClick={copyToNextMonth} title="将当前月的排班复制到下一个月">
                    <i className="fas fa-copy"></i> 复制到下月
                  </button>
                </div>
              </div>
              <div className="controls-right">
                <button id="saveAllBtn" className="btn-control" onClick={saveAllChanges} disabled={saving} style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}>
                  <i className="fas fa-save"></i> 保存所有更改
                </button>
                <button className="btn-generate" onClick={() => setPanel('shifts')}>
                  <i className="fas fa-clock"></i> 班次管理
                </button>
                <button className="btn-generate" onClick={() => setPanel('employees')}>
                  <i className="fas fa-users"></i> 员工管理
                </button>
                <button className="btn-generate" onClick={() => setPanel('legend')}>
                  <i className="fas fa-info-circle"></i> 图例说明
                </button>
                <button className="btn-control" onClick={downloadPDF}>
                  <i className="fas fa-file-pdf"></i> 下载PDF
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-wrapper">
            <div id="scheduleContainer" className="edit-mode-active">{renderGrid()}</div>
          </div>
        </div>

        <div className="print-legend">
          {/* 8/24 优化：图例外框/色块完全对齐旧版（白底黑框圆角、大色块），但改为底部横向排列节省宽度 */}
          <div style={{ background: 'white', padding: 10, border: '2px solid #000', borderRadius: 8, maxWidth: 1100, margin: '0 auto' }}>
            <h3 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 14, fontWeight: 'bold', color: '#000' }}>班次与假期图例</h3>
            <div style={{ display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'nowrap', minWidth: 'max-content' }}>
              {/* 班次 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 'bold', margin: '0 0 10px', color: '#333', borderBottom: '2px solid #ddd', paddingBottom: 5 }}>班次 (Shifts)</h4>
                {shifts.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ width: 40, height: 26, background: 'white', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 16, marginRight: 12, flexShrink: 0 }}>{s.shiftCode}</div>
                    <div style={{ fontSize: 14, color: '#333', fontWeight: 500, whiteSpace: 'nowrap' }}>{formatTime(s.startTime)} - {formatTime(s.endTime)}</div>
                  </div>
                ))}
              </div>
              {/* 请假 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 'bold', margin: '0 0 10px', color: '#333', borderBottom: '2px solid #ddd', paddingBottom: 5 }}>请假 (Leave)</h4>
                {leaveTypes.filter(l => l.type === 'leave').map(l => (
                  <div key={l.code} style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ width: 46, height: 26, background: l.color || '#fff', color: getContrastColor(l.color), border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 13, marginRight: 12, flexShrink: 0 }}>{l.code}</div>
                    <div style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{l.name}</div>
                  </div>
                ))}
              </div>
              {/* 假期 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 'bold', margin: '0 0 10px', color: '#333', borderBottom: '2px solid #ddd', paddingBottom: 5 }}>假期 (Holiday)</h4>
                {leaveTypes.filter(l => l.type === 'holiday').map(l => (
                  <div key={l.code} style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ width: 52, height: 26, background: l.color || '#fff', color: getContrastColor(l.color), border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 12, marginRight: 12, flexShrink: 0 }}>{l.code}</div>
                    <div style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{l.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* 排班模态框 */}
      {cellSel && (
        <div className="modal" style={{ display: 'block', zIndex: 10001 }}>
          <div className="modal-content">
            <div className="modal-header">
              <ModalClose onClick={() => setCellSel(null)} />
              <h3 style={{ marginTop: 8 }}>设置排班</h3>
              <p id="modalEmployeeInfo" style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{empNameOf(cellSel.employeeId).toUpperCase()} - {cellSel.dateStr}</p>
            </div>
            <div className="form-group">
              <label>选择类型:</label>
              <select id="scheduleType" value={schType} onChange={(e) => { setSchType(e.target.value); setSchValue('') }}>
                <option value="">-- 选择 --</option>
                <option value="shift">班次</option>
                <option value="leave">请假</option>
                <option value="holiday">公共假期</option>
              </select>
            </div>
            <div className="form-group">
              <label>选择值:</label>
              <div id="scheduleOptions" style={{ minHeight: 100 }}>
                {schType === '' && <div style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>请先选择类型</div>}
                {schType === 'shift' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {shifts.map(s => (
                      <label key={s.id} style={{ display: 'block', padding: '12px 8px', background: schValue === s.shiftCode ? '#ff5c00' : 'white', color: schValue === s.shiftCode ? '#fff' : '#000', borderRadius: 6, cursor: 'pointer', textAlign: 'center', fontWeight: 600, border: '2px solid ' + (schValue === s.shiftCode ? '#ff5c00' : '#ddd'), transition: 'all 0.2s' }}>
                        <input type="radio" name="scheduleValue" value={s.shiftCode} style={{ marginRight: 6, display: 'none' }} checked={schValue === s.shiftCode} onChange={() => setSchValue(s.shiftCode)} />
                        {s.shiftCode}
                        <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7 }}>{formatTime(s.startTime)}-{formatTime(s.endTime)}</div>
                      </label>
                    ))}
                  </div>
                )}
                {schType === 'leave' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {leaveTypes.filter(l => l.type === 'leave').map(l => (
                      <label key={l.code} style={{ display: 'block', padding: '12px 8px', background: l.color || 'white', color: getLeaveTextColor(l.code), borderRadius: 6, cursor: 'pointer', textAlign: 'center', fontWeight: 600, border: '3px solid ' + (schValue === l.code ? '#000' : 'transparent'), transition: 'all 0.2s' }}>
                        <input type="radio" name="scheduleValue" value={l.code} style={{ marginRight: 6, display: 'none' }} checked={schValue === l.code} onChange={() => setSchValue(l.code)} />
                        {l.code}
                        <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7 }}>{l.name}</div>
                      </label>
                    ))}
                  </div>
                )}
                {schType === 'holiday' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {leaveTypes.filter(l => l.type === 'holiday').map(l => (
                      <label key={l.code} style={{ display: 'block', padding: '12px 8px', background: l.color || 'white', color: getContrastColor(l.color), borderRadius: 6, cursor: 'pointer', textAlign: 'center', fontWeight: 600, border: '3px solid ' + (schValue === l.code ? '#000' : 'transparent'), transition: 'all 0.2s' }}>
                        <input type="radio" name="scheduleValue" value={l.code} style={{ marginRight: 6, display: 'none' }} checked={schValue === l.code} onChange={() => setSchValue(l.code)} />
                        {l.code}
                        <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7 }}>{l.name}</div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>备注:</label>
              <textarea id="scheduleNotes" rows={3} placeholder="可选的备注信息" value={schNotes} onChange={(e) => setSchNotes(e.target.value)}></textarea>
            </div>
            <div className="form-actions">
              <button className="btn-action btn-delete" onClick={deleteSchedule}><i className="fas fa-trash"></i> 删除</button>
              <button className="btn-action btn-cancel" onClick={() => setCellSel(null)}><i className="fas fa-times"></i> 取消</button>
              <button className="btn-action btn-save" onClick={saveSchedule} disabled={saving}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-check')}></i> 保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 整列公共假期模态框 */}
      {colHoliday && (
        <div className="modal" style={{ display: 'block', zIndex: 10001 }}>
          <div className="modal-content">
            <div className="modal-header">
              <ModalClose onClick={() => setColHoliday(null)} />
              <h3 style={{ marginTop: 8 }}><i className="fas fa-calendar-day"></i> 设置公共假期</h3>
              <p id="columnDateInfo" style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{colHoliday.dateStr}</p>
            </div>
            <div className="form-group">
              <label>选择公共假期类型（将应用到所有员工）:</label>
              <div id="columnHolidayOptions" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {leaveTypes.filter(l => l.type === 'holiday').map(l => (
                  <div key={l.code} onClick={() => applyColumnHoliday(l.code, l.type || '')}
                    style={{ padding: 16, background: l.color || '#fff', color: getContrastColor(l.color), borderRadius: 8, cursor: 'pointer', textAlign: 'center', fontWeight: 600, transition: 'all 0.2s', border: '3px solid transparent' }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{l.code}</div>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>{l.name}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-action btn-delete" onClick={clearColumnSchedule}><i className="fas fa-eraser"></i> 清除整列</button>
              <button className="btn-action btn-cancel" onClick={() => setColHoliday(null)}><i className="fas fa-times"></i> 取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 管理面板 */}
      {panel && (
        <div className="modal" style={{ display: 'block', zIndex: 10000 }} onClick={(e) => { if (e.target === e.currentTarget && panel !== 'employees') setPanel(null) }}>
          <div className="modal-content" style={{ maxWidth: 900, maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <ModalClose onClick={() => setPanel(null)} />
              <h3 style={{ marginTop: 8 }}>
                {panel === 'shifts' && <><i className="fas fa-clock"></i> 班次管理</>}
                {panel === 'employees' && <><i className="fas fa-users"></i> 员工管理</>}
                {panel === 'legend' && <><i className="fas fa-info-circle"></i> 图例说明</>}
              </h3>
            </div>
            <div style={{ marginTop: 20 }}>
              {panel === 'shifts' && (
                <div id="shiftListModal" className="shift-list">
                  <div style={{ marginBottom: 12 }}>
                    <button className="btn-generate" onClick={() => { setShiftId(null); setShiftCode(''); setShiftStart(''); setShiftEnd(''); setShiftModal(true) }}>
                      <i className="fas fa-plus"></i> 添加班次
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>序号</th>
                          <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>班次代码</th>
                          <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>开始时间</th>
                          <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>结束时间</th>
                          <th style={{ background: '#636363', color: 'white', padding: '12px 8px', border: '1px solid #d1d5db', fontSize: 12 }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shifts.map((s, i) => (
                          <tr key={s.id}>
                            <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center', fontWeight: 700, fontSize: 18 }}>{s.shiftCode}</td>
                            <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center' }}>{formatTime(s.startTime)}</td>
                            <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center' }}>{formatTime(s.endTime)}</td>
                            <td style={{ padding: '10px 8px', border: '1px solid #d1d5db', textAlign: 'center' }}>
                              <button className="btn-action btn-delete" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => deleteShiftItem(s.id)}>删除</button>
                            </td>
                          </tr>
                        ))}
                        {shifts.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>暂无班次</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {panel === 'employees' && (
                <div id="employeeListModal" className="employee-list">
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
              )}
              {panel === 'legend' && (
                <div className="legend">
                  <div className="legend-section">
                    <h4>📋 请假类型 (Leave Types)</h4>
                    <div className="leave-list">
                      {leaveTypes.filter(l => l.type === 'leave').map(l => (
                        <div key={l.code} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ width: 40, height: 28, background: l.color || '#fff', color: getLeaveTextColor(l.code), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 12, marginRight: 12, borderRadius: 4, border: '1px solid #e5e7eb' }}>{l.code}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{l.description || ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="legend-section">
                    <h4>🎉 公共假期 (Public Holidays)</h4>
                    <div className="leave-list">
                      {leaveTypes.filter(l => l.type === 'holiday').map(l => (
                        <div key={l.code} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ width: 40, height: 28, background: l.color || '#fff', color: getContrastColor(l.color), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 12, marginRight: 12, borderRadius: 4, border: '1px solid #e5e7eb' }}>{l.code}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{l.description || ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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

      {/* 班次模态框 */}
      {shiftModal && (
        <div className="modal" style={{ display: 'block', zIndex: 10001 }}>
          <div className="modal-content">
            <div className="modal-header">
              <ModalClose onClick={() => setShiftModal(false)} />
              <h3 style={{ marginTop: 8 }}><i className="fas fa-clock"></i> {shiftId ? '编辑班次' : '添加班次'}</h3>
            </div>
            <div className="form-group">
              <label>班次代码 (如 A, B, C):</label>
              <input type="text" id="shiftCode" maxLength={10} value={shiftCode} onChange={(e) => setShiftCode(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="form-group">
              <label>开始时间:</label>
              <input type="time" id="shiftStartTime" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
            </div>
            <div className="form-group">
              <label>结束时间:</label>
              <input type="time" id="shiftEndTime" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
            </div>
            <div className="form-actions">
              <button className="btn-action btn-cancel" onClick={() => setShiftModal(false)}><i className="fas fa-times"></i> 取消</button>
              <button className="btn-action btn-save" onClick={saveShiftItem} disabled={saving}><i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-check')}></i> 保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 批量输入模态框 */}
      {batchModal && (
        <div className="modal" style={{ display: 'block', zIndex: 10002 }}>
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <ModalClose onClick={() => setBatchModal(false)} />
              <h3 style={{ marginTop: 8 }}><i className="fas fa-edit"></i> 批量输入</h3>
              <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>已选择 {selectedCells.length} 个单元格</p>
            </div>
            <div className="form-group">
              <label>输入班次/请假/假期代码：</label>
              <input type="text" id="batchInputValue" placeholder="如: A, AL, PH 等"
                style={{ width: '100%', padding: 12, border: '2px solid #d1d5db', borderRadius: 6, fontSize: 16, fontWeight: 600, textTransform: 'uppercase', textAlign: 'center' }}
                value={batchValue} onChange={(e) => setBatchValue(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') applyBatchInput() }} />
              <div style={{ marginTop: 12, padding: 12, background: '#f3f4f6', borderRadius: 6, fontSize: 12, color: '#6b7280' }}>
                <strong>提示：</strong>
                <ul style={{ margin: '8px 0 0 20px', lineHeight: 1.8 }}>
                  <li>输入班次代码（如 A、B、C）</li>
                  <li>输入请假代码（如 AL、MC）</li>
                  <li>输入假期代码（如 PH、IPH）</li>
                </ul>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-action btn-cancel" onClick={() => setBatchModal(false)}><i className="fas fa-times"></i> 取消</button>
              <button className="btn-action btn-save" onClick={applyBatchInput}><i className="fas fa-check"></i> 应用</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
