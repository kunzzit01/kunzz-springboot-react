import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getKpiReport, saveKpiCost, getKpiMonthStock, saveKpiMonthStock } from '../api'
import '../styles/kpiedit.css'
import { showToast } from '../utils/toast'

interface DayRow {
  [field: string]: string | undefined
}

const COST_FIELDS = ['cBeverage', 'cKitchen', 'cGrab', 'cFoodpanda', 'cShopee']
const CURRENCY_FIELDS = ['cBeverage', 'cKitchen', 'cGrab', 'cFoodpanda', 'cShopee']

// 有值判定（对齐线上 updateInputColors：只有空值算无数据；'0'/'0.00' 视为有数据——
// RM0.00 的成本也是真实记录，需变蓝显示并可保存）
const hasVal = (v?: string) => v !== undefined && v !== ''

// 货币显示：有值才显示两位小数
const fmtCur = (v?: string) => {
  if (!hasVal(v)) return ''
  const n = parseFloat(v!)
  return isNaN(n) ? '' : n.toFixed(2)
}

export default function CostEdit() {
  const [restaurant, setRestaurant] = useState('j1')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<Record<number, DayRow>>({})
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [numOpen, setNumOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stockInput, setStockInput] = useState('')
  const preservedRef = useRef<Record<number, DayRow>>({})

  const showMsg = (msg: string, type = 'success') => showToast(msg, type)

  const daysInMonth = new Date(year, month, 0).getDate()
  const yearMonth = year + '-' + String(month).padStart(2, '0')

  // 加载：成本数据 + KPI 净销售额（/api/kpi/report 一次返回两类行）
  const load = async () => {
    setLoading(true)
    try {
      const res = await getKpiReport(restaurant, yearMonth)
      const costMap: Record<number, DayRow> = {}
      const kpiNet: Record<number, number> = {}
      ;(res.rows || []).forEach((r: any) => {
        const day = parseInt(String(r.date).split('-')[2], 10)
        if (r._type === 'cost' && !isNaN(day)) {
          costMap[day] = {
            cBeverage: fmtCur(String(r.cBeverage ?? '')),
            cKitchen: fmtCur(String(r.cKitchen ?? '')),
            cGrab: fmtCur(String(r.cGrab ?? '')),
            cFoodpanda: fmtCur(String(r.cFoodpanda ?? '')),
            cShopee: fmtCur(String(r.cShopee ?? '')),
            _hasRecord: '1'
          }
        }
        if (r._type === 'daily' && !isNaN(day)) {
          kpiNet[day] = (Number(r.grossSales) || 0) - (Number(r.discounts) || 0)
        }
      })
      const byDay: Record<number, DayRow> = {}
      // 成本数据为主，销售额用 KPI 净销售额覆盖
      Object.keys(costMap).forEach(d => {
        const day = Number(d)
        byDay[day] = { ...costMap[day] }
        if (kpiNet[day] !== undefined) byDay[day].sales = kpiNet[day] > 0 ? kpiNet[day].toFixed(2) : ''
      })
      // 只有 KPI 销售额、没有成本记录的日期也生成行（销售只读显示）
      Object.keys(kpiNet).forEach(d => {
        const day = Number(d)
        if (!byDay[day] && kpiNet[day] > 0) {
          byDay[day] = { sales: kpiNet[day].toFixed(2) }
        }
      })
      setRows(byDay)
      // 加载当月库存
      try {
        const stock = await getKpiMonthStock(restaurant, yearMonth)
        const v = stock.current_stock
        setStockInput(v && Number(v) > 0 ? Number(v).toFixed(2) : '')
      } catch { setStockInput('') }
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => {
    setEditingDay(null)
    load()
  }, [restaurant, year, month])

  // ---- 计算列（与线上 updateCalculations 一致） ----
  const calc = (day: number) => {
    const r = rows[day] || {}
    const sales = parseFloat(r.sales || '') || 0
    const cBeverage = parseFloat(r.cBeverage || '') || 0
    const cKitchen = parseFloat(r.cKitchen || '') || 0
    const cGrab = parseFloat(r.cGrab || '') || 0
    const cFoodpanda = parseFloat(r.cFoodpanda || '') || 0
    const cShopee = parseFloat(r.cShopee || '') || 0
    // 总成本 = 饮料 + 厨房（外卖不计入成本）
    const cTotal = cBeverage + cKitchen
    // 销售额加上外卖（折半）作为真实总收入
    const finalSales = sales + (cGrab + cFoodpanda + cShopee) / 2
    const grossTotal = finalSales - cTotal
    const costPercent = finalSales > 0 ? (cTotal / finalSales) * 100 : 0
    return { cTotal, finalSales, grossTotal, costPercent }
  }

  // ---- 月度统计（与线上 updateMonthStats 一致） ----
  const stats = useMemo(() => {
    let filled = 0, totalSales = 0, totalCost = 0, totalProfit = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const r = rows[d] || {}
      const c = calc(d)
      const sales = parseFloat(r.sales || '') || 0
      const any = sales > 0 || COST_FIELDS.some(f => (parseFloat(r[f] || '') || 0) > 0)
      if (any) filled++
      totalSales += c.finalSales
      totalCost += c.cTotal
      totalProfit += c.grossTotal
    }
    return { filled, totalSales, totalCost, totalProfit, avgCostPercent: totalSales > 0 ? (totalCost / totalSales) * 100 : 0 }
  }, [rows, daysInMonth])

  // ---- 更新字段 ----
  const update = (day: number, field: string, value: string) => {
    let v = value
    if (CURRENCY_FIELDS.includes(field)) {
      if (v.includes('.')) {
        const parts = v.split('.')
        if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].substring(0, 2)
      }
    }
    setRows(prev => {
      const cur = { ...(prev[day] || {}) }
      cur[field] = v
      return { ...prev, [day]: cur }
    })
  }

  const onBlur = (day: number, field: string) => {
    if (!CURRENCY_FIELDS.includes(field)) return
    setRows(prev => {
      const cur = { ...(prev[day] || {}) }
      const v = cur[field]
      if (v && !isNaN(parseFloat(v))) cur[field] = parseFloat(v).toFixed(2)
      return { ...prev, [day]: cur }
    })
  }

  // ---- 行编辑模式（sales 永远只读） ----
  const toggleEdit = (day: number) => {
    if (editingDay === day) {
      saveRow(day)
    } else {
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
    return {
      date: yearMonth + '-' + String(day).padStart(2, '0'),
      cBeverage: parseFloat(r.cBeverage || '') || 0,
      cKitchen: parseFloat(r.cKitchen || '') || 0,
      cGrab: parseFloat(r.cGrab || '') || 0,
      cFoodpanda: parseFloat(r.cFoodpanda || '') || 0,
      cShopee: parseFloat(r.cShopee || '') || 0
    }
  }

  const hasData = (day: number) => {
    const r = rows[day] || {}
    // 只要任意成本字段有值（含 0 / 0.00）即视为有数据，可保存（RM0 成本也需落库）
    return COST_FIELDS.some(f => r[f] !== undefined && r[f] !== '') || r._hasRecord === '1'
  }

  // 保存单行
  const saveRow = async (day: number) => {
    if (hasData(day)) {
      try {
        await saveKpiCost(restaurant, buildPayload(day))
        showMsg(day + '日数据保存成功', 'success')
      } catch { showMsg('保存' + day + '日数据失败', 'error') }
    }
    setEditingDay(null)
  }

  // 保存全部：先库存（若有值），再逐日成本
  const saveAll = async () => {
    if (saving || loading) return
    setSaving(true)
    try {
      let stockSaved = false
      if (stockInput && stockInput.trim() !== '') {
        try {
          await saveKpiMonthStock(restaurant, { yearMonth, currentStock: parseFloat(stockInput) || 0 })
          stockSaved = true
        } catch { showMsg('库存数据保存失败', 'warning') }
      }
      let successCount = 0
      for (let d = 1; d <= daysInMonth; d++) {
        if (hasData(d)) {
          await saveKpiCost(restaurant, buildPayload(d))
          successCount++
        }
      }
      if (successCount > 0) {
        showMsg('数据保存成功！共保存 ' + successCount + ' 条记录' + (stockSaved ? '，库存数据已保存' : ''), 'success')
        await load()
      } else if (stockSaved) {
        showMsg('库存数据已保存', 'success')
        await load()
      } else {
        showMsg('没有需要保存的数据', 'info')
      }
    } catch {
      showMsg('保存过程中发生错误，请检查网络连接后重试', 'error')
    }
    setSaving(false)
  }

  // 清空单日成本（保留销售额）
  const clearCost = (day: number) => {
    if (!window.confirm('确定要清空' + day + '日的饮料成本/厨房成本吗？销售额将保留（从KPI自动获取）。')) return
    ;(async () => {
      try {
        await saveKpiCost(restaurant, {
          date: yearMonth + '-' + String(day).padStart(2, '0'),
          cBeverage: 0, cKitchen: 0, cGrab: 0, cFoodpanda: 0, cShopee: 0
        })
        setRows(prev => {
          const cur = { ...(prev[day] || {}) }
          COST_FIELDS.forEach(f => { cur[f] = '' })
          cur._hasRecord = '1'
          return { ...prev, [day]: cur }
        })
        showMsg(day + '日成本已清空（销售额保留）', 'success')
      } catch {
        showMsg('清空' + day + '日成本失败', 'error')
      }
    })()
  }

  // ---- 快捷键 ----
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, day: number, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const next = inputRefs.current[field + '-' + (day + 1)]
      if (next) next.focus()
    }
  }

  // 粘贴：销售额字段不可编辑，从饮料成本开始
  const onInputPaste = (e: React.ClipboardEvent<HTMLInputElement>, day: number, field: string) => {
    if (editingDay !== day) {
      showMsg('请先点击编辑按钮进入' + day + '日的编辑模式', 'info')
      e.preventDefault()
      return
    }
    const text = e.clipboardData.getData('text')
    if (!text) return
    const pasteFields = COST_FIELDS
    let startIdx = pasteFields.indexOf(field)
    if (startIdx < 0) startIdx = 0
    const lines = text.trim().split('\n').filter(l => l.trim() !== '')
    const setValues = (d: number, vals: string[], start: number) => {
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
    if (lines.length === 1 && (text.includes('\t') || text.includes(',') || text.split(/\s+/).length > 1)) {
      e.preventDefault()
      setValues(day, parsePasteLine(text), startIdx)
      return
    }
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

  const parsePasteLine = (line: string): string[] => {
    const t = line.trim()
    if (t.includes('\t')) return t.split('\t').map(s => s.trim())
    if (t.includes(',')) {
      if (/^[\d,]+\.?\d*$/.test(t)) return [t.trim()]
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

  // ---- 着色：sales 恒为 auto-filled 蓝，成本字段 has-data/no-data（查看/编辑均按数据状态着色，对齐旧系统 updateInputColors） ----
  const inputCls = (day: number, field: string) => {
    if (field === 'sales') return 'excel-input currency-input auto-filled'
    const base = 'excel-input currency-input'
    const r = rows[day] || {}
    const state = hasVal(r[field]) ? ' has-data' : ' no-data'
    // 非编辑（只读）也按数据状态着色：有值(含 RM0)→蓝，空→红；readonly 类在 has-data/no-data 之前定义，蓝/红优先
    if (editingDay !== day) return base + ' readonly' + state
    return base + state
  }

  const weekday = (day: number) => ['日', '一', '二', '三', '四', '五', '六'][new Date(year, month - 1, day).getDay()]
  const isWeekend = (day: number) => { const d = new Date(year, month - 1, day).getDay(); return d === 0 || d === 6 }

  const costInput = (day: number, field: string, dataField: string) => (
    <div className="input-container">
      <span className="currency-prefix">RM</span>
      <input type="number" className={inputCls(day, field)} data-field={dataField} data-day={day}
        value={editingDay === day ? (rows[day]?.[field] || '') : fmtCur(rows[day]?.[field])}
        min="0" step="0.01" placeholder="0.00" disabled={editingDay !== day}
        ref={el => { inputRefs.current[field + '-' + day] = el }}
        onChange={(e) => update(day, field, e.target.value)}
        onBlur={() => onBlur(day, field)}
        onKeyDown={(e) => onInputKeyDown(e, day, field)}
        onPaste={(e) => onInputPaste(e, day, field)}
        onFocus={(e) => { if (e.target.value) e.target.select() }} />
    </div>
  )

  return (
    <div className="ke-root">
      <div className="container">
        <div className="header">
          <div>
            <h1>TOKYO JAPANESE CUISINE 成本后台</h1>
          </div>
          <div className="controls">
            <div className="report-type-selector">
              <button className="report-type-btn" onClick={() => setReportOpen(!reportOpen)}>
                <i className="fas fa-chart-pie"></i>
                成本报表
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
                        <button key={n} className={'number-item' + (restaurant === 'j' + n ? ' selected' : '')}
                          onClick={() => { setRestaurant('j' + n); setNumOpen(false) }}>{n}</button>
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
            <select id="year-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: new Date().getFullYear() + 2 - 2023 + 1 }, (_, i) => 2023 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="month-select">月份:</label>
            <select id="month-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
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
                <i className="fas fa-dollar-sign"></i>
                <span>月总销售额: RM <span className="stat-value" id="total-sales">{stats.totalSales.toFixed(2)}</span></span>
              </div>
              <div className="stat-item">
                <i className="fas fa-chart-pie"></i>
                <span>月总成本: RM <span className="stat-value" id="total-cost">{stats.totalCost.toFixed(2)}</span></span>
              </div>
              <div className="stat-item">
                <i className="fas fa-money-bill-wave"></i>
                <span>月总毛利润: RM <span className="stat-value" id="total-profit">{stats.totalProfit.toFixed(2)}</span></span>
              </div>
              <div className="stat-item">
                <i className="fas fa-percentage"></i>
                <span>平均成本率: <span className="stat-value" id="avg-cost-percent">{stats.avgCostPercent.toFixed(2)}</span>%</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="stock-input-container">
                <label htmlFor="current-stock-input">
                  <i className="fas fa-warehouse"></i>
                  当前库存 (RM):
                </label>
                <input type="number" id="current-stock-input" min="0" step="0.01" placeholder="0.00"
                  value={stockInput}
                  onChange={(e) => {
                    let v = e.target.value
                    if (v.includes('.')) {
                      const parts = v.split('.')
                      if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].substring(0, 2)
                    }
                    setStockInput(v)
                  }} />
              </div>
              <button className="btn btn-primary" onClick={saveAll} disabled={saving || loading}>
                {saving ? <><div className="loading"></div> 保存中...</> : <><i className="fas fa-save"></i> 保存本月数据</>}
              </button>
            </div>
          </div>
          <div className="table-scroll-container">
            <table className="excel-table" id="excel-table">
              <thead>
                <tr>
                  <th style={{ width: '10%' }}>日期</th>
                  <th style={{ width: '12%' }}>销售额</th>
                  <th style={{ width: '10%' }}>饮料成本</th>
                  <th style={{ width: '10%' }}>厨房成本</th>
                  <th style={{ width: '10%' }}>Grab Food</th>
                  <th style={{ width: '10%' }}>Foodpanda</th>
                  <th style={{ width: '10%' }}>Shopee Food</th>
                  <th style={{ width: '10%' }}>总成本</th>
                  <th style={{ width: '12%' }}>毛利润</th>
                  <th style={{ width: '10%' }}>成本率 (%)</th>
                  <th style={{ width: '10%' }}>操作</th>
                </tr>
              </thead>
              <tbody id="excel-tbody">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const c = calc(day)
                  const isEditing = editingDay === day
                  return (
                    <tr key={day} className={isEditing ? 'editing-row' : ''}>
                      <td className={'date-cell' + (isWeekend(day) ? ' weekend' : '')}>
                        {month}月{day}<small> (周{weekday(day)})</small>
                      </td>
                      <td>
                        <div className="input-container auto-filled-container">
                          <span className="currency-prefix">RM</span>
                          <input type="number" className="excel-input currency-input auto-filled" data-field="sales" data-day={day}
                            value={fmtCur(rows[day]?.sales)} min="0" step="0.01" placeholder="0.00"
                            disabled title="销售额自动从KPI净销售额获取，不可手动编辑" />
                        </div>
                      </td>
                      <td>{costInput(day, 'cBeverage', 'c_beverage')}</td>
                      <td>{costInput(day, 'cKitchen', 'c_kitchen')}</td>
                      <td>{costInput(day, 'cGrab', 'c_grab')}</td>
                      <td>{costInput(day, 'cFoodpanda', 'c_foodpanda')}</td>
                      <td>{costInput(day, 'cShopee', 'c_shopee')}</td>
                      <td className="calculated-cell" id={'c-total-' + day}>RM {c.cTotal.toFixed(2)}</td>
                      <td className={'calculated-cell' + (c.grossTotal < 0 ? ' negative' : '')} id={'gross-total-' + day}>RM {c.grossTotal.toFixed(2)}</td>
                      <td className="calculated-cell" id={'cost-percent-' + day}>{c.costPercent.toFixed(2)}%</td>
                      <td className="action-cell">
                        <button className={'edit-btn' + (isEditing ? ' save-mode' : '')} id={'edit-btn-' + day}
                          onClick={() => toggleEdit(day)} title={isEditing ? '保存' + day + '日数据' : '编辑' + day + '日数据'}>
                          <i className={'fas ' + (isEditing ? 'fa-save' : 'fa-edit')}></i>
                        </button>
                        <button className="cancel-edit-btn" id={'cancel-btn-' + day}
                          onClick={() => cancelEdit(day)} title="取消编辑" style={{ display: isEditing ? 'inline-block' : 'none' }}>
                          <i className="fas fa-times"></i>
                        </button>
                        <button className="delete-day-btn" id={'delete-btn-' + day}
                          onClick={() => clearCost(day)} title={'清空' + day + '日成本（保留销售额）'} style={{ display: isEditing ? 'none' : 'inline-block' }}>
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

    </div>
  )
}
