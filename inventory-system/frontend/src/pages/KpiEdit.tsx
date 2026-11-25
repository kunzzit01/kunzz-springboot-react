import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getKpiReport, saveKpiDaily, deleteKpiDaily } from '../api'
import '../styles/kpiedit.css'
import { showToast } from '../utils/toast'

interface DayRow {
  [field: string]: string | undefined
}

const CURRENCY_FIELDS = ['grossSales', 'discounts', 'tax', 'serviceFee', 'adjAmount']
const INT_FIELDS = ['tablesUsed', 'diners', 'newCustomers', 'returningCustomers']

// 有值判定（与线上 updateInputColors 一致：'' / '0' / '0.00' 都算无数据）
const hasVal = (v?: string) => v !== undefined && v !== '' && v !== '0' && v !== '0.00'

// 货币显示：有值才显示两位小数
const fmtCur = (v?: string) => {
  if (!hasVal(v)) return ''
  const n = parseFloat(v!)
  return isNaN(n) ? '' : n.toFixed(2)
}

// 整数显示：0 显示为空
const fmtInt = (v?: string) => {
  if (v === undefined || v === null || v === '') return ''
  const n = parseInt(v, 10)
  return isNaN(n) ? '' : String(n)
}

export default function KpiEdit() {
  const [restaurant, setRestaurant] = useState('j1')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<Record<number, DayRow>>({})
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [numOpen, setNumOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // 正在保存的那一天：只给它那一行的按钮转圈，不要整列一起转
  const [savingDay, setSavingDay] = useState<number | null>(null)
  const preservedRef = useRef<Record<number, DayRow>>({})
  // 脏行：只保存用户真正改过的天，避免「保存本月数据」用内存快照整月重写
  const dirtyRef = useRef<Set<number>>(new Set())
  // 保存锁用 ref：state 是异步的，双击 / Ctrl+S 连按能穿过 state 判空
  const savingRef = useRef(false)
  // 请求序号：快速换店/换月时丢弃过期响应，避免旧数据覆盖新数据
  const loadSeq = useRef(0)
  // 切换店/月时如果还有未保存的数据 → 弹窗选「保存并切换」或「继续编辑」
  const pendingSwitchRef = useRef<(() => void) | null>(null)
  const [askDays, setAskDays] = useState(0)

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  const daysInMonth = new Date(year, month, 0).getDate()

  // 加载某月数据（线上 loadMonthData）
  const load = async () => {
    const my = ++loadSeq.current
    setLoading(true)
    try {
      const res = await getKpiReport(restaurant, year + '-' + String(month).padStart(2, '0'))
      const byDay: Record<number, DayRow> = {}
      ;(res.rows || []).forEach((r: any) => {
        if (r._type === 'daily' && r.date) {
          const day = parseInt(String(r.date).split('-')[2], 10)
          byDay[day] = {
            grossSales: fmtCur(String(r.grossSales ?? '')),
            discounts: fmtCur(String(r.discounts ?? '')),
            tax: fmtCur(String(r.tax ?? '')),
            serviceFee: fmtCur(String(r.serviceFee ?? '')),
            adjAmount: fmtCur(String(r.adjAmount ?? '')),
            tenderAmount: fmtCur(String(r.tenderAmount ?? '')),
            tablesUsed: fmtInt(String(r.tablesUsed ?? '')),
            diners: fmtInt(String(r.diners ?? '')),
            newCustomers: fmtInt(String(r.newCustomers ?? '')),
            returningCustomers: fmtInt(String(r.returningCustomers ?? ''))
          }
        }
      })
      if (my !== loadSeq.current) return // 过期响应（已换店/换月）直接丢弃
      setRows(byDay)
      dirtyRef.current.clear() // 新快照 = 干净
    } catch { /* ignore */ }
    if (my === loadSeq.current) setLoading(false)
  }
  useEffect(() => {
    setEditingDay(null)
    load()
  }, [restaurant, year, month])

  // ---- 计算列（与线上 updateCalculations 完全一致） ----
  const calc = (day: number) => {
    const r = rows[day] || {}
    const gross = parseFloat(r.grossSales || '') || 0
    const discounts = parseFloat(r.discounts || '') || 0
    const tax = parseFloat(r.tax || '') || 0
    const serviceFee = parseFloat(r.serviceFee || '') || 0
    const adj = parseFloat(r.adjAmount || '') || 0
    const diners = parseInt(r.diners || '', 10) || 0
    const ret = parseInt(r.returningCustomers || '', 10) || 0
    const nw = parseInt(r.newCustomers || '', 10) || 0
    const net = gross - discounts
    const tender = net + tax + serviceFee + adj
    const avg = diners > 0 ? (net + adj) / diners : 0
    const total = ret + nw
    const rate = total > 0 ? (ret / total) * 100 : 0
    return { net, tender, avg, rate, gross, diners }
  }

  // ---- 月度统计（与线上 updateMonthStats 一致） ----
  const stats = useMemo(() => {
    let filled = 0, netTotal = 0, tenderTotal = 0, dinersTotal = 0, tablesTotal = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const c = calc(d)
      const r = rows[d]
      const gross = parseFloat(r?.grossSales || '') || 0
      const discounts = parseFloat(r?.discounts || '') || 0
      const tax = parseFloat(r?.tax || '') || 0
      const serviceFee = parseFloat(r?.serviceFee || '') || 0
      const adj = parseFloat(r?.adjAmount || '') || 0
      const tables = parseInt(r?.tablesUsed || '', 10) || 0
      if (gross > 0 || c.diners > 0) filled++
      netTotal += gross - discounts
      tenderTotal += (gross - discounts) + tax + serviceFee + adj
      dinersTotal += c.diners
      tablesTotal += tables
    }
    return { filled, netTotal, tenderTotal, dinersTotal, tablesTotal, avg: dinersTotal > 0 ? netTotal / dinersTotal : 0 }
  }, [rows, daysInMonth])

  // ---- 更新字段（编辑模式下） ----
  const update = (day: number, field: string, value: string) => {
    // 金额字段限制 2 位小数，整数字段去掉小数点（与线上 input 事件一致）
    let v = value
    if (CURRENCY_FIELDS.includes(field)) {
      if (v.includes('.')) {
        const parts = v.split('.')
        if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].substring(0, 2)
      }
    } else if (INT_FIELDS.includes(field)) {
      if (v.includes('.')) v = v.split('.')[0]
    }
    dirtyRef.current.add(day)
    setRows(prev => {
      const cur = { ...(prev[day] || {}) }
      cur[field] = v
      return { ...prev, [day]: cur }
    })
  }

  // blur 时货币格式化为两位小数
  const onBlur = (day: number, field: string) => {
    if (!CURRENCY_FIELDS.includes(field)) return
    setRows(prev => {
      const cur = { ...(prev[day] || {}) }
      const v = cur[field]
      if (v && !isNaN(parseFloat(v))) cur[field] = parseFloat(v).toFixed(2)
      return { ...prev, [day]: cur }
    })
  }

  // ---- 行编辑模式 ----
  const toggleEdit = (day: number) => {
    if (editingDay === day) {
      saveRow(day)
    } else {
      // 进入编辑前备份当前值（用于取消恢复）
      preservedRef.current[day] = { ...(rows[day] || {}) }
      setEditingDay(day)
    }
  }

  const cancelEdit = (day: number) => {
    const backup = preservedRef.current[day]
    if (backup) {
      setRows(prev => ({ ...prev, [day]: { ...backup } }))
      delete preservedRef.current[day]
    }
    setEditingDay(null)
  }

  const buildPayload = (day: number) => {
    const r = rows[day] || {}
    const gross = parseFloat(r.grossSales || '') || 0
    const discounts = parseFloat(r.discounts || '') || 0
    const tax = parseFloat(r.tax || '') || 0
    const serviceFee = parseFloat(r.serviceFee || '') || 0
    const adj = parseFloat(r.adjAmount || '') || 0
    return {
      date: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
      grossSales: gross,
      discounts,
      serviceFee,
      tax,
      adjAmount: adj,
      tenderAmount: (gross - discounts) + tax + serviceFee + adj,
      tablesUsed: parseInt(r.tablesUsed || '', 10) || 0,
      diners: parseInt(r.diners || '', 10) || 0,
      returningCustomers: parseInt(r.returningCustomers || '', 10) || 0,
      newCustomers: parseInt(r.newCustomers || '', 10) || 0
    }
  }

  const hasData = (day: number) => {
    const r = rows[day] || {}
    const gross = parseFloat(r.grossSales || '') || 0
    const diners = parseInt(r.diners || '', 10) || 0
    return gross > 0 || diners > 0 ||
      (parseFloat(r.discounts || '') || 0) > 0 ||
      (parseFloat(r.tax || '') || 0) > 0 ||
      (parseFloat(r.serviceFee || '') || 0) > 0 ||
      (parseFloat(r.adjAmount || '') || 0) !== 0 ||
      (parseInt(r.tablesUsed || '', 10) || 0) > 0 ||
      (parseInt(r.returningCustomers || '', 10) || 0) > 0 ||
      (parseInt(r.newCustomers || '', 10) || 0) > 0
  }

  // 有未保存改动时先弹选择框（保存并切换 / 继续编辑）；返回 true 表示已直接切换
  const guardSwitch = (action: () => void): boolean => {
    const dirty = new Set(dirtyRef.current)
    if (editingDay !== null && hasData(editingDay)) dirty.add(editingDay)
    if (dirty.size === 0) { action(); return true }
    pendingSwitchRef.current = action
    setAskDays(dirty.size)
    return false
  }

  const askSaveThenSwitch = async () => {
    const action = pendingSwitchRef.current
    setAskDays(0)
    pendingSwitchRef.current = null
    await saveAll()
    // 全部存成功才切换；有失败的天就留在当前店/月方便重试
    if (dirtyRef.current.size === 0) action?.()
  }

  const askKeepEditing = () => { setAskDays(0); pendingSwitchRef.current = null }

  // 保存单行（编辑按钮保存模式）
  const saveRow = async (day: number) => {
    if (savingRef.current) return
    if (hasData(day)) {
      savingRef.current = true
      setSaving(true)
      setSavingDay(day)
      try {
        await saveKpiDaily(restaurant, buildPayload(day))
        dirtyRef.current.delete(day)
        showMsg(day + '日数据保存成功', 'success')
      } catch { showMsg('保存' + day + '日数据失败', 'error') }
      savingRef.current = false
      setSaving(false)
      setSavingDay(null)
    }
    setEditingDay(null)
  }

  // 保存全部：只提交改过的天（dirtyRef）；正在编辑的那天也算（对齐进出货 Ctrl+S）
  const saveAll = async () => {
    if (savingRef.current || loading) return
    const dirty = new Set(dirtyRef.current)
    if (editingDay !== null && hasData(editingDay)) dirty.add(editingDay)
    const days = [...dirty].sort((a, b) => a - b)
    if (days.length === 0) { setEditingDay(null); showMsg('没有需要保存的数据', 'info'); return }
    savingRef.current = true
    setSaving(true)
    const failed: number[] = []
    try {
      for (const d of days) {
        setSavingDay(d)
        try {
          await saveKpiDaily(restaurant, buildPayload(d))
          dirtyRef.current.delete(d)
        } catch { failed.push(d) } // 单天失败不中断整批
      }
    } finally {
      savingRef.current = false
      setSaving(false)
      setSavingDay(null)
    }
    if (failed.length === 0) {
      setEditingDay(null) // 全部成功 → 退出编辑态（与进出货一致）
      showMsg('数据保存成功！共保存 ' + days.length + ' 条记录', 'success')
      await load()
    } else {
      // 有失败的天：保留编辑态，方便直接重试
      showMsg('已保存 ' + (days.length - failed.length) + ' 天，' + failed.length + ' 天失败（' + failed.join('、') + '日），请再点一次保存', 'error')
    }
  }

  // 清空单日（线上 clearDayData：confirm + 删除 DB 记录）
  const clearDay = (day: number) => {
    if (!window.confirm('确定要清空' + day + '日的所有数据吗？此操作不可恢复！')) return
    const date = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
    ;(async () => {
      try {
        await deleteKpiDaily(restaurant, date)
        setRows(prev => {
          const n = { ...prev }
          delete n[day]
          return n
        })
        showMsg(day + '日数据已从数据库删除', 'success')
      } catch {
        showMsg('删除' + day + '日数据失败', 'error')
      }
    })()
  }

  // ---- 快捷键：Ctrl+S 保存、Enter 下移、Ctrl+V 粘贴 ----
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, day: number, field: string) => {
    // Enter 移到下一行同一列
    if (e.key === 'Enter') {
      e.preventDefault()
      const next = inputRefs.current[field + '-' + (day + 1)]
      if (next) next.focus()
    }
  }

  const parsePasteLine = (line: string): string[] => {
    const t = line.trim()
    if (t.includes('\t')) return t.split('\t').map(s => s.trim())
    if (t.includes(',')) {
      // 纯数字（含千位分隔符）不分割
      if (/^[\d,]+\.?\d*$/.test(t)) return [t.trim()]
      // 智能分割：保护千位分隔符
      const values: string[] = []
      let cur = ''
      for (let i = 0; i < t.length; i++) {
        const ch = t[i]
        if (ch === ',') {
          const isThousands = /\d/.test(t[i - 1] || '') && /\d/.test(t[i + 1] || '') && /^\d{1,3}($|[,\s\t])/.test(t.substring(i + 1))
          if (isThousands) { cur += ch; continue }
          if (cur.trim()) values.push(cur.trim())
          cur = ''
        } else if (/\s/.test(ch)) {
          if (cur.trim()) values.push(cur.trim())
          cur = ''
        } else cur += ch
      }
      if (cur.trim()) values.push(cur.trim())
      return values
    }
    return t.split(/\s+/)
  }

  const onInputPaste = (e: React.ClipboardEvent<HTMLInputElement>, day: number, field: string) => {
    if (editingDay !== day) {
      showMsg('请先点击编辑按钮进入' + day + '日的编辑模式', 'info')
      e.preventDefault()
      return
    }
    const text = e.clipboardData.getData('text')
    if (!text) return
    const pasteFields = ['grossSales', 'discounts', 'tax', 'serviceFee', 'adjAmount', 'tablesUsed', 'diners', 'newCustomers', 'returningCustomers']
    const startIdx = pasteFields.indexOf(field)
    // 起点不在表内（不在可粘贴列）→ 拦下来，否则后面的值会整体错位一格
    if (startIdx < 0) { showMsg('请从「总销售额」列开始粘贴整行数据', 'info'); e.preventDefault(); return }
    const lines = text.trim().split('\n').filter(l => l.trim() !== '')
    const setValues = (d: number, vals: string[], start: number) => {
      dirtyRef.current.add(d)
      setRows(prev => {
        const cur = { ...(prev[d] || {}) }
        vals.forEach((v, i) => {
          const f = pasteFields[start + i]
          if (f && v !== '') {
            const clean = v.replace(/[^\d.,-]/g, '').replace(/,/g, '')
            if (!isNaN(parseFloat(clean))) cur[f] = clean
          }
        })
        return { ...prev, [d]: cur }
      })
    }
    // 单行多值：解析填入当前行
    if (lines.length === 1 && (text.includes('\t') || text.includes(',') || text.split(/\s+/).length > 1)) {
      e.preventDefault()
      setValues(day, parsePasteLine(text), startIdx)
      return
    }
    // 多行粘贴：从当前行开始，填入后续编辑模式行
    if (lines.length > 1) {
      const editingDays: number[] = []
      for (let d = day; d <= daysInMonth; d++) if (d === editingDay) editingDays.push(d)
      if (lines.length > editingDays.length) {
        showMsg('数据有 ' + lines.length + ' 行，但只有 ' + editingDays.length + ' 行在编辑模式', 'info')
      }
      e.preventDefault()
      lines.slice(0, editingDays.length).forEach((line, li) => {
        const d = editingDays[li]
        setValues(d, parsePasteLine(line), li === 0 ? startIdx : 0)
      })
    }
  }

  // 点击外部关闭报表类型下拉
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.report-type-selector')) setReportOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  // Ctrl+S 全局保存
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveAll()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  // ---- 输入框着色（线上 updateInputColors）：查看/编辑均按数据状态着色——有值(含 0)→蓝，空→红
  //      （对齐 CostEdit 与旧系统：非编辑行也展示 红蓝 状态，不再一律 readonly 灰） ----
  const inputCls = (day: number, field: string) => {
    const base = 'excel-input' + (CURRENCY_FIELDS.includes(field) ? ' currency-input' : '')
    const r = rows[day] || {}
    let state: string
    if (field === 'discounts') {
      // 折扣列：行关键字段 >=4 有数据 → 蓝
      const keyFields = ['grossSales', 'diners', 'tax', 'serviceFee', 'tablesUsed', 'newCustomers', 'returningCustomers']
      const filled = keyFields.filter(f => hasVal(r[f])).length
      state = filled >= 4 ? ' has-data' : ' no-data'
    } else {
      state = hasVal(r[field]) ? ' has-data' : ' no-data'
    }
    // 非编辑（只读）也带状态着色：readonly 灰底被后面的 has-data/no-data 覆盖（与 CostEdit 同款）
    if (editingDay !== day) return base + ' readonly' + state
    return base + state
  }

  const weekday = (day: number) => ['日', '一', '二', '三', '四', '五', '六'][new Date(year, month - 1, day).getDay()]
  const isWeekend = (day: number) => { const d = new Date(year, month - 1, day).getDay(); return d === 0 || d === 6 }

  return (
    <div className="ke-root">
      <div className="container">
        <div className="header">
          <div>
            <h1>TOKYO JAPANESE CUISINE 数据后台</h1>
          </div>
          <div className="controls">
            <div className="report-type-selector">
              <button className="report-type-btn" onClick={() => setReportOpen(!reportOpen)}>
                <i className="fas fa-chart-bar"></i>
                KPI 报表
                <i className="fas fa-chevron-down"></i>
              </button>
              <div className={'report-dropdown-menu' + (reportOpen ? ' show' : '')} id="report-type-dropdown">
                <Link to="/kpi/upload" className="report-dropdown-item" onClick={() => setReportOpen(false)}>
                  <i className="fas fa-chart-line"></i> KPI 报表
                </Link>
                <Link to="/cost/upload" className="report-dropdown-item" onClick={() => setReportOpen(false)}>
                  <i className="fas fa-chart-pie"></i> 成本报表
                </Link>
              </div>
            </div>
            <div className="restaurant-selector">
              <div className="restaurant-prefix">J</div>
              <div className="number-dropdown">
                <button className="number-btn dropdown-toggle" onClick={() => setNumOpen(!numOpen)}>
                  {restaurant.replace('j', '')}
                  <i className="fas fa-chevron-down"></i>
                </button>
                {numOpen && (
                  <div className="number-dropdown-menu" id="number-dropdown" style={{ display: 'block', position: 'absolute', zIndex: 1500 }}>
                    <div className="number-grid">
                      {['1', '2', '3'].map(n => (
                        <button key={n} className={'number-item' + (restaurant === 'j' + n ? ' selected' : '')} disabled={saving}
                          onClick={() => { setNumOpen(false); guardSwitch(() => setRestaurant('j' + n)) }}>{n}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div id="alert-container"></div>

        <div className="month-selector">
          <div>
            <label htmlFor="year-select">年份:</label>
            <select id="year-select" value={year} disabled={saving}
              onChange={(e) => { const v = Number(e.target.value); if (!guardSwitch(() => setYear(v))) e.target.value = String(year) }}>
              {Array.from({ length: new Date().getFullYear() + 2 - 2023 + 1 }, (_, i) => 2023 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="month-select">月份:</label>
            <select id="month-select" value={month} disabled={saving}
              onChange={(e) => { const v = Number(e.target.value); if (!guardSwitch(() => setMonth(v))) e.target.value = String(month) }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
          <div id="current-restaurant-info" className="stat-item">
            <i className="fas fa-store"></i>
            <span>当前: <span className="stat-value">{restaurant.toUpperCase()}</span></span>
          </div>
        </div>

        <div className="excel-container">
          <div className="action-buttons">
            <div className="stats-info" id="month-stats">
              <div className="stat-item">
                <i className="fas fa-calendar-day"></i>
                <span>已填写: <span className="stat-value" id="filled-days">{stats.filled}</span> 天</span>
              </div>
              <div className="stat-item">
                <i className="fas fa-chart-line"></i>
                <span>月总净利润额: RM <span className="stat-value" id="total-sales">{stats.netTotal.toLocaleString()}</span></span>
              </div>
              <div className="stat-item">
                <i className="fas fa-money-bill-wave"></i>
                <span>月总利润额: RM <span className="stat-value" id="total-tender">{stats.tenderTotal.toLocaleString()}</span></span>
              </div>
              <div className="stat-item">
                <i className="fas fa-users"></i>
                <span>月总顾客人数: <span className="stat-value" id="total-diners">{stats.dinersTotal.toLocaleString()}</span></span>
              </div>
              <div className="stat-item">
                <i className="fas fa-table"></i>
                <span>月总桌数: <span className="stat-value" id="total-tables">{stats.tablesTotal.toLocaleString()}</span></span>
              </div>
              <div className="stat-item">
                <i className="fas fa-calculator"></i>
                <span>月总人均消费: RM <span className="stat-value" id="avg-per-customer">{stats.avg.toFixed(2)}</span></span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={saveAll} disabled={saving || loading}>
                {saving ? <><div className="loading"></div> 保存中...</> : <><i className="fas fa-save"></i> 保存本月数据</>}
              </button>
            </div>
          </div>
          <div className="table-scroll-container">
            <table className="excel-table" id="excel-table">
              <thead>
                <tr>
                  <th style={{ width: '7%' }}>日期</th>
                  <th style={{ width: '8%' }}>总销售额</th>
                  <th style={{ width: '6%' }}>折扣</th>
                  <th style={{ width: '8%' }}>净销售额</th>
                  <th style={{ width: '7%' }}>税</th>
                  <th style={{ width: '7%' }}>服务费</th>
                  <th style={{ width: '7%' }}>调整金额</th>
                  <th style={{ width: '8%' }}>投标金额</th>
                  <th style={{ width: '5%' }}>桌数总数</th>
                  <th style={{ width: '5%' }}>顾客总数</th>
                  <th style={{ width: '8%' }}>人均消费</th>
                  <th style={{ width: '5%' }}>新客人数</th>
                  <th style={{ width: '5%' }}>常客人数</th>
                  <th style={{ width: '7%' }}>常客人率 (%)</th>
                  <th style={{ width: '9%' }}>操作</th>
                </tr>
              </thead>
              <tbody id="excel-tbody">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const c = calc(day)
                  const r = rows[day] || {}
                  const isEditing = editingDay === day
                  const inp = (field: string, dataField: string, isMoney: boolean, extra: { max?: number } = {}) => (
                    <input type="number" className={inputCls(day, field)} data-field={dataField} data-day={day}
                      value={isEditing ? (r[field] || '') : (isMoney ? fmtCur(r[field]) : fmtInt(r[field]))}
                      min="0" step={isMoney ? '0.01' : '1'} placeholder={isMoney ? '0.00' : '0'} disabled={!isEditing}
                      ref={el => { inputRefs.current[field + '-' + day] = el }}
                      onChange={(e) => update(day, field, e.target.value)}
                      onBlur={() => onBlur(day, field)}
                      onKeyDown={(e) => onInputKeyDown(e, day, field)}
                      onPaste={(e) => onInputPaste(e, day, field)}
                      onFocus={(e) => { if (e.target.value) e.target.select() }} />
                  )
                  return (
                    <tr key={day} className={isEditing ? 'editing-row' : ''}>
                      <td className={'date-cell' + (isWeekend(day) ? ' weekend' : '')}>
                        {month}月{day}<small> (周{weekday(day)})</small>
                      </td>
                      <td>
                        <div className="input-container">
                          <span className="currency-prefix">RM</span>
                          {inp('grossSales', 'gross_sales', true)}
                        </div>
                      </td>
                      <td>
                        <div className="input-container">
                          <span className="currency-prefix">RM</span>
                          {inp('discounts', 'discounts', true)}
                        </div>
                      </td>
                      <td className="calculated-cell" id={'net-sales-' + day}>RM {c.net.toFixed(2)}</td>
                      <td>
                        <div className="input-container">
                          <span className="currency-prefix">RM</span>
                          {inp('tax', 'tax', true)}
                        </div>
                      </td>
                      <td>
                        <div className="input-container">
                          <span className="currency-prefix">RM</span>
                          {inp('serviceFee', 'service_fee', true)}
                        </div>
                      </td>
                      <td>
                        <div className="input-container">
                          <span className="currency-prefix">RM</span>
                          {inp('adjAmount', 'adj_amount', true)}
                        </div>
                      </td>
                      <td className="calculated-cell" id={'tender-amount-' + day}>RM {c.tender.toFixed(2)}</td>
                      <td>{inp('tablesUsed', 'tables_used', false, { max: 50 })}</td>
                      <td>{inp('diners', 'diners', false)}</td>
                      <td className="calculated-cell" id={'avg-per-diner-' + day}>RM {c.avg.toFixed(2)}</td>
                      <td>{inp('newCustomers', 'new_customers', false)}</td>
                      <td>{inp('returningCustomers', 'returning_customers', false)}</td>
                      <td className="calculated-cell" id={'returning-customer-rate-' + day}>{c.rate.toFixed(2)}%</td>
                      <td className="action-cell">
                        <button className={'edit-btn' + (isEditing ? ' save-mode' : '')} id={'edit-btn-' + day} disabled={saving}
                          onClick={() => toggleEdit(day)} title={savingDay === day ? '保存中...' : (isEditing ? '保存' + day + '日数据' : '编辑' + day + '日数据')}>
                          <i className={'fas ' + (savingDay === day ? 'fa-spinner fa-spin' : (isEditing ? 'fa-save' : 'fa-edit'))}></i>
                        </button>
                        <button className="cancel-edit-btn" id={'cancel-btn-' + day}
                          onClick={() => cancelEdit(day)} title="取消编辑" style={{ display: isEditing ? 'inline-block' : 'none' }}>
                          <i className="fas fa-times"></i>
                        </button>
                        <button className="delete-day-btn" id={'delete-btn-' + day} disabled={saving}
                          onClick={() => clearDay(day)} title={'清空' + day + '日数据'} style={{ display: isEditing ? 'none' : 'inline-block' }}>
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 切换店/月份时：有未保存数据 → 问是否先保存（替代 window.confirm） */}
      {askDays > 0 && (
        <div className="ke-ask-mask" onClick={askKeepEditing}>
          <div className="ke-ask-card" onClick={(e) => e.stopPropagation()}>
            <div className="ke-ask-title">还有 {askDays} 天数据没保存</div>
            <div className="ke-ask-text">切换之前要先把这些数据保存吗？<br />选「继续编辑」就留在当前这个页面。</div>
            <div className="ke-ask-actions">
              <button className="btn btn-secondary" onClick={askKeepEditing}>
                <i className="fas fa-pen"></i> 继续编辑
              </button>
              <button className="btn btn-primary" onClick={askSaveThenSwitch}>
                <i className="fas fa-save"></i> 保存并切换
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
