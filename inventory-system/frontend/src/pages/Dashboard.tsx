import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardSummary } from '../api'
import type { DashboardSummary } from '../types'

const links = [
  { to: '/records', icon: 'fa-boxes-stacked', label: '总库存' },
  { to: '/inout', icon: 'fa-right-left', label: '进出货' },
  { to: '/staff', icon: 'fa-users', label: '职员管理' },
  { to: '/kpi', icon: 'fa-chart-line', label: 'KPI 报表' },
  { to: '/schedule', icon: 'fa-calendar-days', label: '员工排班' },
  { to: '/dishware', icon: 'fa-utensils', label: '碗碟管理' },
  { to: '/hire', icon: 'fa-briefcase', label: '招聘列表' },
  { to: '/menu', icon: 'fa-book-open', label: '菜单管理' },
]

export default function Dashboard() {
  const [s, setS] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    getDashboardSummary().then(setS).catch(() => {})
  }, [])

  const stats = [
    { label: '库存台账记录', value: s?.totalStockRecords ?? 0, suffix: '条' },
    { label: '今日入库', value: s?.todayInCount ?? 0, suffix: '笔' },
    { label: '今日出库', value: s?.todayOutCount ?? 0, suffix: '笔' },
    { label: '低库存预警', value: s?.lowStockCount ?? 0, suffix: '项' },
    { label: '餐具总数', value: s?.dishwareCount ?? 0, suffix: '件' },
    { label: '分店在管品项', value: (s?.j1ProductCount ?? 0) + (s?.j2ProductCount ?? 0) + (s?.j3ProductCount ?? 0), suffix: '项' },
  ]

  return (
    <div>
      <div className="kz-page-title">
        <span>KUNZZ HOLDINGS</span>
        <span className="sub">管理系统 · 老库直连</span>
      </div>

      <div className="stat-grid">
        {stats.map((st) => (
          <div className="stat-card" key={st.label}>
            <div className="stat-label">{st.label}</div>
            <div className="stat-value">{st.value}<span style={{ fontSize: 13, color: '#999', marginLeft: 4 }}>{st.suffix}</span></div>
          </div>
        ))}
      </div>

      <div className="kz-card">
        <div className="kz-card-title"><span>快捷入口</span></div>
        <div className="quick-grid">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="quick-item">
              <i className={'fas ' + l.icon + ' qi-icon'} />
              <span className="qi-label">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="kz-card">
        <div className="kz-card-title">
          <span>低库存预警</span>
          <span className="sub">{s?.lowStockList.length ?? 0} 项</span>
        </div>
        {/* 8/24 修复：各系统独立检测（按产品名汇总库存，不跨系统加总） */}
        {['central', 'j1', 'j2', 'j3'].map((sys) => {
          const list = (s?.lowStockList ?? []).filter((r) => r.system === sys)
          if (list.length === 0) return null
          return (
            <div key={sys} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#583e04', margin: '6px 0 8px' }}>
                {sys === 'central' ? '中央' : sys.toUpperCase()} ({list.length} 项)
              </div>
              <table className="kz-table">
                <thead>
                  <tr><th>产品名称</th><th className="num">最低库存</th><th className="num">当前总库存</th></tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr className="low-row" key={sys + '-' + r.productName}>
                      <td>{r.productName}</td>
                      <td className="num">{Number(r.minimumQuantity).toFixed(2)}</td>
                      <td className="num">{Number(r.currentQty || 0).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
        {(!s?.lowStockList || s.lowStockList.length === 0) && (
          <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无低库存预警</div>
        )}
      </div>
    </div>
  )
}
