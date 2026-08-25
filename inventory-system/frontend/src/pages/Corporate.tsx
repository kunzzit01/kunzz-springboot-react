import { useEffect, useRef, useState } from 'react'
import { getCorporate } from '../api'
import '../styles/corporate.css'

interface OrgNode {
  id: string
  name?: string
  title?: string
  level?: string
  children?: OrgNode[]
}

interface StrategyItem {
  department?: string
  strategy?: string
  dashboardMetrics?: string[]
  pic?: string
  startDate?: string
  endDate?: string
  year?: number
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + day
  } catch {
    return dateStr
  }
}

/** 企业蓝图：与线上 corporate_blueprint.php 结构 1:1（数据来自 Spring API /api/corporate） */
export default function Corporate() {
  const [data, setData] = useState<any>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [detailsHidden, setDetailsHidden] = useState(true)
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getCorporate().then(setData).catch(() => setData({}))
  }, [])

  // 时间线滚动进入视口动画（对应线上 corporate_blueprint.js animateTimeline）
  useEffect(() => {
    if (!timelineRef.current) return
    const wrapper = timelineRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const route = wrapper.querySelector('.map-route-path')
            if (route) {
              setTimeout(() => route.classList.add('animate-in'), 200)
            }
            wrapper.querySelectorAll('.map-milestone').forEach((m, i) => {
              setTimeout(() => m.classList.add('animate-in'), 1000 + i * 200)
            })
            observer.unobserve(wrapper)
          }
        })
      },
      { threshold: 0.3, rootMargin: '0px 0px -100px 0px' }
    )
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [!!data])

  // 评分/解说卡等高对齐（对应 alignScoringSections）
  useEffect(() => {
    if (!data) return
    const align = () => {
      document.querySelectorAll('.culture-explanation-grid').forEach((grid) => {
        const cards = grid.querySelectorAll('.culture-explanation-card')
        if (cards.length === 0) return
        cards.forEach((card) => {
          const content = card.querySelector('.culture-explanation-content')
          if (content) (content as HTMLElement).style.minHeight = 'auto'
        })
        void (grid as HTMLElement).offsetHeight
        let maxHeight = 0
        cards.forEach((card) => {
          const content = card.querySelector('.culture-explanation-content') as HTMLElement | null
          if (content && content.offsetHeight > maxHeight) maxHeight = content.offsetHeight
        })
        cards.forEach((card) => {
          const content = card.querySelector('.culture-explanation-content') as HTMLElement | null
          if (content) content.style.minHeight = maxHeight + 'px'
        })
      })
    }
    align()
    const t = window.setTimeout(align, 300)
    window.addEventListener('resize', onResize)
    function onResize() {
      clearTimeout((onResize as any)._t)
      ;(onResize as any)._t = setTimeout(align, 250)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(t)
    }
  }, [!!data])

  // orgchart 初始化
  useEffect(() => {
    if (!data || !data.organizationStructure || typeof (window as any).jQuery === 'undefined') return
    const $ = (window as any).jQuery
    const el = document.getElementById('orgchart-container')
    if (!el || el.getAttribute('data-inited')) return
    el.setAttribute('data-inited', '1')
    try {
      $(el).orgchart({
        data: data.organizationStructure,
        nodeContent: 'title',
        nodeId: 'id',
        pan: false,
        zoom: false,
        toggleSiblingsResp: true,
        createNode: function ($node: any, d: any) {
          $node.addClass('level-' + (d.level || ''))
          $node.html(
            '<div class="orgchart-node-title">' + (d.title || '—') + '</div>' +
            '<div class="orgchart-node-content">' + (d.name || '—') + '</div>'
          )
        },
        draggable: false,
        direction: 't2b'
      })
      setTimeout(function () {
        const chart = $(el).find('.orgchart')
        if (chart.length) {
          const cw = $(el).width()
          const w = chart.outerWidth()
          if (w < cw) chart.css('margin-left', ((cw - w) / 2) + 'px')
        }
      }, 100)
    } catch (e) {
      console.error('orgchart init failed', e)
    }
  }, [!!data, !!data && !!data.organizationStructure])

  if (!data) {
    return <div className="cb-root"><div className="main-content"><div className="main-container" style={{ padding: 60, textAlign: 'center', color: '#999' }}>加载中...</div></div></div>
  }

  const ov = data.companyOverview || {}
  const core = data.corporateCore || {}
  const timeline: any[] = data.timeline || []
  const cultureExp: any[] = data.cultureExplanation || []
  const valuesExp: any[] = data.valuesExplanation || []
  const strategies: StrategyItem[] = data.strategicObjectives || []
  const orgRoot: OrgNode | null = data.organizationStructure || null

  const selectStrategy = (idx: number) => {
    setActiveIdx(idx)
    setDetailsHidden(true)
    setTimeout(() => setDetailsHidden(false), 300)
  }
  const active = strategies[activeIdx] || {}

  return (
    <div className="cb-root">
      <div className="main-content">
        <div className="main-container">
          <div className="header">
            <h1 className="header-title">企业蓝图</h1>
          </div>

          {/* Header Section - 新设计 */}
          <div className="section">
            <div className="header-panel">
              <div className="floating-orb floating-orb-1" />
              <div className="floating-orb floating-orb-2" />
              <div className="floating-orb floating-orb-3" />
              <div className="floating-orb floating-orb-4" />
              <div className="floating-orb floating-orb-5" />
              <div className="header-logo-container">
                <div className="header-logo">
                  <img src="/static/images/logo.png" alt="KUNZZ HOLDINGS Logo" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const n = e.currentTarget.nextElementSibling as HTMLElement; if (n) n.style.display = 'block' }} />
                  <div className="logo-fallback" style={{ display: 'none' }} />
                </div>
              </div>
              <div className="header-text-content">
                <div className="company-name-large">{ov.companyName || 'KUNZZ HOLDINGS SDN BHD'}</div>
                <div className="company-subtitle">企业蓝图 · 战略计划</div>
              </div>
            </div>
          </div>

          {/* Timeline Section */}
          <div className="section">
            <div className="timeline-container">
              <div className="timeline-header">
                <div className="timeline-main-title">以终为始</div>
              </div>
              <div className="timeline-wrapper" ref={timelineRef}>
                <svg className="map-timeline-svg" viewBox="0 0 600 600" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" style={{ stopColor: 'rgba(255, 92, 0, 0.3)', stopOpacity: 1 }} />
                      <stop offset="50%" style={{ stopColor: '#ff5c00', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: 'rgba(255, 92, 0, 0.3)', stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                  <path className="map-route-glow" d="M 15 300 Q 180 180, 300 300 Q 420 420, 585 300" stroke="url(#routeGradient)" />
                  <path className="map-route-path" d="M 15 300 Q 180 180, 300 300 Q 420 420, 585 300" stroke="#ff5c00" />
                </svg>
                {timeline.map((t: any, i: number) => (
                  <div key={i} className={'map-milestone ' + (t.cls || (i % 2 === 0 ? 'milestone-bottom' : 'milestone-top'))} style={{ left: t.left || undefined, top: t.top || undefined }} data-year={String(t.year || '')}>
                    <div className="milestone-pin" />
                    <div className="milestone-card">
                      <div className="milestone-year">{String(t.year || '')}年</div>
                      <div className="milestone-goal">{String(t.goal || '')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 企业核心 */}
          <div className="section">
            <div className="core-header">
              <div className="core-main-title">企业核心</div>
            </div>
            <div className="core-grid">
              <div className="core-card">
                <div className="core-card-number">01</div>
                <div className="core-card-content-wrapper">
                  <div className="core-card-title">使命:初心&感性的目标</div>
                  <div className="core-card-content">{String(core.mission || '')}</div>
                </div>
              </div>
              <div className="core-card">
                <div className="core-card-number">02</div>
                <div className="core-card-content-wrapper">
                  <div className="core-card-title">愿景:理性可具体化的目标</div>
                  <div className="core-card-content">{String(core.vision || '')}</div>
                </div>
              </div>
              <div className="core-card">
                <div className="core-card-number">03</div>
                <div className="core-card-content-wrapper">
                  <div className="core-card-title">文化:做人的态度</div>
                  <div className="core-card-content">{String(core.culture || '')}</div>
                </div>
              </div>
              <div className="core-card">
                <div className="core-card-number">04</div>
                <div className="core-card-content-wrapper">
                  <div className="core-card-title">价值观:做事的态度</div>
                  <div className="core-card-content">{String(core.values || '')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 文化解说 & 考核 */}
          <div className="section">
            <div className="culture-explanation-header">
              <div className="culture-explanation-title-cn">文化解说&考核</div>
            </div>
            <div className="culture-explanation-grid">
              {cultureExp.map((c: any, i: number) => (
                <div key={i} className="culture-explanation-card">
                  <div className="culture-explanation-content">
                    <div className="culture-explanation-number">{String(i + 1).padStart(2, '0')}</div>
                    <div className="culture-explanation-key">{String(c.key || '')}</div>
                    <div className="culture-explanation-description">{String(c.description || '')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 价值观解说&考核 */}
          <div className="section">
            <div className="values-explanation-header">
              <div className="values-explanation-title-cn">价值观解说&考核</div>
            </div>
            <div className="culture-explanation-grid">
              {valuesExp.map((c: any, i: number) => (
                <div key={i} className="culture-explanation-card">
                  <div className="culture-explanation-content">
                    <div className="culture-explanation-number">{String(i + 1).padStart(2, '0')}</div>
                    <div className="culture-explanation-key">{String(c.key || '')}</div>
                    <div className="culture-explanation-description">{String(c.description || '')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 高层组织架构 */}
          {orgRoot && (
            <div className="section">
              <div className="orgchart-container-wrapper">
                <h1 className="orgchart-title-wrapper">高层组织架构图</h1>
                <div id="orgchart-container" style={{ width: '100%', minHeight: 600 }}>
                  {/* orgchart 由 jquery.orgchart 插件渲染（同线上） */}
                </div>
              </div>
            </div>
          )}

          {/* 最终目标 & 策略 */}
          <div className="strategic-objectives-section">
            <div className="strategic-bg-decor" />
            <div className="strategic-container">
              <header className="strategic-header">
                <div className="strategic-header-content">
                  <div className="strategic-header-left">
                    <div className="strategic-badge">
                      <svg className="strategy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      <span>最终目标</span>
                    </div>
                    <h1 className="strategic-main-title">
                      {String(ov.ultimateGoalYear || '')}年
                      <span className="strategic-year">{String(ov.ultimateGoal || '')}</span>
                    </h1>
                  </div>
                </div>
              </header>

              <main className="strategic-main">
                <div className="strategic-list-wrapper">
                  <h2 className="strategic-list-title">
                    策略 · 检核
                    <span className="strategic-list-count" id="strategicListCount">{String(strategies.length)}</span>
                  </h2>
                  <div className="strategic-list" id="strategicList">
                    {strategies.map((st: StrategyItem, i: number) => (
                      <button key={i} className={'strategy-card' + (i === activeIdx ? ' active' : '')} data-strategy-index={i} onClick={() => selectStrategy(i)}>
                        <div className="strategy-icon-wrapper">
                          <svg className="strategy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </div>
                        <div className="strategy-content">
                          <div className="strategy-meta">
                            <span className="strategy-id">{'S' + (i + 1) + '-' + (st.department || '') + ' • ' + String(st.year || '')}</span>
                            <svg className="strategy-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: i === activeIdx ? 'block' : 'none' }}>
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                          </div>
                          <h3 className="strategy-title">{String(st.strategy || '')}</h3>
                          <p className="strategy-description">{String(st.department || '')}</p>
                        </div>
                        <svg className="strategy-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={'strategic-details' + (detailsHidden ? ' hidden' : '')} id="strategicDetails">
                  <div className="details-header">
                    <svg className="details-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <div>
                      <div className="details-badge" id="detailsBadge">{String(active.department || '')}</div>
                      <h2 className="details-title" id="detailsTitle">{String(active.strategy || '')}</h2>
                    </div>
                  </div>

                  <div className="details-body">
                    <div className="details-section">
                      <h4 className="details-section-title">
                        <svg className="details-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        策略 · 检核
                      </h4>
                      <div className="measure-item">
                        <div className="measure-header">
                          <span className="measure-badge">D1</span>
                          <span className="measure-label">关键指标</span>
                        </div>
                        <ul className="measure-list" id="measureList">
                          {(active.dashboardMetrics || []).map((metric: string, i: number) => (
                            <li key={i} className="measure-list-item">
                              <div className="measure-dot" />
                              <span className="measure-text">{metric}</span>
                            </li>
                          ))}
                          {(active.dashboardMetrics || []).length === 0 && (
                            <li className="measure-list-item"><span className="measure-text">暂无指标</span></li>
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="details-section">
                      <h4 className="details-section-title">
                        <svg className="details-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        行动计划
                      </h4>
                      <div className="execution-plan">
                        <div className="execution-pic">
                          <div className="execution-pic-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          </div>
                          <div className="execution-pic-info">
                            <span className="execution-pic-label">负责人</span>
                            <span className="execution-pic-name" id="picName">{String(active.pic || '—')}</span>
                          </div>
                        </div>
                        <div className="execution-dates">
                          <div className="execution-date-item">
                            <span className="execution-date-label">开始日期</span>
                            <span className="execution-date-value" id="startDate">{formatDate(active.startDate)}</span>
                          </div>
                          <div className="execution-date-item execution-date-divider">
                            <span className="execution-date-label">完成日期</span>
                            <span className="execution-date-value" id="endDate">{formatDate(active.endDate)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
