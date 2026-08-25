import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getKpiReport, getKpiMonthStock, getKpiSupply } from '../api'
import '../styles/cost.css'

interface CostPoint {
  date: string
  sales: number        // finalSales（销售额 + 外卖折半）
  cBeverage: number
  cKitchen: number
  cGrab: number
  cFoodpanda: number
  cShopee: number
  cTotal: number        // 饮料 + 厨房
  grossTotal: number
  costPercent: number
}

// ---------- 日期工具 ----------
const pad = (n: number) => String(n).padStart(2, '0')
const toYMD = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
const fmtDisplay = (d: string) => {
  const [y, m, day] = d.split('-')
  return y + '年' + Number(m) + '月' + Number(day) + '日'
}
const fmtRangeZh = (start: string, end: string) => fmtDisplay(start) + ' 至 ' + fmtDisplay(end)

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

const emptyPoint = (date: string): CostPoint => ({
  date, sales: 0, cBeverage: 0, cKitchen: 0, cGrab: 0, cFoodpanda: 0, cShopee: 0,
  cTotal: 0, grossTotal: 0, costPercent: 0
})

// 从 /api/kpi/report 的 rows 合成成本点（cost 行 + KPI 净销售额作为 sales）
function toCostPoints(rows: any[]): CostPoint[] {
  const costMap = new Map<string, Partial<CostPoint>>()
  const kpiNet = new Map<string, number>()
  ;(rows || []).forEach(r => {
    if (!r.date) return
    const d = String(r.date)
    if (r._type === 'cost') {
      costMap.set(d, {
        cBeverage: Number(r.cBeverage) || 0,
        cKitchen: Number(r.cKitchen) || 0,
        cGrab: Number(r.cGrab) || 0,
        cFoodpanda: Number(r.cFoodpanda) || 0,
        cShopee: Number(r.cShopee) || 0
      })
    }
    if (r._type === 'daily') {
      kpiNet.set(d, (Number(r.grossSales) || 0) - (Number(r.discounts) || 0))
    }
  })
  const allDates = new Set([...costMap.keys(), ...kpiNet.keys()])
  return [...allDates].sort().map(d => {
    const c = costMap.get(d) || {}
    const sales = kpiNet.has(d) ? (kpiNet.get(d) || 0) : (c.sales || 0)
    const cTotal = (c.cBeverage || 0) + (c.cKitchen || 0)
    const finalSales = sales + ((c.cGrab || 0) + (c.cFoodpanda || 0) + (c.cShopee || 0)) / 2
    const grossTotal = finalSales - cTotal
    return {
      date: d,
      sales: finalSales,
      cBeverage: c.cBeverage || 0,
      cKitchen: c.cKitchen || 0,
      cGrab: c.cGrab || 0,
      cFoodpanda: c.cFoodpanda || 0,
      cShopee: c.cShopee || 0,
      cTotal,
      grossTotal,
      costPercent: finalSales > 0 ? (cTotal / finalSales) * 100 : 0
    }
  })
}

// 三店合并（total 模式）
function mergeTotal(m1: CostPoint[], m2: CostPoint[], m3: CostPoint[]): CostPoint[] {
  const map = new Map<string, CostPoint>()
  ;[m1, m2, m3].forEach(arr => {
    arr.forEach(p => {
      const ex = map.get(p.date)
      if (ex) {
        ex.sales += p.sales; ex.cBeverage += p.cBeverage; ex.cKitchen += p.cKitchen
        ex.cGrab += p.cGrab; ex.cFoodpanda += p.cFoodpanda; ex.cShopee += p.cShopee
        ex.cTotal += p.cTotal; ex.grossTotal += p.grossTotal
      } else map.set(p.date, { ...p })
    })
  })
  return [...map.values()].map(p => ({ ...p, costPercent: p.sales > 0 ? (p.cTotal / p.sales) * 100 : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export default function Cost() {
  const [restaurant, setRestaurant] = useState<string | null>(null)
  const [letter, setLetter] = useState('')
  const [range, setRange] = useState<{ start: string; end: string }>(() => quickRange('thisMonth'))
  const [quickLabel, setQuickLabel] = useState('这个月')
  const [month, setMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
  const [costData, setCostData] = useState<Record<string, CostPoint[]>>({})
  const [loading, setLoading] = useState(true)
  const [chartType, setChartType] = useState('totalCost')
  const [calOpen, setCalOpen] = useState(false)
  const [calView, setCalView] = useState<{ y: number; m: number }>({ y: new Date().getFullYear(), m: new Date().getMonth() })
  const [calSelStart, setCalSelStart] = useState<string | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [restOpen, setRestOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [monthDrop, setMonthDrop] = useState<'year' | 'month' | null>(null)
  const [stock, setStock] = useState({ last: 0, current: 0 })
  const [supply, setSupply] = useState({ j2: 0, j3: 0 })
  const chartRef = useRef<any>(null)

  // 加载餐厅成本数据
  const loadOne = async (r: string) => {
    try {
      if (r === 'total') {
        const [j1, j2, j3] = await Promise.all([
          getKpiReport('j1'), getKpiReport('j2'), getKpiReport('j3')
        ])
        const m1 = toCostPoints(j1.rows || [])
        const m2 = toCostPoints(j2.rows || [])
        const m3 = toCostPoints(j3.rows || [])
        setCostData(prev => ({ ...prev, j1: m1, j2: m2, j3: m3, total: mergeTotal(m1, m2, m3) }))
      } else {
        const res = await getKpiReport(r)
        setCostData(prev => ({ ...prev, [r]: toCostPoints(res.rows || []) }))
      }
    } catch (e) { console.error('成本加载失败', r, e) }
    setLoading(false)
  }

  // 库存：结束月 + 上月（cost_month_stock）
  useEffect(() => {
    if (!restaurant || restaurant === 'total') { setStock({ last: 0, current: 0 }); return }
    let live = true
    ;(async () => {
      const end = new Date(range.end)
      const curYM = end.getFullYear() + '-' + pad(end.getMonth() + 1)
      const lastM = new Date(end.getFullYear(), end.getMonth() - 1, 1)
      const lastYM = lastM.getFullYear() + '-' + pad(lastM.getMonth() + 1)
      let cur = 0, last = 0
      try { const r1 = await getKpiMonthStock(restaurant, curYM); cur = Number(r1.current_stock) || 0 } catch { }
      try { const r2 = await getKpiMonthStock(restaurant, lastYM); last = Number(r2.current_stock) || 0 } catch { }
      if (live) setStock({ last, current: cur })
    })()
    return () => { live = false }
  }, [restaurant, range.end])

  // 供应数据（仅 j1）
  useEffect(() => {
    if (restaurant !== 'j1') { setSupply({ j2: 0, j3: 0 }); return }
    let live = true
    getKpiSupply(range.start, range.end).then(r => {
      if (live) setSupply({ j2: Number(r.supply_to_j2) || 0, j3: Number(r.supply_to_j3) || 0 })
    }).catch(() => { })
    return () => { live = false }
  }, [restaurant, range.start, range.end])

  // 当前餐厅按日期范围过滤 + 补全缺失日期（对齐线上 fillMissingDates）
  const points = useMemo(() => {
    const all = costData[restaurant || ''] || []
    if (!restaurant || all.length === 0) return []
    const start = new Date(range.start)
    const end = new Date(range.end)
    if (start > end) return []
    const map = new Map(all.filter(p => p.date >= range.start && p.date <= range.end).map(p => [p.date, p]))
    const filled: CostPoint[] = []
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const key = toYMD(cur)
      filled.push(map.get(key) || emptyPoint(key))
    }
    return filled
  }, [costData, restaurant, range])

  // 汇总（对齐线上前端计算 fallback）
  const summary = useMemo(() => {
    let totalSales = 0, dataTotalCost = 0, totalProfit = 0, grab = 0, fp = 0, shopee = 0
    points.forEach(p => {
      totalSales += p.sales; dataTotalCost += p.cTotal; totalProfit += p.grossTotal
      grab += p.cGrab; fp += p.cFoodpanda; shopee += p.cShopee
    })
    const isJ1 = restaurant === 'j1'
    const actualTotalCost = stock.last - stock.current + dataTotalCost - (isJ1 ? supply.j2 + supply.j3 : 0)
    const avgCostPercent = totalSales > 0 ? (actualTotalCost / totalSales) * 100 : 0
    const finalProfit = totalSales - actualTotalCost
    return {
      totalSales, dataTotalCost, actualTotalCost, avgCostPercent, finalProfit,
      grab, fp, shopee, lastStock: stock.last, currentStock: stock.current,
      days: points.length
    }
  }, [points, stock, supply, restaurant])

  // 日期范围天数
  const rangeDays = useMemo(() => {
    const s1 = new Date(range.start).getTime()
    const e1 = new Date(range.end).getTime()
    return Math.round((e1 - s1) / (1000 * 60 * 60 * 24)) + 1
  }, [range])

  // 按月聚合（>60 天）
  const aggregateByMonth = (data: CostPoint[]) => {
    const map = new Map<string, CostPoint>()
    data.forEach(item => {
      const key = item.date.substring(0, 7)
      const ex = map.get(key)
      if (ex) {
        ex.sales += item.sales; ex.cBeverage += item.cBeverage; ex.cKitchen += item.cKitchen
        ex.cGrab += item.cGrab; ex.cFoodpanda += item.cFoodpanda; ex.cShopee += item.cShopee
        ex.cTotal += item.cTotal; ex.grossTotal += item.grossTotal
      } else map.set(key, { ...item, date: key })
    })
    return [...map.values()].map(item => ({
      ...item,
      costPercent: item.sales > 0 ? (item.cTotal / item.sales) * 100 : 0
    })).sort((a, b) => a.date.localeCompare(b.date))
  }

  const getVal = (p: CostPoint, t: string) =>
    t === 'costPercent' ? p.costPercent : t === 'grossTotal' ? p.grossTotal : t === 'deliveryCost' ? (p.cGrab + p.cFoodpanda + p.cShopee) : p.cTotal

  // 图表数据
  const chartData = useMemo(() => {
    if (!restaurant) return { labels: [], datasets: [] as any[] }
    const fmtRM = (v: number) => 'RM ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtPct = (v: number) => v.toFixed(2) + '%'
    const yFmt = chartType === 'costPercent' ? (v: number) => v.toFixed(2) + '%' : (v: number) => 'RM ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const tooltipFmt = (label: string, v: number) => chartType === 'costPercent' ? label + ': ' + v.toFixed(2) + '%' : label + ': RM ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const grad = (ctx: any, top: string, bottom: string) => {
      const chart = ctx.chart
      const c = chart.ctx
      const area = chart.chartArea
      if (!area) return null
      const g = c.createLinearGradient(0, area.top, 0, area.bottom)
      g.addColorStop(0, top)
      g.addColorStop(1, bottom)
      return g
    }
    const isTotal = restaurant === 'total'
    const colors: Record<string, string> = { j1: '#583e04', j2: '#d97706', j3: '#dc2626' }

    if (isTotal) {
      // 三店对比
      const src: Record<string, CostPoint[]> = {}
      ;['j1', 'j2', 'j3'].forEach(k => {
        let d = (costData[k] || []).filter(p => p.date >= range.start && p.date <= range.end)
        if (rangeDays > 60) d = aggregateByMonth(d)
        src[k] = d
      })
      const dateSet = new Set<string>()
      ;['j1', 'j2', 'j3'].forEach(k => src[k].forEach(p => dateSet.add(p.date)))
      const dates = [...dateSet].sort()
      const labels = rangeDays > 60
        ? dates.map(d => { const [y, m] = d.split('-'); return y + '年' + Number(m) + '月' })
        : dates.map(d => String(new Date(d).getDate()))
      const per: Record<string, (CostPoint | undefined)[]> = {
        j1: dates.map(d => src.j1.find(p => p.date === d)),
        j2: dates.map(d => src.j2.find(p => p.date === d)),
        j3: dates.map(d => src.j3.find(p => p.date === d))
      }
      const empty = () => ({ date: '', sales: 0, cBeverage: 0, cKitchen: 0, cTotal: 0, grossTotal: 0, costPercent: 0, cGrab: 0, cFoodpanda: 0, cShopee: 0 })
      const ds: any[] = []
      if (chartType === 'grossTotal') {
        const totalRaw = dates.map((_, i) => (per.j1[i] || empty()).grossTotal + (per.j2[i] || empty()).grossTotal + (per.j3[i] || empty()).grossTotal)
        ds.push({
          label: '合计盈利', data: totalRaw.map(v => v >= 0 ? v : 0), borderColor: '#22c55e',
          backgroundColor: (c: any) => grad(c, 'rgba(34, 197, 94, 0.4)', 'rgba(34, 197, 94, 0.05)'),
          fill: 'origin', tension: 0.4, cubicInterpolationMode: 'monotone', borderWidth: 2, pointRadius: 0, pointHoverRadius: 8
        })
        ds.push({
          label: '合计亏损', data: totalRaw.map(v => v < 0 ? v : 0), borderColor: '#ef4444',
          backgroundColor: (c: any) => grad(c, 'rgba(239, 68, 68, 0.05)', 'rgba(239, 68, 68, 0.4)'),
          fill: 'origin', tension: 0.4, cubicInterpolationMode: 'monotone', borderWidth: 2, pointRadius: 0, pointHoverRadius: 8
        })
        ;['j1', 'j2', 'j3'].forEach(k => {
          ds.push({
            label: k.toUpperCase() + ' 毛利润', data: dates.map((_, i) => (per[k][i] || empty()).grossTotal),
            borderColor: colors[k], hidden: true,
            backgroundColor: (c: any) => {
              const chart = c.chart
              const { ctx, chartArea, scales } = chart
              if (!chartArea || !scales || !scales.y) return 'transparent'
              const zeroY = scales.y.getPixelForValue(0)
              const top = chartArea.top, bottom = chartArea.bottom
              const zr = Math.min(1, Math.max(0, (zeroY - top) / (bottom - top)))
              const g = ctx.createLinearGradient(0, top, 0, bottom)
              g.addColorStop(0, 'rgba(88, 62, 4, 0.40)')
              g.addColorStop(Math.max(0, zr - 0.001), 'rgba(88, 62, 4, 0.03)')
              g.addColorStop(Math.min(1, zr + 0.001), 'rgba(226, 75, 74, 0.03)')
              g.addColorStop(1, 'rgba(226, 75, 74, 0.55)')
              return g
            },
            fill: 'origin', tension: 0.4, cubicInterpolationMode: 'monotone', borderWidth: 2, pointRadius: 0, pointHoverRadius: 6
          })
        })
      } else if (chartType === 'deliveryCost') {
        ;['j1', 'j2', 'j3'].forEach((k, i) => {
          const cc = [['#00B14F', 'rgba(0, 177, 79, 0.3)'], ['#D70F64', 'rgba(215, 15, 100, 0.3)'], ['#EE4D2D', 'rgba(238, 77, 45, 0.3)']]
          ds.push({
            label: k.toUpperCase() + ' 总外卖成本',
            data: dates.map((_, i2) => (per[k][i2] || empty()).cGrab + (per[k][i2] || empty()).cFoodpanda + (per[k][i2] || empty()).cShopee),
            borderColor: colors[k],
            backgroundColor: (c: any) => grad(c, cc[i][1], cc[i][1].replace('0.3', '0.05')),
            fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 6
          })
        })
      } else {
        ;['j1', 'j2', 'j3'].forEach(k => {
          const typeLabel = chartType === 'totalCost' ? '总成本' : '成本率'
          ds.push({
            label: k.toUpperCase() + ' ' + typeLabel,
            data: dates.map((_, i) => getVal(per[k][i] || empty(), chartType)),
            borderColor: colors[k],
            backgroundColor: (c: any) => grad(c, colors[k] + '4d', colors[k] + '0d'),
            fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 6
          })
        })
      }
      return { labels, datasets: ds, yFmt, tooltipFmt, beginZero: chartType !== 'grossTotal', isRate: chartType === 'costPercent' }
    }

    // 单店
    let d = points
    if (rangeDays > 60) d = aggregateByMonth(d)
    const labels = rangeDays > 60
      ? d.map(p => { const [y, m] = p.date.split('-'); return y + '年' + Number(m) + '月' })
      : d.map(p => String(new Date(p.date).getDate()))
    const ds: any[] = []
    if (chartType === 'grossTotal') {
      const raw = d.map(p => p.grossTotal)
      ds.push({
        label: '盈利', data: raw.map(v => v >= 0 ? v : 0), borderColor: '#22c55e',
        backgroundColor: (c: any) => grad(c, 'rgba(34, 197, 94, 0.4)', 'rgba(34, 197, 94, 0.05)'),
        fill: 'origin', tension: 0.4, cubicInterpolationMode: 'monotone', borderWidth: 2, pointRadius: 0, pointHoverRadius: 8
      })
      ds.push({
        label: '亏损', data: raw.map(v => v < 0 ? v : 0), borderColor: '#ef4444',
        backgroundColor: (c: any) => grad(c, 'rgba(239, 68, 68, 0.05)', 'rgba(239, 68, 68, 0.4)'),
        fill: 'origin', tension: 0.4, cubicInterpolationMode: 'monotone', borderWidth: 2, pointRadius: 0, pointHoverRadius: 8
      })
    } else if (chartType === 'deliveryCost') {
      ;[['Grab 成本', 'cGrab', '#00B14F', 'rgba(0, 177, 79, 0.4)'], ['Foodpanda 成本', 'cFoodpanda', '#D70F64', 'rgba(215, 15, 100, 0.4)'], ['Shopee 成本', 'cShopee', '#EE4D2D', 'rgba(238, 77, 45, 0.4)']].forEach(([label, f, color, top]) => {
        ds.push({
          label, data: d.map(p => (p as any)[f as string] || 0), borderColor: color,
          backgroundColor: (c: any) => grad(c, top as string, (top as string).replace('0.4', '0.02')),
          fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 8
        })
      })
    } else {
      const typeLabel = chartType === 'totalCost' ? '总成本' : '成本率'
      ds.push({
        label: typeLabel, data: d.map(p => getVal(p, chartType)), borderColor: '#583e04',
        backgroundColor: (c: any) => grad(c, 'rgba(88, 62, 4, 0.4)', 'rgba(88, 62, 4, 0.02)'),
        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 8
      })
    }
    return { labels, datasets: ds, yFmt, tooltipFmt, beginZero: chartType !== 'grossTotal', isRate: chartType === 'costPercent' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costData, restaurant, range, rangeDays, chartType, points])

  // 渲染图表
  useEffect(() => {
    if (!restaurant || chartData.labels.length === 0) return
    const w = window as any
    if (!w.Chart) return
    if (chartRef.current) chartRef.current.destroy()
    const ctx = document.getElementById('cost-chart') as HTMLCanvasElement | null
    if (!ctx) return
    chartRef.current = new w.Chart(ctx, {
      type: 'line',
      data: { labels: chartData.labels, datasets: chartData.datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: {
            beginAtZero: chartData.beginZero,
            ticks: {
              color: '#666',
              padding: 3,
              callback: (v: any) => (chartData.yFmt as (v: number) => string)(Number(v))
            },
            grid: { color: 'rgba(0,0,0,0.1)' }
          },
          x: {
            grid: { display: true, color: 'rgba(0,0,0,0.1)' },
            ticks: { color: '#666', autoSkip: true, maxRotation: 50 }
          }
        },
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#666', usePointStyle: true, pointStyle: 'circle', boxWidth: 40, padding: 10 } },
          tooltip: {
            callbacks: {
              label: (c: any) => {
                if (chartType === 'grossTotal') {
                  if ((c.dataset.label === '盈利' || c.dataset.label === '亏损' || c.dataset.label === '合计盈利' || c.dataset.label === '合计亏损') && c.parsed.y === 0) return null
                  const isTotal = restaurant === 'total'
                  if (isTotal && !c.dataset.label.includes('合计')) {
                    return c.dataset.label.replace(' 毛利润', '') + ': RM ' + c.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  }
                  return 'RM ' + c.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                }
                return (chartData.tooltipFmt as (l: string, v: number) => string)(c.dataset.label, Number(c.raw))
              }
            }
          }
        }
      }
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, chartType, restaurant])

  const chartTitle = (() => {
    const titles: Record<string, string> = { totalCost: '总成本趋势', grossTotal: '毛利润趋势', costPercent: '成本率趋势', deliveryCost: '外卖成本趋势' }
    let t = titles[chartType] || '总成本趋势'
    if (restaurant === 'total') t += ' (三店合计)'
    return t
  })()

  // 点击外部关闭下拉
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
  const applyQuick = (key: string) => {
    setRange(quickRange(key))
    setQuickLabel(quickLabels[key])
    setQuickOpen(false)
  }
  const selectLetter = (l: string) => setLetter(l)
  const selectRestaurant = (r: string) => {
    setRestaurant(r)
    setRestOpen(false)
    if (!costData[r]) loadOne(r)
  }
  const numbersForLetter = ['1', '2', '3', '总']
  const restName = !restaurant ? '--' : (restaurant === 'total' ? '总' : restaurant.toUpperCase())
  const noRestaurant = !restaurant

  const fmtMoney = (v: number) => 'RM ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const moneyOrDash = (v: number) => noRestaurant ? '--' : fmtMoney(v)

  const card = (icon: React.ReactNode, label: string, value: string, cls = 'dynamic-color') => (
    <div className="card">
      <div className="card-body">
        <div className="cost-card-vertical">
          <div className={'icon ' + cls}>{icon}</div>
          <div>
            <p className="cost-label">{label}</p>
            <p className="cost-value">{value}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="cost-root">
      <div className="container">
        <div className="header">
          <div>
            <h1>成本分析仪表盘</h1>
          </div>
        </div>

        <div className="date-info" id="date-info" style={{ border: '1px solid #e5e7eb' }}>
          {noRestaurant ? '请先选择餐厅' : ('已选择 ' + summary.days + ' 天的数据 - ' + (restaurant === 'total' ? '三店合计' : restaurant.toUpperCase()))}
        </div>

        <div id="app">
          <div className="card" style={{ marginBottom: 'clamp(14px, 1.67vw, 32px)' }}>
            <div className="card-body">
              <div className="date-controls">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="form-label" style={{ margin: 0 }}>日期范围</label>
                  <div className="date-range-picker" id="date-range-picker" onClick={() => setCalOpen(!calOpen)}>
                    <i className="fas fa-calendar-alt"></i>
                    <span id="date-range-display">{rangeLabel}</span>
                  </div>
                  {calOpen && (
                    <div className="calendar-popup" style={{ marginTop: 44 }}>
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
                        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setCalOpen(false); setCalSelStart(null) }}>确定</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="divider"></div>

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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: 8 }}>
                          {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 6 + i).map(y => (
                            <div key={y} className="date-option" style={{ padding: '6px 0', cursor: 'pointer', borderRadius: 4, background: y === month.year ? '#ff5c00' : 'transparent', color: y === month.year ? '#fff' : '#374151', fontWeight: 600, textAlign: 'center', fontSize: 12 }}
                              onClick={() => selectMonthValue('year', y)}>{y}</div>
                          ))}
                        </div>
                      )}
                      {monthDrop === 'month' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: 8 }}>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <div key={m} className="date-option" style={{ padding: '6px 0', cursor: 'pointer', borderRadius: 4, background: m === month.month ? '#ff5c00' : 'transparent', color: m === month.month ? '#fff' : '#374151', fontWeight: 600, textAlign: 'center', fontSize: 12 }}
                              onClick={() => selectMonthValue('month', m)}>{pad(m)}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

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
                      <div className="dropdown-menu" id="quick-select-dropdown" style={{ display: 'block' }}>
                        {Object.entries(quickLabels).map(([k, v]) => (
                          <button key={k} className="dropdown-item" onClick={() => applyQuick(k)}>{v}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="report-type-selector">
                  <button className="report-type-btn" onClick={() => setReportOpen(!reportOpen)}>
                    <i className="fas fa-chart-pie"></i>
                    成本报表
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

                <div className="restaurant-selector">
                  <button className="restaurant-btn dropdown-toggle" onClick={() => { setRestOpen(!restOpen); if (!restOpen) setLetter('') }}>
                    {restName} <i className="fas fa-chevron-down"></i>
                  </button>
                  {restOpen && (
                    <div className="restaurant-dropdown-menu show" id="restaurant-dropdown" style={{ position: 'absolute', zIndex: 1500 }}>
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

          {/* 成本指标卡 */}
          <div className="cost-grid" id="cost-grid">
            {card(<i className="fas fa-dollar-sign"></i>, '销售额 (RM)', moneyOrDash(summary.totalSales), 'text-green')}
            {card(<i className="fas fa-chart-pie"></i>, '总成本 (RM)', moneyOrDash(summary.actualTotalCost), 'text-green')}
            {card(<i className="fas fa-money-bill-wave"></i>, '毛利润 (RM)', moneyOrDash(summary.finalProfit))}
            {card(<i className="fas fa-percentage"></i>, '成本率', noRestaurant ? '--' : summary.avgCostPercent.toFixed(2) + '%')}
            {card(<i className="fas fa-box"></i>, '库存（最后）', moneyOrDash(summary.lastStock))}
            {card(<i className="fas fa-warehouse"></i>, '库存（现在）', moneyOrDash(summary.currentStock))}
            {restaurant === 'j1' && (
              <div className="card supply-card visible">
                <div className="card-body">
                  <div className="cost-card-vertical">
                    <div className="icon dynamic-color"><i className="fas fa-arrow-right"></i></div>
                    <div>
                      <p className="cost-label">供应→J2 (RM)</p>
                      <p className="cost-value">{moneyOrDash(supply.j2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {restaurant === 'j1' && (
              <div className="card supply-card visible">
                <div className="card-body">
                  <div className="cost-card-vertical">
                    <div className="icon dynamic-color"><i className="fas fa-arrow-right"></i></div>
                    <div>
                      <p className="cost-label">供应→J3 (RM)</p>
                      <p className="cost-value">{moneyOrDash(supply.j3)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {card(<i className="fas fa-shuttle-van"></i>, 'Grab Food 成本 (RM)', moneyOrDash(summary.grab))}
            {card(<i className="fas fa-shopping-bag"></i>, 'Foodpanda 成本 (RM)', moneyOrDash(summary.fp))}
            {card(<i className="fas fa-shopping-bag"></i>, 'Shopee Food 成本 (RM)', moneyOrDash(summary.shopee))}
          </div>

          {/* 主图表 */}
          <div className="main-chart-container">
            <div className="card" style={{ height: 400 }}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="chart-header">
                  <h3 id="main-chart-title">{chartTitle}</h3>
                  <div className="chart-data-buttons">
                    {[['totalCost', '总成本'], ['grossTotal', '毛利润'], ['costPercent', '成本率'], ['deliveryCost', '外卖成本']].map(([k, v]) => (
                      <button key={k} className={'chart-data-btn' + (chartType === k ? ' active' : '')} data-type={k} onClick={() => setChartType(k)}>{v}</button>
                    ))}
                  </div>
                  <div className="date-range-display" id="chart-date-range">{fmtRangeZh(range.start, range.end)}</div>
                </div>
                <div className="chart-container" style={{ flex: 1, position: 'relative', minHeight: 320 }}>
                  <canvas id="cost-chart"></canvas>
                </div>
              </div>
            </div>
          </div>

          {/* 明细表 */}
          <div className="card detail-card">
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 24 }}>详细数据</h3>
            </div>
            <div className="table-scroll">
              <table className="table" id="dashboard-table">
                <thead>
                  <tr id="table-header">
                    <th>{restaurant === 'total' ? '日期 (三店合计)' : '日期'}</th>
                    <th>销售额</th>
                    <th>饮料成本</th>
                    <th>厨房成本</th>
                    <th>Grab Food</th>
                    <th>Foodpanda</th>
                    <th>Shopee Food</th>
                    <th>总成本</th>
                    <th>毛利润</th>
                    <th>成本率 (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={i}>
                      <td>{p.date}</td>
                      <td>{fmtMoney(p.sales)}</td>
                      <td>{fmtMoney(p.cBeverage)}</td>
                      <td>{fmtMoney(p.cKitchen)}</td>
                      <td>{fmtMoney(p.cGrab)}</td>
                      <td>{fmtMoney(p.cFoodpanda)}</td>
                      <td>{fmtMoney(p.cShopee)}</td>
                      <td>{fmtMoney(p.cTotal)}</td>
                      <td>{fmtMoney(p.grossTotal)}</td>
                      <td>{p.costPercent.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {points.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: '#999' }}>{noRestaurant ? '请先选择餐厅' : (loading ? '加载中...' : '暂无数据')}</td></tr>
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
