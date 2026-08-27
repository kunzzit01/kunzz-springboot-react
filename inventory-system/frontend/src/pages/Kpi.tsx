import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { getKpiReport } from '../api'
import '../styles/kpi.css'

interface DailyRow {
  date?: string
  grossSales?: number
  discounts?: number
  tenderAmount?: number
  diners?: number
  tablesUsed?: number
  returningCustomers?: number
  newCustomers?: number
  _type?: string
}

interface KpiPoint {
  date: string
  totalSales: number
  netSales: number
  diners: number
  tablesUsed: number
  returningCustomers: number
  newCustomers: number
  avgSalesPerDiner: number
  returningRate: number
}

// ---------- 日期工具 ----------
const pad = (n: number) => String(n).padStart(2, '0')
const toYMD = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
const fmtDisplay = (d: string) => {
  const [y, m, day] = d.split('-')
  return y + '年' + Number(m) + '月' + Number(day) + '日'
}
const fmtShort = (d: string) => {
  const [, m, day] = d.split('-')
  return Number(m) + '/' + Number(day)
}
// 中文日期范围：2026年8月1日 至 2026年8月18日
const fmtRangeZh = (start: string, end: string) => {
  const f = (d: string) => {
    const [y, m, day] = d.split('-')
    return y + '年' + Number(m) + '月' + Number(day) + '日'
  }
  return f(start) + ' 至 ' + f(end)
}

// 快速范围
function quickRange(key: string): { start: string; end: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (key === 'today') return { start: toYMD(today), end: toYMD(today) }
  if (key === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1)
    return { start: toYMD(y), end: toYMD(y) }
  }
  if (key === 'thisWeek') {
    const day = today.getDay() || 7
    const mon = new Date(today); mon.setDate(today.getDate() - day + 1)
    return { start: toYMD(mon), end: toYMD(today) }
  }
  if (key === 'lastWeek') {
    const day = today.getDay() || 7
    const mon = new Date(today); mon.setDate(today.getDate() - day + 1)
    const end = new Date(mon); end.setDate(end.getDate() - 1)
    const start = new Date(mon); start.setDate(start.getDate() - 7)
    return { start: toYMD(start), end: toYMD(end) }
  }
  if (key === 'thisMonth') {
    return { start: toYMD(new Date(today.getFullYear(), today.getMonth(), 1)), end: toYMD(today) }
  }
  if (key === 'lastMonth') {
    const end = new Date(today.getFullYear(), today.getMonth(), 0)
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return { start: toYMD(start), end: toYMD(end) }
  }
  if (key === 'thisYear') {
    return { start: today.getFullYear() + '-01-01', end: toYMD(today) }
  }
  if (key === 'lastYear') {
    return { start: (today.getFullYear() - 1) + '-01-01', end: (today.getFullYear() - 1) + '-12-31' }
  }
  return { start: toYMD(today), end: toYMD(today) }
}

const quickLabels: Record<string, string> = {
  today: '今天', yesterday: '昨天', thisWeek: '本周', lastWeek: '上周',
  thisMonth: '这个月', lastMonth: '上个月', thisYear: '今年', lastYear: '去年'
}

// 数据转换（对齐线上 convertToKPIFormat）
function toKpiPoints(rows: DailyRow[]): KpiPoint[] {
  return rows
    .filter(r => r._type === 'daily' && r.date)
    .map(r => {
      const diners = Number(r.diners) || 0
      const returning = Number(r.returningCustomers) || 0
      const newC = Number(r.newCustomers) || 0
      const gross = Number(r.grossSales) || 0
      const discounts = Number(r.discounts) || 0
      const net = gross - discounts
      const total = returning + newC
      return {
        date: String(r.date),
        totalSales: Number(r.tenderAmount) || gross,
        netSales: net,
        diners,
        tablesUsed: Number(r.tablesUsed) || 0,
        returningCustomers: returning,
        newCustomers: newC,
        avgSalesPerDiner: diners > 0 ? net / diners : 0,
        returningRate: total > 0 ? (returning / total) * 100 : 0
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}


export default function Kpi() {
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState<string | null>(null)
  const [letter, setLetter] = useState('')
  const [range, setRange] = useState<{ start: string; end: string }>(() => quickRange('thisMonth'))
  const [quickLabel, setQuickLabel] = useState('这个月')
  const [month, setMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
  const [allData, setAllData] = useState<Record<string, KpiPoint[]>>({})
  const [loading, setLoading] = useState(true)
  const [chartType, setChartType] = useState('netSales')
  const [drill, setDrill] = useState<{ mode: 'year' | 'month' | 'day'; year?: number; month?: number }>({ mode: 'day' })
  const [calOpen, setCalOpen] = useState(false)
  const [calView, setCalView] = useState<{ y: number; m: number }>({ y: new Date().getFullYear(), m: new Date().getMonth() })
  const [calSelStart, setCalSelStart] = useState<string | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [restOpen, setRestOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [monthDrop, setMonthDrop] = useState<'year' | 'month' | null>(null)
  const chartRef = useRef<any>(null)

  // ---------- 数据加载：j1/j2/j3 并行（total 合并） ----------
  const loadAll = async () => {
    setLoading(true)
    try {
      const [j1, j2, j3] = await Promise.all([
        getKpiReport('j1'), getKpiReport('j2'), getKpiReport('j3')
      ])
      const map: Record<string, KpiPoint[]> = {
        j1: toKpiPoints(j1.rows || []),
        j2: toKpiPoints(j2.rows || []),
        j3: toKpiPoints(j3.rows || []),
      }
      // total：三店按日期合并
      const all = new Map<string, KpiPoint>()
      ;['j1', 'j2', 'j3'].forEach(k => {
        map[k].forEach(p => {
          const ex = all.get(p.date)
          if (ex) {
            ex.totalSales += p.totalSales; ex.netSales += p.netSales
            ex.diners += p.diners; ex.tablesUsed += p.tablesUsed
            ex.returningCustomers += p.returningCustomers; ex.newCustomers += p.newCustomers
          } else all.set(p.date, { ...p })
        })
      })
      const totalArr = [...all.values()].map(p => {
        const total = p.returningCustomers + p.newCustomers
        return { ...p, avgSalesPerDiner: p.diners > 0 ? p.netSales / p.diners : 0, returningRate: total > 0 ? (p.returningCustomers / total) * 100 : 0 }
      }).sort((a, b) => a.date.localeCompare(b.date))
      map['total'] = totalArr
      setAllData(map)
    } catch { /* ignore */ }
    setLoading(false)
  }
  // 默认未选餐厅：不自动加载（对齐线上）

  // 当前餐厅按日期范围过滤
  const points = useMemo(() => {
    const all = allData[restaurant || ''] || []
    return all.filter(p => p.date >= range.start && p.date <= range.end)
  }, [allData, restaurant, range])

  // ---------- 汇总（KPI 卡） ----------
  const summary = useMemo(() => {
    let gross = 0, net = 0, tables = 0, diners = 0, ret = 0, nw = 0
    points.forEach(p => { gross += p.totalSales; net += p.netSales; tables += p.tablesUsed; diners += p.diners; ret += p.returningCustomers; nw += p.newCustomers })
    return {
      totalSales: gross, netSales: net, tables, diners,
      returningRate: (ret + nw) > 0 ? (ret / (ret + nw)) * 100 : 0,
      avgPerDiner: diners > 0 ? net / diners : 0
    }
  }, [points])

  // ---------- 图表数据聚合（对齐线上：按日期范围自动粒度 ≤60天按天 / 61-366按月 / >366按年，支持钻取） ----------
  // 日期范围天数
  const rangeDays = useMemo(() => {
    const s1 = new Date(range.start).getTime()
    const e1 = new Date(range.end).getTime()
    return Math.round((e1 - s1) / (1000 * 60 * 60 * 24)) + 1
  }, [range])

  // 自动聚合模式：日期范围变化时重置钻取到对应粒度
  useEffect(() => {
    setDrill({ mode: rangeDays <= 60 ? 'day' : (rangeDays <= 366 ? 'month' : 'year') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays])

  // 点击外部关闭所有下拉（对齐线上：关闭时隐藏餐厅数字区）
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.report-type-selector')) setReportOpen(false)
      if (!t.closest('.restaurant-selector')) { setRestOpen(false); setLetter('') }
      if (!t.closest('.dropdown')) setQuickOpen(false)
      if (!t.closest('.enhanced-date-picker')) setMonthDrop(null)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  function fieldValue(p: KpiPoint): number {
    return chartType === 'netSales' ? p.netSales : chartType === 'tables' ? p.tablesUsed : chartType === 'diners' ? p.diners : p.returningRate
  }
  const chartColors: Record<string, string> = { j1: '#583e04', j2: '#d97706', j3: '#dc2626' }
  const chartLabelsByType: Record<string, (r: string) => string> = {
    netSales: r => (r ? r + ' ' : '') + '净销售额',
    tables: r => (r ? r + ' ' : '') + '桌子数量',
    diners: r => (r ? r + ' ' : '') + '人数',
    returningRate: r => (r ? r + ' ' : '') + '常客(%)',
  }

  // 某餐厅数据按 drill 层级聚合（day=按天 / month=该年月 / year=按年）
  const aggregateFor = (r: string) => {
    const src = allData[r] || []
    let pts = src.filter(p => p.date >= range.start && p.date <= range.end)

    if (drill.mode === 'day' && drill.year && drill.month) {
      // 钻取到某月：该月按天
      const day = pts.filter(p => {
        const [y, m] = p.date.split('-').map(Number)
        return y === drill.year && m === drill.month
      }).sort((a, b) => a.date.localeCompare(b.date))
      return { labels: day.map(p => fmtShort(p.date)), values: day.map(p => fieldValue(p)) }
    }
    if (drill.mode === 'day') {
      // 默认按天（当前日期范围）
      const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date))
      return { labels: sorted.map(p => fmtShort(p.date)), values: sorted.map(p => fieldValue(p)) }
    }
    if (drill.mode === 'month') {
      // 有 year 时只聚该年；无 year 时聚合日期范围内所有月份
      const inRange = drill.year
        ? pts.filter(p => Number(p.date.split('-')[0]) === drill.year)
        : pts
      const byMonth = new Map<string, { sum: number; cnt: number }>()
      inRange.forEach(p => {
        const key = drill.year ? p.date.substring(5, 7) : p.date.substring(0, 7)
        const ex = byMonth.get(key) || { sum: 0, cnt: 0 }
        ex.sum += fieldValue(p); ex.cnt++
        byMonth.set(key, ex)
      })
      const keys = [...byMonth.keys()].sort()
      return {
        labels: keys.map(k => drill.year ? Number(k) + '月' : Number(k.substring(5)) + '月'),
        values: keys.map(k => { const e = byMonth.get(k)!; return chartType === 'returningRate' ? e.sum / e.cnt : e.sum })
      }
    }
    // 年度
    const byYear = new Map<string, { sum: number; cnt: number }>()
    pts.forEach(p => {
      const key = p.date.substring(0, 4)
      const ex = byYear.get(key) || { sum: 0, cnt: 0 }
      ex.sum += fieldValue(p); ex.cnt++
      byYear.set(key, ex)
    })
    const keys = [...byYear.keys()].sort()
    return {
      labels: keys.map(k => k + '年'),
      values: keys.map(k => { const e = byYear.get(k)!; return chartType === 'returningRate' ? e.sum / e.cnt : e.sum })
    }
  }

  // 图表数据集
  const chartDatasets = useMemo(() => {
    const isTotal = restaurant === 'total'
    const rKeys = isTotal ? ['j1', 'j2', 'j3'] : [restaurant || 'j1']
    return rKeys.map(r => {
      const agg = aggregateFor(r)
      const typeLabel = (chartLabelsByType[chartType] || (() => ''))('')
      return {
        label: isTotal ? (chartLabelsByType[chartType] || (() => ''))(r.toUpperCase()) : typeLabel,
        color: isTotal ? chartColors[r] : '#583e04',
        ...agg
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allData, restaurant, range, drill, chartType])

  const chartLabels = chartDatasets[0]?.labels || []

  // 渲染图表
  useEffect(() => {
    if (chartDatasets.length === 0 || chartLabels.length === 0) return
    const w = window as any
    if (!w.Chart) return
    if (chartRef.current) chartRef.current.destroy()
    const ctx = document.getElementById('sales-chart') as HTMLCanvasElement | null
    if (!ctx) return
    const isRate = chartType === 'returningRate'
    const fmt = (v: number) => isRate ? v.toFixed(1) + '%' : 'RM ' + v.toLocaleString('en-MY', { maximumFractionDigits: 2 })
    chartRef.current = new w.Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: chartDatasets.map(ds => ({
          label: ds.label,
          data: ds.values,
          borderColor: ds.color,
          backgroundColor: function (context: any) {
            const chart = context.chart
            const { ctx, chartArea } = chart
            if (!chartArea) return ds.color + '33'
            const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
            g.addColorStop(0, ds.color + '05')
            g.addColorStop(0.6, ds.color + '22')
            g.addColorStop(1, ds.color + '45')
            return g
          },
          fill: true,
          tension: 0.4,
          pointBackgroundColor: ds.color,
          pointRadius: 0,
          pointHitRadius: 14, // 命中检测半径（pointRadius=0 时默认命中区为 0，导致 tooltip 不触发）
          pointHoverRadius: 8,
          borderWidth: 2
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // 鼠标在线/点附近滑动即显示 tooltip（intersect:false 无需精确命中点）
        interaction: { mode: 'index', intersect: false },
        onClick: (evt: any, elems: any) => {
          if (elems.length > 0 && drill.mode === 'year') {
            const idx = elems[0].index
            const y = Number(String(chartLabels[idx]).replace('年', ''))
            setDrill({ mode: 'month', year: y })
          } else if (elems.length > 0 && drill.mode === 'month' && drill.year) {
            const idx = elems[0].index
            const m = Number(String(chartLabels[idx]).replace('月', ''))
            setDrill({ mode: 'day', year: drill.year, month: m })
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#666', usePointStyle: true, pointStyle: 'circle', boxWidth: 40, padding: 10 }
          },
          tooltip: {
            callbacks: { label: (c: any) => c.dataset.label + ': ' + fmt(Number(c.raw)) }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grace: 0,
            ticks: { color: '#666', padding: 3, callback: (v: any) => isRate ? v + '%' : 'RM ' + Number(v).toLocaleString('en-MY', { maximumFractionDigits: 0 }) },
            grid: { color: 'rgba(0,0,0,0.1)' }
          },
          x: {
            grid: { display: true, color: 'rgba(0,0,0,0.1)' },
            ticks: { color: '#666', autoSkip: true, maxRotation: 50 }
          }
        }
      }
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartDatasets, chartLabels, drill, chartType])

  function chartTitle(): string {
    const t = chartType === 'netSales' ? '净销售额' : chartType === 'tables' ? '桌子数量' : chartType === 'diners' ? '人数' : '常客(%)'
    return t + '趋势'
  }

  // 钻取返回
  // 钻取返回
  const exitDrill = () => {
    // 逐级回退：day -> month -> year；year 时回到自动粒度
    if (drill.mode === 'day' && drill.year) {
      setDrill({ mode: 'month', year: drill.year })
    } else if (drill.mode === 'month') {
      setDrill({ mode: 'year' })
    } else {
      setDrill({ mode: rangeDays <= 60 ? 'day' : (rangeDays <= 366 ? 'month' : 'year') })
    }
  }
  const drillLabel = drill.mode === 'year' ? '年度视图'
    : drill.mode === 'month' ? (drill.year ? drill.year + ' 年' : '月度视图')
    : (drill.year && drill.month ? drill.year + ' 年 ' + drill.month + ' 月' : '按天')


  // ---------- 日期范围选择 ----------
  const rangeLabel = fmtDisplay(range.start) + ' - ' + fmtDisplay(range.end)
  const selectDate = (d: string) => {
    if (!calSelStart) {
      setCalSelStart(d)
    } else {
      let s = calSelStart, e = d
      if (e < s) { const t = s; s = e; e = t }
      setRange({ start: s, end: e })
      setCalSelStart(null)
      setCalOpen(false)
      setQuickLabel('')
    }
  }
  const calDays = useMemo(() => {
    const { y, m } = calView
    const first = new Date(y, m, 1)
    const startDow = first.getDay()
    const daysIn = new Date(y, m + 1, 0).getDate()
    const cells: (string | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysIn; d++) cells.push(toYMD(new Date(y, m, d)))
    return cells
  }, [calView])
  const changeCalMonth = (delta: number) => {
    setCalView(prev => {
      let m = prev.m + delta
      let y = prev.y
      if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
      return { y, m }
    })
  }
  const inRange = (d: string) => d >= range.start && d <= range.end

  // 月份选择器变更 → 更新日期范围为该月
  const selectMonthValue = (type: 'year' | 'month', v: number) => {
    setMonth(prev => {
      const nm = { ...prev }
      if (type === 'year') nm.year = v; else nm.month = v
      const start = toYMD(new Date(nm.year, nm.month - 1, 1))
      const end = toYMD(new Date(nm.year, nm.month, 0))
      setRange({ start, end })
      setQuickLabel('')
      return nm
    })
    setMonthDrop(null)
  }

  // 快速选择
  const applyQuick = (key: string) => {
    setRange(quickRange(key))
    setQuickLabel(quickLabels[key])
    setQuickOpen(false)
  }

  // 餐厅选择（对齐线上：选择后才加载数据）
  const selectLetter = (l: string) => {
    setLetter(l)
  }

  const selectRestaurant = (r: string) => {
    setRestaurant(r)
    setRestOpen(false)
    // 未加载该餐厅数据时加载
    if (!allData[r]) {
      loadOne(r)
    }
  }

  // 加载餐厅数据（对齐线上：选择后加载；total 合并三店）
  const loadOne = async (r: string) => {
    try {
      if (r === 'total') {
        const [j1, j2, j3] = await Promise.all([
          getKpiReport('j1'), getKpiReport('j2'), getKpiReport('j3')
        ])
        const m1 = toKpiPoints(j1.rows || [])
        const m2 = toKpiPoints(j2.rows || [])
        const m3 = toKpiPoints(j3.rows || [])
        const all = new Map<string, KpiPoint>()
        ;[m1, m2, m3].forEach(arr => {
          arr.forEach(p => {
            const ex = all.get(p.date)
            if (ex) {
              ex.totalSales += p.totalSales; ex.netSales += p.netSales
              ex.diners += p.diners; ex.tablesUsed += p.tablesUsed
              ex.returningCustomers += p.returningCustomers; ex.newCustomers += p.newCustomers
            } else all.set(p.date, { ...p })
          })
        })
        const totalArr = [...all.values()].map(p => {
          const total = p.returningCustomers + p.newCustomers
          return { ...p, avgSalesPerDiner: p.diners > 0 ? p.netSales / p.diners : 0, returningRate: total > 0 ? (p.returningCustomers / total) * 100 : 0 }
        }).sort((a, b) => a.date.localeCompare(b.date))
        setAllData(prev => ({ ...prev, j1: m1, j2: m2, j3: m3, total: totalArr }))
      } else {
        const res = await getKpiReport(r)
        setAllData(prev => ({ ...prev, [r]: toKpiPoints(res.rows || []) }))
      }
    } catch (e) { console.error('KPI 加载失败', r, e) }
  }
  const numbersForLetter = ['1', '2', '3', '总']
  const restName = !restaurant ? '--' : (restaurant === 'total' ? '总' : restaurant.toUpperCase())
  const noRestaurant = !restaurant

  // 报表类型（下拉菜单已直接跳转；保留函数兼容其他调用）
  const switchReport = (kind: string) => {
    if (kind === 'cost') navigate('/cost')
  }

  // 明细表
  const detailRows = useMemo(() => {
    const rows = points.filter(p => {
      if (drill.mode !== 'day' || !drill.year || !drill.month) return true
      const [y, m] = p.date.split('-').map(Number)
      return y === drill.year && m === drill.month
    })
    if (drill.mode === 'month' && drill.year) {
      return rows.filter(p => Number(p.date.split('-')[0]) === drill.year)
    }
    if (drill.mode === 'year') return rows
    return rows
  }, [points, drill])

  const fmtMoney = (v: number) => 'RM ' + v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })


  return (
    <div className="kpi-root">
      <div className="container">
        <div className="header">
          <div>
            <h1>KPI 仪表盘</h1>
          </div>
        </div>

        <div className="date-info" id="date-info" style={{ marginBottom: 16, border: '1px solid #e5e7eb' }}>
          {noRestaurant ? '请先选择餐厅' : rangeLabel}
        </div>

        <div id="app">
          <div className="card" style={{ marginBottom: 'clamp(14px, 1.67vw, 32px)' }}>
            <div className="card-body">
              <div className="date-controls">
                {/* 日期范围 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ margin: 0 }}>日期范围</label>
                  <div className="date-range-picker" id="date-range-picker" onClick={() => setCalOpen(!calOpen)}>
                    <i className="fas fa-calendar-alt"></i>
                    <span id="date-range-display">{rangeLabel}</span>
                  </div>
                  {calOpen && (
                    <div className="calendar-popup" style={{ position: 'absolute', zIndex: 2000, background: '#fff', border: '1px solid #ddd', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', padding: 14, marginTop: 44, width: 320 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => changeCalMonth(-1)}>‹</button>
                        <strong>{calView.y}年{calView.m + 1}月</strong>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => changeCalMonth(1)}>›</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: 11, color: '#999', marginBottom: 6 }}>
                        {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
                        {calDays.map((d, i) => (
                          <div key={i} onClick={() => d && selectDate(d)}
                            style={{
                              padding: '6px 0', borderRadius: 6, cursor: d ? 'pointer' : 'default', fontSize: 12,
                              background: d && d === calSelStart ? '#ff5c00' : (d && inRange(d) ? '#fff0e6' : 'transparent'),
                              color: d && d === calSelStart ? '#fff' : (d && inRange(d) ? '#ff5c00' : (d && (d < range.start || d > range.end) ? '#ccc' : '#333')),
                              fontWeight: d && inRange(d) ? 700 : 400
                            }}>
                            {d ? Number(d.split('-')[2]) : ''}
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setCalOpen(false); setCalSelStart(null) }}>取消</button>
                        <button className="btn btn-primary" style={{ fontSize: 12, background: '#ff5c00', border: 'none', color: '#fff' }} onClick={() => { setCalOpen(false); setCalSelStart(null) }}>确定</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="divider"></div>

                {/* 月份选择器 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="fas fa-calendar" style={{ color: '#000' }}></i>
                    选择年份和月份
                  </label>
                  <div className="enhanced-date-picker month-only" id="month-date-picker">
                    <div className={'date-part' + (monthDrop === 'year' ? ' active' : '')} data-type="year"
                      onClick={() => setMonthDrop(monthDrop === 'year' ? null : 'year')}>
                      <span id="month-year-display">{month.year}</span>
                    </div>
                    <span className="date-separator">年</span>
                    <div className={'date-part' + (monthDrop === 'month' ? ' active' : '')} data-type="month"
                      onClick={() => setMonthDrop(monthDrop === 'month' ? null : 'month')}>
                      <span id="month-month-display">{pad(month.month)}</span>
                    </div>
                    <span className="date-separator">月</span>
                    <div className={'date-dropdown' + (monthDrop ? ' show' : '')} id="month-dropdown">
                      {monthDrop === 'year' && (
                        <div className="year-grid" style={{ padding: 8 }}>
                          {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 6 + i).map(y => (
                            <div key={y} className="date-option" style={{ padding: '6px 0', cursor: 'pointer', borderRadius: 4, background: y === month.year ? '#ff5c00' : 'transparent', color: y === month.year ? '#fff' : '#374151', fontWeight: 600, textAlign: 'center' }}
                              onClick={() => selectMonthValue('year', y)}>{y}</div>
                          ))}
                        </div>
                      )}
                      {monthDrop === 'month' && (
                        <div className="month-grid" style={{ padding: 8 }}>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <div key={m} className="date-option" style={{ padding: '6px 0', cursor: 'pointer', borderRadius: 4, background: m === month.month ? '#ff5c00' : 'transparent', color: m === month.month ? '#fff' : '#374151', fontWeight: 600, textAlign: 'center' }}
                              onClick={() => selectMonthValue('month', m)}>{pad(m)}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 快速选择 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="fas fa-clock" style={{ color: '#000' }}></i>
                    快速选择
                  </label>
                  <div className="dropdown">
                    <button className="btn btn-secondary dropdown-toggle" onClick={() => setQuickOpen(!quickOpen)}>
                      <i className="fas fa-calendar-alt"></i>
                      <span id="quick-select-text">{quickLabel || '时段'}</span>
                      <i className="fas fa-chevron-down"></i>
                    </button>
                    {quickOpen && (
                      <div className="dropdown-menu" id="quick-select-dropdown" style={{ display: 'block', position: 'absolute', zIndex: 1500 }}>
                        {Object.entries(quickLabels).map(([k, v]) => (
                          <button key={k} className="dropdown-item" onClick={() => applyQuick(k)}>{v}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 报表类型 */}
                <div className="report-type-selector">
                  <button className="report-type-btn" onClick={() => setReportOpen(!reportOpen)}>
                    <i className="fas fa-chart-bar"></i>
                    KPI 报表
                    <i className="fas fa-chevron-down"></i>
                  </button>
                  <div className={'report-dropdown-menu' + (reportOpen ? ' show' : '')} id="report-type-dropdown">
                    <Link to="/kpi" className="report-dropdown-item" onClick={() => setReportOpen(false)}>
                      <i className="fas fa-chart-line"></i> KPI 报表
                    </Link>
                    <Link to="/cost" className="report-dropdown-item" onClick={() => setReportOpen(false)}>
                      <i className="fas fa-chart-pie"></i> 成本报表
                    </Link>
                  </div>
                </div>

                {/* 餐厅选择器 */}
                <div className="restaurant-selector">
                  <button className="restaurant-btn dropdown-toggle" onClick={() => { setRestOpen(!restOpen); if (!restOpen) setLetter('') }}>
                    {restName} <i className="fas fa-chevron-down"></i>
                  </button>
                  {restOpen && (
                    <div className="restaurant-dropdown-menu" id="restaurant-dropdown" style={{ display: 'flex', position: 'absolute', zIndex: 1500 }}>
                      <div className="letter-selection">
                        <div className="section-title">选择州属</div>
                        <div className="letter-grid">
                          <button className={'letter-item' + (letter === 'J' ? ' selected' : '')} onClick={() => selectLetter('J')}>J</button>
                        </div>
                      </div>
                      <div className={'number-selection' + (letter ? ' show' : '')} id="number-selection">
                        <div className="section-title">{letter ? '选择' + letter + '分店' : '选择餐厅'}</div>
                        <div className="number-grid">
                          {numbersForLetter.map(n => (
                            <button key={n} className={'number-item' + (n === '总' ? ' total-option' : '') + (restaurant === (n === '总' ? 'total' : letter.toLowerCase() + n) ? ' selected' : '')}
                              onClick={() => selectRestaurant(n === '总' ? 'total' : letter.toLowerCase() + n)}>
                              {n === '总' ? '总' : letter + n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* KPI 卡 */}
          <div className="kpi-grid">
            <div className="card"><div className="card-body"><div className="kpi-card-vertical">
              <div className="icon text-green"><i className="fas fa-dollar-sign"></i></div>
              <div>
                <p className="kpi-label">总销售额 (RM)</p>
                <p className="kpi-value" id="total-sales">{noRestaurant ? '--' : summary.totalSales.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div></div></div>
            <div className="card"><div className="card-body"><div className="kpi-card-vertical">
              <div className="icon text-green"><i className="fas fa-chart-line"></i></div>
              <div>
                <p className="kpi-label">净销售额 (RM)</p>
                <p className="kpi-value" id="net-sales">{noRestaurant ? '--' : summary.netSales.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div></div></div>
            <div className="card"><div className="card-body"><div className="kpi-card-vertical">
              <div className="icon dynamic-color"><img src="/static/images/table.svg" alt="桌子图标" style={{ width: 34, height: 32, filter: 'brightness(0)' }} /></div>
              <div>
                <p className="kpi-label">桌子总数</p>
                <p className="kpi-value" id="total-tables">{noRestaurant ? '--' : summary.tables.toLocaleString('en-MY')}</p>
              </div>
            </div></div></div>
            <div className="card"><div className="card-body"><div className="kpi-card-vertical">
              <div className="icon dynamic-color"><i className="fas fa-users"></i></div>
              <div>
                <p className="kpi-label">顾客总数</p>
                <p className="kpi-value" id="total-diners">{noRestaurant ? '--' : summary.diners.toLocaleString('en-MY')}</p>
              </div>
            </div></div></div>
            <div className="card"><div className="card-body"><div className="kpi-card-vertical">
              <div className="icon dynamic-color"><i className="fas fa-user-check"></i></div>
              <div>
                <p className="kpi-label">常客%</p>
                <p className="kpi-value" id="returning-rate">{noRestaurant ? '--' : summary.returningRate.toFixed(2) + '%'}</p>
              </div>
            </div></div></div>
            <div className="card"><div className="card-body"><div className="kpi-card-vertical">
              <div className="icon dynamic-color"><i className="fas fa-calculator"></i></div>
              <div>
                <p className="kpi-label">人均消费 (RM)</p>
                <p className="kpi-value" id="avg-per-diner">{noRestaurant ? '--' : summary.avgPerDiner.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div></div></div>
          </div>

          {/* 主图表 */}
          <div className="main-chart-container">
            <div className="card" style={{ height: 400 }}>
              <div className="card-body" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'nowrap' }}>
                  <h3 id="main-chart-title" style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>{chartTitle()} · {drillLabel}</h3>
                  <div className="chart-data-buttons" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {[['netSales', '净销售额'], ['tables', '桌子数量'], ['diners', '人数'], ['returningRate', '常客(%)']].map(([k, v]) => (
                      <button key={k} className={'chart-data-btn' + (chartType === k ? ' active' : '')} onClick={() => setChartType(k)}>{v}</button>
                    ))}
                  </div>
                  <div className="date-range-display" id="chart-date-range" style={{ fontSize: 'clamp(8px, 0.74vw, 14px)', color: '#6b7280', fontWeight: 500 }}>
                    {fmtRangeZh(range.start, range.end)}
                  </div>
                </div>
                <div className="chart-container" style={{ flex: 1, position: 'relative' }}>
                  {(drill.mode === 'month' || (drill.mode === 'day' && drill.year)) && (
                    <button className="chart-back-button" id="sales-chart-back" onClick={exitDrill}
                      style={{ position: 'absolute', top: -50, left: 0, zIndex: 10, background: '#583e04', border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#fff', cursor: 'pointer' }}>
                      <i className="fas fa-arrow-left"></i> 返回{drill.mode === 'day' ? '月度' : '年度'}视图
                    </button>
                  )}
                  <canvas id="sales-chart"></canvas>
                </div>
              </div>
            </div>
          </div>

          {/* 明细表 */}
          <div className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 24 }}>详细数据</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" id="dashboard-table">
                <thead>
                  <tr id="table-header">
                    <th style={{ whiteSpace: 'nowrap' }}>{restaurant === 'total' ? '日期 (三店合计)' : '日期'}</th><th>总销售额</th><th>净销售额</th><th>人均消费</th><th>桌子总数</th><th>顾客总数</th><th>新客人数</th><th>常客人数</th><th>常客百分比</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((p, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{p.date}</td>
                      <td>{fmtMoney(p.totalSales)}</td>
                      <td>{fmtMoney(p.netSales)}</td>
                      <td>RM {p.avgSalesPerDiner.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{p.tablesUsed}</td>
                      <td>{p.diners}</td>
                      <td>{p.newCustomers}</td>
                      <td>{p.returningCustomers}</td>
                      <td>{p.returningRate.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {detailRows.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: '#999' }}>{noRestaurant ? '请先选择餐厅' : (loading ? '加载中...' : '暂无数据')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
