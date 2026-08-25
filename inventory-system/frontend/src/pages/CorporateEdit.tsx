import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCorporate, saveCorporate } from '../api'
import '../styles/corporate-edit.css'

/**
 * 企业蓝图编辑（对齐线上 corporate_blueprint_edit.php：8 个 Tab + 固定保存按钮）
 * 数据存 backend/data/corporate_strategy.json（GET/PUT /api/corporate）
 */
const TABS = [
  ['overview', '公司概述'], ['timeline', '时间线'], ['corporate-core', '企业核心'],
  ['culture-explanation', '文化解说'], ['values-explanation', '价值观解说'],
  ['org-structure', '高层组织架构'], ['internal-org', '内部组织架构'], ['strategic-objectives', '战略目标'],
]

interface Scoring { point: number; description: string }
interface Explanation { key: string; description: string; scoring: Scoring[] }
interface CLvl { name: string; title: string; fullTitle: string; reportsTo: string }
interface DeptPos { title: string; name: string }
interface Dept { name: string; positions: DeptPos[] }
interface Objective { department: string; strategy: string; dashboardMetrics: string[]; pic: string; startDate: string; endDate: string }

const emptyScoring = () => [1, 2, 3, 4, 5].map((p) => ({ point: p, description: '' }))

export default function CorporateEdit() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // section 草稿
  const [ov, setOv] = useState({ companyName: '', planTitle: '', strategyStartYear: '', strategyEndYear: '', ultimateGoal: '' })
  const [timeline, setTimeline] = useState<{ year: string; goal: string }[]>([])
  const [core, setCore] = useState({ mission: '', vision: '', culture: [''] as string[], values: [''] as string[] })
  const [cultureExp, setCultureExp] = useState<Explanation[]>([])
  const [valuesExp, setValuesExp] = useState<Explanation[]>([])
  const [org, setOrg] = useState({ ceo: { name: '', title: 'CEO' }, pa: { name: '', title: 'PA' }, cLevel: [] as CLvl[] })
  const [depts, setDepts] = useState<Dept[]>([])
  const [strategies, setStrategies] = useState<Record<string, Objective[]>>({})

  const load = useCallback(() => {
    setLoading(true)
    getCorporate().then((d: any) => {
      const ovd = d.companyOverview || {}
      setOv({
        companyName: ovd.companyName || '', planTitle: ovd.planTitle || '',
        strategyStartYear: String(ovd.strategyStartYear ?? new Date().getFullYear()),
        strategyEndYear: String(ovd.strategyEndYear ?? new Date().getFullYear() + 5),
        ultimateGoal: ovd.ultimateGoal || '',
      })
      setTimeline((d.timeline || []).map((t: any) => ({ year: String(t.year ?? ''), goal: String(t.goal ?? '') })))
      const c = d.corporateCore || {}
      setCore({ mission: c.mission || '', vision: c.vision || '', culture: (c.culture && c.culture.length ? c.culture : ['']).map(String), values: (c.values && c.values.length ? c.values : ['']).map(String) })
      const normExp = (list: any[]): Explanation[] => (list && list.length ? list.map((e: any) => ({
        key: String(e.key || ''), description: String(e.description || ''),
        scoring: (e.scoring && e.scoring.length ? e.scoring : emptyScoring()).map((s: any) => ({ point: Number(s.point ?? 1), description: String(s.description || '') })),
      })) : [{ key: '', description: '', scoring: emptyScoring() }])
      setCultureExp(normExp(d.cultureExplanation))
      setValuesExp(normExp(d.valuesExplanation))
      const o = d.organizationStructure || {}
      setOrg({
        ceo: { name: o.ceo?.name || '', title: o.ceo?.title || 'CEO' },
        pa: { name: o.pa?.name || '', title: o.pa?.title || 'PA' },
        cLevel: (o.cLevel || []).map((c: any) => ({ name: String(c.name || ''), title: String(c.title || ''), fullTitle: String(c.fullTitle || ''), reportsTo: String(c.reportsTo || 'CEO') })),
      })
      setDepts((d.internalOrganization?.departments || []).map((dep: any) => ({
        name: String(dep.name || ''),
        positions: (dep.positions && dep.positions.length ? dep.positions : [{ title: '', name: '' }]).map((p: any) => ({ title: String(p.title || ''), name: String(p.name || '') })),
      })))
      const so = d.strategicObjectives || {}
      const soOut: Record<string, Objective[]> = {}
      Object.keys(so).forEach((y) => {
        soOut[y] = (so[y] || []).map((o: any) => ({
          department: String(o.department || ''), strategy: String(o.strategy || ''),
          dashboardMetrics: Array.isArray(o.dashboardMetrics) ? o.dashboardMetrics.map(String) : [],
          pic: String(o.pic || ''), startDate: String(o.startDate || ''), endDate: String(o.endDate || ''),
        }))
      })
      setStrategies(soOut)
    }).catch(() => { }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    setAlert(null)
    const data: any = {
      companyOverview: {
        companyName: ov.companyName, planTitle: ov.planTitle,
        strategyStartYear: parseInt(ov.strategyStartYear) || new Date().getFullYear(),
        strategyEndYear: parseInt(ov.strategyEndYear) || new Date().getFullYear() + 5,
        ultimateGoal: ov.ultimateGoal,
      },
      timeline: timeline.filter((t) => t.year || t.goal).map((t) => ({ year: parseInt(t.year) || 0, goal: t.goal })),
      corporateCore: {
        mission: core.mission, vision: core.vision,
        culture: core.culture.map((s) => s.trim()).filter(Boolean),
        values: core.values.map((s) => s.trim()).filter(Boolean),
      },
      cultureExplanation: cultureExp.filter((e) => e.key || e.description).map((e) => ({
        key: e.key, description: e.description,
        scoring: e.scoring.filter((s) => s.description).map((s) => ({ point: s.point, description: s.description })),
      })),
      valuesExplanation: valuesExp.filter((e) => e.key || e.description).map((e) => ({
        key: e.key, description: e.description,
        scoring: e.scoring.filter((s) => s.description).map((s) => ({ point: s.point, description: s.description })),
      })),
      organizationStructure: {
        ceo: { name: org.ceo.name, title: org.ceo.title || 'CEO' },
        pa: { name: org.pa.name, title: org.pa.title || 'PA' },
        cLevel: org.cLevel.filter((c) => c.name || c.title),
      },
      internalOrganization: {
        departments: depts.filter((d) => d.name).map((d) => ({
          name: d.name,
          positions: d.positions.filter((p) => p.title).map((p) => ({ title: p.title, name: p.name })),
        })),
      },
      strategicObjectives: {},
    }
    Object.keys(strategies).forEach((y) => {
      const objs = strategies[y].filter((o) => o.department || o.strategy)
      if (objs.length) data.strategicObjectives[y] = objs.map((o) => ({
        department: o.department, strategy: o.strategy, dashboardMetrics: o.dashboardMetrics.map((m) => m.trim()).filter(Boolean),
        pic: o.pic, startDate: o.startDate, endDate: o.endDate,
      }))
    })
    try {
      await saveCorporate(data)
      setAlert({ type: 'success', msg: '数据保存成功！' })
    } catch { /* 拦截器已提示 */ } finally {
      setSaving(false)
    }
  }

  const upd = (setter: (v: any) => void, path: string, value: any, arr: any, arrSet: (v: any) => void) => { }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>加载中...</div>
  }

  return (
    <div>
      <div className="header page-upload-header">
        <h1 className="page-upload-title">企业蓝图管理</h1>
        <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>编辑企业蓝图数据和咨询信息</p>
      </div>

      <div className="page-breadcrumb">
        <a onClick={() => navigate('/')}>仪表板</a> &gt;
        <a onClick={() => navigate('/corporate')}>企业蓝图</a> &gt;
        <span>企业蓝图管理</span>
      </div>

      <div className="content">
        {alert && <div className={'alert alert-' + alert.type}>{alert.msg}</div>}

        <div className="tab-navigation">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" className={'tab-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {/* ---------- 公司概述 ---------- */}
        {tab === 'overview' && (
          <div className="section tab-section active">
            <h2>公司概述</h2>
            <div className="form-group"><label>公司名称</label><input type="text" value={ov.companyName} onChange={(e) => setOv({ ...ov, companyName: e.target.value })} /></div>
            <div className="form-group"><label>计划标题</label><input type="text" value={ov.planTitle} onChange={(e) => setOv({ ...ov, planTitle: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label>战略开始年份</label><input type="number" value={ov.strategyStartYear} onChange={(e) => setOv({ ...ov, strategyStartYear: e.target.value })} /></div>
              <div className="form-group"><label>战略结束年份</label><input type="number" value={ov.strategyEndYear} onChange={(e) => setOv({ ...ov, strategyEndYear: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>终极目标</label><textarea value={ov.ultimateGoal} onChange={(e) => setOv({ ...ov, ultimateGoal: e.target.value })} /></div>
          </div>
        )}

        {/* ---------- 时间线 ---------- */}
        {tab === 'timeline' && (
          <div className="section tab-section active">
            <h2>时间线</h2>
            <div id="timeline-container">
              {timeline.map((item, i) => (
                <div className="timeline-item" key={i}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>年份</label>
                    <input type="number" value={item.year} placeholder="2024" onChange={(e) => setTimeline(prev => prev.map((x, xi) => xi === i ? { ...x, year: e.target.value } : x))} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>目标</label>
                    <input type="text" value={item.goal} placeholder="创建X间子公司" onChange={(e) => setTimeline(prev => prev.map((x, xi) => xi === i ? { ...x, goal: e.target.value } : x))} /></div>
                  <button type="button" className="remove-btn" onClick={() => setTimeline(prev => prev.filter((_, xi) => xi !== i))}>删除</button>
                </div>
              ))}
            </div>
            <button type="button" className="add-btn" onClick={() => setTimeline(prev => [...prev, { year: '', goal: '' }])}>添加时间线项目</button>
          </div>
        )}

        {/* ---------- 企业核心 ---------- */}
        {tab === 'corporate-core' && (
          <div className="section tab-section active">
            <h2>企业核心</h2>
            <div className="form-group"><label>使命 (Mission)</label><textarea rows={3} value={core.mission} onChange={(e) => setCore({ ...core, mission: e.target.value })} /></div>
            <div className="form-group"><label>愿景 (Vision)</label><textarea rows={3} value={core.vision} onChange={(e) => setCore({ ...core, vision: e.target.value })} /></div>
            <div className="sub-section">
              <h3>文化 (Culture)</h3>
              {core.culture.map((c, i) => (
                <div className="culture-item" key={i}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>文化项</label>
                    <input type="text" value={c} placeholder="例如：Innovation" onChange={(e) => setCore(prev => ({ ...prev, culture: prev.culture.map((x, xi) => xi === i ? e.target.value : x) }))} /></div>
                  <button type="button" className="remove-btn" onClick={() => setCore(prev => ({ ...prev, culture: prev.culture.filter((_, xi) => xi !== i) }))}>删除</button>
                </div>
              ))}
              <button type="button" className="add-btn" onClick={() => setCore(prev => ({ ...prev, culture: [...prev.culture, ''] }))}>添加文化项</button>
            </div>
            <div className="sub-section">
              <h3>价值观 (Values)</h3>
              {core.values.map((c, i) => (
                <div className="culture-item" key={i}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>价值观</label>
                    <input type="text" value={c} placeholder="例如：Customer First" onChange={(e) => setCore(prev => ({ ...prev, values: prev.values.map((x, xi) => xi === i ? e.target.value : x) }))} /></div>
                  <button type="button" className="remove-btn" onClick={() => setCore(prev => ({ ...prev, values: prev.values.filter((_, xi) => xi !== i) }))}>删除</button>
                </div>
              ))}
              <button type="button" className="add-btn" onClick={() => setCore(prev => ({ ...prev, values: [...prev.values, ''] }))}>添加价值观</button>
            </div>
          </div>
        )}

        {/* ---------- 文化解说 / 价值观解说 ---------- */}
        {tab === 'culture-explanation' && (
          <ExplanationTab title="文化解说 & 考核" list={cultureExp} setList={setCultureExp} placeholderKey="例如：积极向上" />
        )}
        {tab === 'values-explanation' && (
          <ExplanationTab title="价值观解说 & 考核" list={valuesExp} setList={setValuesExp} placeholderKey="例如：目标导向" />
        )}

        {/* ---------- 高层组织架构 ---------- */}
        {tab === 'org-structure' && (
          <div className="section tab-section active">
            <h2>高层组织架构</h2>
            <div className="sub-section">
              <h3>CEO</h3>
              <div className="form-row">
                <div className="form-group"><label>姓名</label><input type="text" value={org.ceo.name} onChange={(e) => setOrg({ ...org, ceo: { ...org.ceo, name: e.target.value } })} /></div>
                <div className="form-group"><label>职位</label><input type="text" value={org.ceo.title} onChange={(e) => setOrg({ ...org, ceo: { ...org.ceo, title: e.target.value } })} /></div>
              </div>
            </div>
            <div className="sub-section">
              <h3>PA (个人助理)</h3>
              <div className="form-row">
                <div className="form-group"><label>姓名</label><input type="text" value={org.pa.name} onChange={(e) => setOrg({ ...org, pa: { ...org.pa, name: e.target.value } })} /></div>
                <div className="form-group"><label>职位</label><input type="text" value={org.pa.title} onChange={(e) => setOrg({ ...org, pa: { ...org.pa, title: e.target.value } })} /></div>
              </div>
            </div>
            <div className="sub-section">
              <h3>C-Level 高管</h3>
              {org.cLevel.map((c, i) => (
                <div className="clevel-item" key={i}>
                  <div className="form-row">
                    <div className="form-group"><label>姓名</label><input type="text" value={c.name} onChange={(e) => setOrg(prev => ({ ...prev, cLevel: prev.cLevel.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x) }))} /></div>
                    <div className="form-group"><label>职位</label><input type="text" value={c.title} onChange={(e) => setOrg(prev => ({ ...prev, cLevel: prev.cLevel.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) }))} /></div>
                  </div>
                  <div className="form-group"><label>完整职位名称</label><input type="text" value={c.fullTitle} onChange={(e) => setOrg(prev => ({ ...prev, cLevel: prev.cLevel.map((x, xi) => xi === i ? { ...x, fullTitle: e.target.value } : x) }))} /></div>
                  <div className="form-group"><label>汇报对象</label><input type="text" value={c.reportsTo} onChange={(e) => setOrg(prev => ({ ...prev, cLevel: prev.cLevel.map((x, xi) => xi === i ? { ...x, reportsTo: e.target.value } : x) }))} /></div>
                  <button type="button" className="remove-btn" onClick={() => setOrg(prev => ({ ...prev, cLevel: prev.cLevel.filter((_, xi) => xi !== i) }))}>删除</button>
                </div>
              ))}
              <button type="button" className="add-btn" onClick={() => setOrg(prev => ({ ...prev, cLevel: [...prev.cLevel, { name: '', title: '', fullTitle: '', reportsTo: 'CEO' }] }))}>添加 C-Level 高管</button>
            </div>
          </div>
        )}

        {/* ---------- 内部组织架构 ---------- */}
        {tab === 'internal-org' && (
          <div className="section tab-section active">
            <h2>内部组织架构</h2>
            {depts.map((dep, di) => (
              <div className="department-item" key={di}>
                <div className="form-group"><label>部门名称</label>
                  <input type="text" value={dep.name} onChange={(e) => setDepts(prev => prev.map((x, xi) => xi === di ? { ...x, name: e.target.value } : x))} /></div>
                <div className="positions-container">
                  <h3>职位列表</h3>
                  {dep.positions.map((pos, pi) => (
                    <div className="position-item" key={pi}>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>职位</label>
                        <input type="text" value={pos.title} placeholder="职位名称" onChange={(e) => setDepts(prev => prev.map((x, xi) => xi === di ? { ...x, positions: x.positions.map((p, pi2) => pi2 === pi ? { ...p, title: e.target.value } : p) } : x))} /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>姓名</label>
                        <input type="text" value={pos.name} placeholder="人员姓名" onChange={(e) => setDepts(prev => prev.map((x, xi) => xi === di ? { ...x, positions: x.positions.map((p, pi2) => pi2 === pi ? { ...p, name: e.target.value } : p) } : x))} /></div>
                      <button type="button" className="remove-btn" onClick={() => setDepts(prev => prev.map((x, xi) => xi === di ? { ...x, positions: x.positions.filter((_, pi2) => pi2 !== pi) } : x))}>删除</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="add-btn" onClick={() => setDepts(prev => prev.map((x, xi) => xi === di ? { ...x, positions: [...x.positions, { title: '', name: '' }] } : x))}>添加职位</button>
                <button type="button" className="remove-btn" style={{ marginLeft: 10 }} onClick={() => setDepts(prev => prev.filter((_, xi) => xi !== di))}>删除部门</button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={() => setDepts(prev => [...prev, { name: '', positions: [{ title: '', name: '' }] }])}>添加部门</button>
          </div>
        )}

        {/* ---------- 战略目标 ---------- */}
        {tab === 'strategic-objectives' && (
          <div className="section tab-section active">
            <h2>战略目标</h2>
            {Object.keys(strategies).sort().map((year) => (
              <div className="year-objectives" key={year}>
                <h3>{year}年</h3>
                {strategies[year].map((obj, oi) => (
                  <div className="objective-item" key={oi}>
                    <div className="form-row">
                      <div className="form-group"><label>部门</label>
                        <input type="text" value={obj.department} placeholder="例如：Technology" onChange={(e) => setStrategies(prev => ({ ...prev, [year]: prev[year].map((x, xi) => xi === oi ? { ...x, department: e.target.value } : x) }))} /></div>
                      <div className="form-group"><label>负责人 (PIC)</label>
                        <input type="text" value={obj.pic} placeholder="例如：CTO" onChange={(e) => setStrategies(prev => ({ ...prev, [year]: prev[year].map((x, xi) => xi === oi ? { ...x, pic: e.target.value } : x) }))} /></div>
                    </div>
                    <div className="form-group"><label>策略</label>
                      <textarea rows={2} value={obj.strategy} onChange={(e) => setStrategies(prev => ({ ...prev, [year]: prev[year].map((x, xi) => xi === oi ? { ...x, strategy: e.target.value } : x) }))} /></div>
                    <div className="form-row">
                      <div className="form-group"><label>开始日期</label>
                        <input type="date" value={obj.startDate} onChange={(e) => setStrategies(prev => ({ ...prev, [year]: prev[year].map((x, xi) => xi === oi ? { ...x, startDate: e.target.value } : x) }))} /></div>
                      <div className="form-group"><label>结束日期</label>
                        <input type="date" value={obj.endDate} onChange={(e) => setStrategies(prev => ({ ...prev, [year]: prev[year].map((x, xi) => xi === oi ? { ...x, endDate: e.target.value } : x) }))} /></div>
                    </div>
                    <div className="form-group"><label>仪表板指标 (每行一个)</label>
                      <textarea rows={3} value={obj.dashboardMetrics.join('\n')} placeholder={'System Uptime (%)\nInfrastructure Cost Reduction (%)\nImplementation Timeline Adherence (%)'}
                        onChange={(e) => setStrategies(prev => ({ ...prev, [year]: prev[year].map((x, xi) => xi === oi ? { ...x, dashboardMetrics: e.target.value.split('\n') } : x) }))} />
                      <small style={{ color: '#666' }}>每行一个指标</small>
                    </div>
                    <button type="button" className="remove-btn" onClick={() => setStrategies(prev => ({ ...prev, [year]: prev[year].filter((_, xi) => xi !== oi) }))}>删除</button>
                  </div>
                ))}
                <button type="button" className="add-btn" onClick={() => setStrategies(prev => ({ ...prev, [year]: [...prev[year], { department: '', strategy: '', dashboardMetrics: [], pic: '', startDate: '', endDate: '' }] }))}>添加{year}年目标</button>
                <button type="button" className="remove-btn" style={{ marginLeft: 10 }} onClick={() => setStrategies(prev => { const n = { ...prev }; delete n[year]; return n })}>删除{year}年</button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={() => { const y = String(new Date().getFullYear()); setStrategies(prev => ({ ...prev, [y]: [...(prev[y] || []), { department: '', strategy: '', dashboardMetrics: [], pic: '', startDate: '', endDate: '' }] })) }}>添加年份</button>
          </div>
        )}

        {/* 固定操作按钮 */}
        <div className="fixed-actions">
          <button className="btn" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存更改'}</button>
          <a className="btn btn-secondary" onClick={() => navigate('/corporate')}>返回查看</a>
        </div>
      </div>
    </div>
  )
}

/** 文化/价值观解说 tab（共用结构） */
function ExplanationTab({ title, list, setList, placeholderKey }: {
  title: string; list: Explanation[]; setList: (v: Explanation[]) => void; placeholderKey: string
}) {
  return (
    <div className="section tab-section active">
      <h2>{title}</h2>
      {list.map((exp, i) => (
        <div className="explanation-item" key={i}>
          <div className="form-group"><label>关键词 (Key)</label>
            <input type="text" value={exp.key} placeholder={placeholderKey} onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, key: e.target.value } : x))} /></div>
          <div className="form-group"><label>描述 (Description)</label>
            <textarea rows={4} value={exp.description} onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))} /></div>
          <div className="form-group"><label>评分标准</label>
            {exp.scoring.map((s, si) => (
              <div className="scoring-row" key={si}>
                <label style={{ margin: 0, fontWeight: 600 }}>{s.point}分:</label>
                <input type="text" value={s.description} placeholder="评分描述"
                  onChange={(e) => setList(list.map((x, xi) => xi === i ? { ...x, scoring: x.scoring.map((sc, sci) => sci === si ? { ...sc, description: e.target.value } : sc) } : x))} />
              </div>
            ))}
          </div>
          <button type="button" className="remove-btn" onClick={() => setList(list.filter((_, xi) => xi !== i))}>删除</button>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={() => setList([...list, { key: '', description: '', scoring: emptyScoring() }])}>添加解说</button>
    </div>
  )
}
