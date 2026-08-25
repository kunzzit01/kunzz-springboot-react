import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { message, Modal, notification, Select, Button } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import zh from 'flatpickr/dist/l10n/zh'
import { getApplicationsPaged, getJobs, updateApplication } from '../api'
import type { JobApplication, JobPosition } from '../types'
import '../styles/hire.css'

const STATUS_CONFIG = [
  { val: 0, label: '待处理', icon: '🔴', cls: 'badge-red' },
  { val: 1, label: '沟通中', icon: '🟡', cls: 'badge-yellow' },
  { val: 2, label: '已录用', icon: '🟢', cls: 'badge-green' },
  { val: 3, label: '已淘汰', icon: '⚪', cls: 'badge-gray' },
]
const PAGE_SIZE = 20
const RAW_PAGE_SIZE = 5000 // 全量拉取（对齐线上 loadRawData page_size=2000）

function resolveFileUrl(url?: string) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  // 老库存的是相对路径（如 uploads/resumes/xxx.pdf），按站内解析
  return window.location.origin + '/' + url.replace(/^\/+/, '')
}

function statusMeta(v?: number) {
  return STATUS_CONFIG.find((s) => s.val === Number(v)) || STATUS_CONFIG[3]
}
function fmtCreated(createdAt?: string) {
  const s = String(createdAt || '')
  return s.replace('T', ' ').substring(0, 19)
}

/** flatpickr 中文日期区间选择（对齐线上 date-input：单输入框 + 日历图标 + fixed 弹层） */
function DateRangeFlatpickr({ value, onChange }: { value: [Dayjs, Dayjs] | null; onChange: (v: [Dayjs, Dayjs] | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fpRef = useRef<flatpickr.Instance | null>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const fp = flatpickr(el, {
      mode: 'range',
      dateFormat: 'Y年m月d日',
      locale: zh.zh,
      appendTo: document.body,
      static: false,
      closeOnSelect: true,
      onOpen: (_, __, instance) => {
        requestAnimationFrame(() => {
          const cal = instance.calendarContainer
          const rect = el.getBoundingClientRect()
          cal.style.position = 'fixed'
          cal.style.top = rect.bottom + 4 + 'px'
          cal.style.left = rect.left + 'px'
          cal.style.width = rect.width + 'px'
          cal.style.zIndex = '99999'
          cal.style.margin = '0'
        })
      },
      onChange: (selectedDates) => {
        if (selectedDates.length === 2) onChange([dayjs(selectedDates[0]), dayjs(selectedDates[1])])
        else if (selectedDates.length === 0) onChange(null)
      },
    })
    fpRef.current = fp
    // 点击日历和输入框之外的空白区域时关闭
    const closeHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const cal = fp.calendarContainer
      if (!fp.isOpen) return
      if (cal && !cal.contains(target) && target !== el && !el.parentElement?.contains(target)) {
        fp.close()
      }
    }
    document.addEventListener('click', closeHandler)
    return () => { document.removeEventListener('click', closeHandler); fp.destroy(); fpRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部 value 变化 → 同步输入框与 flatpickr 内部状态
  useEffect(() => {
    const el = inputRef.current
    const fp = fpRef.current
    if (!el) return
    if (value) {
      el.value = value[0].format('YYYY年M月D日') + ' 至 ' + value[1].format('YYYY年M月D日')
      fp?.setDate([value[0].toDate(), value[1].toDate()], false)
    } else {
      el.value = ''
      fp?.clear()
    }
  }, [value])

  return (
    <div className="date-input-wrapper">
      <svg className="date-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <input ref={inputRef} type="text" className="form-control date-input" placeholder="选择提交日期" readOnly />
    </div>
  )
}

/** 招聘列表：对齐线上 hire.html（筛选 chips + 智能搜索 + 日期区间 + 状态流转 + 详情弹窗 + 导出 CSV） */
export default function Jobs() {
  // 数据
  const [allData, setAllData] = useState<JobApplication[]>([]) // 当前页
  const [rawData, setRawData] = useState<JobApplication[]>([]) // 全量（chip 计数）
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<JobPosition[]>([])
  const [initialNotified, setInitialNotified] = useState(false)

  // 筛选状态
  const [keyword, setKeyword] = useState('')
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const [company, setCompany] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [status, setStatus] = useState<number | ''>('')
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [dateLabel, setDateLabel] = useState('')
  const [page, setPage] = useState(1)

  // UI
  const [suggestions, setSuggestions] = useState<JobApplication[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [popover, setPopover] = useState<{ app: JobApplication; x: number; y: number } | null>(null)
  const [modalApp, setModalApp] = useState<JobApplication | null>(null)
  const [modalStatus, setModalStatus] = useState(0)
  const [modalRemarks, setModalRemarks] = useState('')

  const searchRef = useRef<HTMLInputElement>(null)

  // 移动端抽屉：打开时锁定页面滚动（对齐线上 toggleDrawer）
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  // 初始：拉职位（chips 数据源）+ 全量申请（计数）+ 第一页
  useEffect(() => {
    getJobs().then(setJobs).catch(() => {})
    getApplicationsPaged({ page: 1, pageSize: RAW_PAGE_SIZE })
      .then((res) => {
        setRawData(res.list)
        if (!initialNotified) {
          const pending = res.list.filter((r) => String(r.status) === '0').length
          if (pending > 0) {
            notification.open({
              message: '有待审批的招聘申请',
              description: `共有 ${pending} 位申请人待处理，请及时审批。`,
              placement: 'topRight',
            })
          }
          setInitialNotified(true)
        }
      })
      .catch(() => {})
  }, [initialNotified])

  // 拉当前页
  // 状态 popover：点击外部 / 滚动关闭（对齐线上全局点击与 scroll 监听）
  useEffect(() => {
    const close = () => setPopover(null)
    document.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])

  // 智能搜索：点击外部且输入为空时折叠（对齐线上 collapseSearch 逻辑）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const wrapper = document.querySelector('.smart-search-wrapper')
      const sugg = document.querySelector('.search-suggestions')
      if (wrapper && wrapper.contains(t)) return
      if (sugg && sugg.contains(t)) return
      setShowSuggestions(false)
      if (!searchRef.current?.value) setSearchExpanded(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // 时段菜单：点击外部关闭（对齐线上 btnQuick/quickMenu 全局点击逻辑）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const menu = document.querySelector('.quick-select-menu')
      const btn = document.querySelector('.btn-quick-select')
      if (menu && menu.contains(t)) return
      if (btn && (btn === t || btn.contains(t))) return
      setQuickMenuOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // 徽章点击：再点同一徽章关闭，否则打开（对齐线上 showGlobalPopover toggle）
  const togglePopover = (app: JobApplication, e: React.MouseEvent) => {
    e.stopPropagation()
    if (popover && popover.app.id === app.id) { setPopover(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover({ app, x: rect.left + rect.width / 2 - 60, y: rect.bottom + 4 })
  }

  const fetchData = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await getApplicationsPaged({
          keyword: keyword || undefined,
          company: company || undefined,
          jobTitle: jobTitle || undefined,
          status: status === '' ? undefined : status,
          dateStart: dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined,
          dateEnd: dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined,
          page: p,
          pageSize: PAGE_SIZE,
        })
        setAllData(res.list)
        setTotal(res.total)
        setTotalPages(res.totalPages)
        setPage(p)
      } catch { /* 拦截器已提示 */ } finally {
        setLoading(false)
      }
    },
    [keyword, company, jobTitle, status, dateRange],
  )

  // 筛选变化 → 回第 1 页
  useEffect(() => {
    fetchData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, company, jobTitle, status, dateRange])

  // 智能搜索建议：客户端匹配当前页
  const updateSuggestions = (kw: string) => {
    if (!kw) { setSuggestions([]); setShowSuggestions(false); return }
    const matches = allData
      .filter((a) =>
        (a.chineseName || '').toLowerCase().includes(kw.toLowerCase()) ||
        (a.englishName || '').toLowerCase().includes(kw.toLowerCase()) ||
        (a.email || '').toLowerCase().includes(kw.toLowerCase()) ||
        (a.phoneNumber || '').includes(kw),
      )
      .slice(0, 3)
    setSuggestions(matches)
    setShowSuggestions(true)
  }

  // ---- chips 数据源（来自 job_positions，动态对齐） ----
  const companyList = useMemo(() => {
    const set = new Set<string>()
    for (const j of jobs) if (j.companyCategory) set.add(j.companyCategory)
    return [...set]
  }, [jobs])

  const jobTitleList = useMemo(() => {
    // 只取中文职位（对齐线上静态公司-职位表，去掉 en 语言重复项）
    const zhJobs = jobs.filter((j) => !j.language || j.language === 'zh')
    if (company) {
      const set = new Set(zhJobs.filter((j) => j.companyCategory === company).map((j) => j.jobTitle).filter(Boolean))
      return [...set]
    }
    const set = new Set<string>()
    for (const j of zhJobs) if (j.jobTitle) set.add(j.jobTitle)
    return [...set]
  }, [jobs, company])

  // chip 计数（rawData 全量）
  const countCompany = (c: string) => rawData.filter((r) => r.companyName === c).length
  const countStatus = (v: number | '') => {
    const base = rawData.filter((r) => {
      if (company && r.companyName !== company) return false
      if (jobTitle && r.jobTitle !== jobTitle) return false
      return true
    })
    return v === '' ? base.length : base.filter((r) => String(r.status) === String(v)).length
  }
  const countJob = (j: string) => {
    const base = company ? rawData.filter((r) => r.companyName === company) : rawData
    return base.filter((r) => r.jobTitle === j).length
  }

  // ---- 操作 ----
  const applyCompany = (c: string) => {
    if (c === company) { setCompany(''); setJobTitle('') } else { setCompany(c); setJobTitle('') }
  }
  const applyJob = (j: string) => setJobTitle(j === jobTitle ? '' : j)
  const applyStatus = (v: number | '') => setStatus(v === status ? '' : v)

  const removeFilter = (type: 'keyword' | 'company' | 'jobTitle' | 'status' | 'date') => {
    if (type === 'keyword') { setKeyword(''); if (searchRef.current) searchRef.current.value = ''; setShowSuggestions(false) }
    else if (type === 'date') { setDateRange(null); setDateLabel('') }
    else if (type === 'company') { setCompany(''); setJobTitle('') }
    else if (type === 'jobTitle') setJobTitle('')
    else setStatus('')
  }
  const resetAll = () => {
    setKeyword(''); setCompany(''); setJobTitle(''); setStatus(''); setDateRange(null); setDateLabel('')
    setShowSuggestions(false)
    if (searchRef.current) searchRef.current.value = ''
  }

  const setQuickDate = (type: string, label: string) => {
    if (type === 'all') { setDateRange(null); setDateLabel(''); return }
    const now = dayjs().startOf('day')
    let start = now, end = now
    switch (type) {
      case 'today': break
      case 'yesterday': start = now.subtract(1, 'day'); end = start; break
      case 'thisWeek': start = now.startOf('week').add(1, 'day'); break // 周一开始
      case 'lastWeek': end = now.startOf('week'); start = end.subtract(6, 'day'); break
      case 'thisMonth': start = now.startOf('month'); break
    }
    setDateRange([start, end])
    setDateLabel(label)
    setQuickMenuOpen(false)
  }

  // 状态更新（popover 快速改）
  const changeStatus = async (app: JobApplication, newStatus: number) => {
    setPopover(null)
    try {
      await updateApplication(app.id, { status: newStatus })
      setRawData((prev) => prev.map((r) => (r.id === app.id ? { ...r, status: newStatus } : r)))
      fetchData(1)
    } catch { /* 拦截器已提示 */ }
  }

  // 详情弹窗保存
  const saveModal = async () => {
    if (saving) return
    if (!modalApp) return
    setSaving(true)
    try {
      await updateApplication(modalApp.id, { status: modalStatus, hrRemarks: modalRemarks })
      message.success('保存成功')
      setRawData((prev) => prev.map((r) => (r.id === modalApp.id ? { ...r, status: modalStatus, hrRemarks: modalRemarks } : r)))
      setModalApp(null)
      fetchData(1)
    } catch { /* 拦截器已提示 */ }
    finally { setSaving(false) }
  }

  // 导出 Excel（UTF-8 BOM CSV）
  const exportExcel = () => {
    if (!allData.length) { message.warning('没有可导出的数据'); return }
    const headers = ['序号', '中文姓名', '英文姓名', '性别', '申请公司', '申请职位', '邮箱', '电话区号', '电话号码', '简历链接', '状态', 'HR备注', '申请时间']
    const rows = allData.map((r, i) => [
      i + 1, r.chineseName || '', r.englishName || '', r.gender || '',
      r.companyName || '', r.jobTitle || '', r.email || '',
      r.phoneCode || '', r.phoneNumber || '',
      r.resumeFileUrl || '', statusMeta(r.status).label, r.hrRemarks || '', fmtCreated(r.createdAt),
    ])
    const esc = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[",\n\r]/.test(s) ? '"' + s + '"' : s
    }
    const csv = [headers, ...rows].map((row) => row.map(esc).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = dayjs().format('YYYYMMDD')
    a.href = url
    a.download = '招聘申请列表_' + ts + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ---- 渲染 helpers ----
  const Chip = ({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: ReactNode }) => (
    <button className={'chip' + (active ? ' active' : '')} onClick={onClick}>
      {children}
      <span className="chip-count">{count}</span>
    </button>
  )

  const activeFilters = (
    <>
      {keyword && <span className="active-tag">关键词: {keyword}<span className="active-tag-close" onClick={() => removeFilter('keyword')}>&times;</span></span>}
      {company && <span className="active-tag">公司: {company}<span className="active-tag-close" onClick={() => removeFilter('company')}>&times;</span></span>}
      {jobTitle && <span className="active-tag">职位: {jobTitle}<span className="active-tag-close" onClick={() => removeFilter('jobTitle')}>&times;</span></span>}
      {status !== '' && <span className="active-tag">状态: {statusMeta(status).label}<span className="active-tag-close" onClick={() => removeFilter('status')}>&times;</span></span>}
      {dateRange && <span className="active-tag">日期: {dateLabel || dateRange[0].format('YYYY-MM-DD') + ' 至 ' + dateRange[1].format('YYYY-MM-DD')}<span className="active-tag-close" onClick={() => removeFilter('date')}>&times;</span></span>}
    </>
  )
  const hasActive = !!(keyword || company || jobTitle || status !== '' || dateRange)

  const filterContent = (
    <div className="filter-content">
      <div className="filter-row">
        <div className="filter-label">申请公司</div>
        <div className="chip-list">
          <Chip active={company === ''} count={rawData.length} onClick={() => setCompany('')}>🏢 全部</Chip>
          {companyList.map((c) => (
            <Chip key={c} active={company === c} count={countCompany(c)} onClick={() => applyCompany(c)}>{c}</Chip>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <div className="filter-label">申请职位</div>
        <div className="chip-list">
          <Chip active={jobTitle === ''} count={company ? rawData.filter((r) => r.companyName === company).length : rawData.length} onClick={() => setJobTitle('')}>全部</Chip>
          {jobTitleList.map((j) => (
            <Chip key={j} active={jobTitle === j} count={countJob(j)} onClick={() => applyJob(j)}>{j}</Chip>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <div className="filter-label">处理状态</div>
        <div className="chip-list">
          <Chip active={status === ''} count={countStatus('')} onClick={() => applyStatus('')}>📊 全部</Chip>
          {STATUS_CONFIG.map((s) => (
            <Chip key={s.val} active={status === s.val} count={countStatus(s.val)} onClick={() => applyStatus(s.val)}>{s.icon} {s.label}</Chip>
          ))}
        </div>
      </div>
      <div className="search-date-row">
        <div style={{ position: 'relative', flex: 1, minWidth: 280, maxWidth: 420 }}>
      <div className={'smart-search-wrapper' + (searchExpanded ? ' expanded' : '')} onClick={(e) => { if (!searchExpanded) { e.stopPropagation(); setSearchExpanded(true); setTimeout(() => searchRef.current?.focus(), 200) } }}>
            <span className="smart-search-icon">
              <svg className="icon-18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              ref={searchRef}
              type="text"
              className="smart-search-input"
              placeholder="搜索姓名 / 邮箱 / 手机号"
              defaultValue=""
              onChange={(e) => { const v = e.target.value.trim(); setKeyword(v); updateSuggestions(v) }}
              onFocus={() => { setSearchExpanded(true); if (keyword) setShowSuggestions(true) }}
              onBlur={() => { if (!keyword) { setShowSuggestions(false) } }}
            />
          </div>
          <div className={'search-suggestions' + (showSuggestions ? ' show' : '')}>
            <div className="suggest-header">🔍 快速建议匹配</div>
            {suggestions.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#9ca3af' }}>无精准匹配，按 Enter 直接搜索</div>
            ) : (
              suggestions.map((m) => (
                <a
                  key={m.id}
                  href="#"
                  className="suggest-item"
                  onClick={(e) => {
                    e.preventDefault()
                    setKeyword(m.chineseName || m.englishName || '')
                    if (searchRef.current) searchRef.current.value = m.chineseName || m.englishName || ''
                    setShowSuggestions(false)
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{m.chineseName}</span>{' '}
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>({m.phoneCode ? m.phoneCode + ' ' : ''}{m.phoneNumber})</span>
                </a>
              ))
            )}
          </div>
        </div>
        <div className="filter-date-wrap">
          <DateRangeFlatpickr
            value={dateRange}
            onChange={(v) => {
              setDateRange(v)
              setDateLabel(v ? v[0].format('YYYY-MM-DD') + ' 至 ' + v[1].format('YYYY-MM-DD') : '')
            }}
          />
          <div className="quick-select-wrapper">
            <button className="btn btn-default btn-quick-select" onClick={() => setQuickMenuOpen(!quickMenuOpen)}>
              {dateLabel || '时段'}<svg className="icon-sm icon-margin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={'quick-select-menu' + (quickMenuOpen ? ' show' : '')}>
              <a href="#" onClick={(e) => { e.preventDefault(); setQuickDate('today', '今天') }}>今天</a>
              <a href="#" onClick={(e) => { e.preventDefault(); setQuickDate('yesterday', '昨天') }}>昨天</a>
              <div className="menu-divider" />
              <a href="#" onClick={(e) => { e.preventDefault(); setQuickDate('thisWeek', '本周') }}>本周</a>
              <a href="#" onClick={(e) => { e.preventDefault(); setQuickDate('lastWeek', '上周') }}>上周</a>
              <div className="menu-divider" />
              <a href="#" onClick={(e) => { e.preventDefault(); setQuickDate('thisMonth', '这个月') }}>这个月</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="hr-root">
      <div className="layout-container">
        <header className="header">
          <h1>招聘申请列表</h1>
          <div className="flex-row gap-10">
            <button className="btn btn-default mobile-filter-btn" onClick={() => setDrawerOpen(true)}>
              <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              筛选条件
            </button>
            <button className="btn btn-primary btn-export text-14" onClick={exportExcel}>⬇ 导出 Excel</button>
          </div>
        </header>

        {/* 筛选区 */}
        <div className={'filter-bar-container' + (drawerOpen ? ' drawer-open' : '')}>
          <div className="drawer-header">
            <h3>高级筛选</h3>
            <button className="drawer-close" onClick={() => setDrawerOpen(false)}>&times;</button>
          </div>
          {filterContent}
          <div className="active-filters-bar" style={hasActive ? { display: 'flex' } : { display: 'none' }}>
            <span className="text-12 text-muted font-bold">已选条件：</span>
            <div className="flex-row items-center gap-8 flex-wrap" style={{ flex: 1 }}>{activeFilters}</div>
            <button className="btn-link-action text-12" onClick={resetAll}>清空全部</button>
          </div>
        </div>

        {/* 移动端抽屉遮罩 */}
        <div className={'drawer-overlay-filter' + (drawerOpen ? ' show' : '')} onClick={() => setDrawerOpen(false)} />

        {/* 表格 */}
        <div className="content-card">
          <div className="table-container">
            <table className={'data-table' + (loading ? ' loading' : '')}>
              <thead>
                <tr>
                  <th>应聘者</th>
                  <th>所属公司</th>
                  <th>申请职位</th>
                  <th>联系方式</th>
                  <th>简历附件</th>
                  <th>申请时间</th>
                  <th>状态</th>
                  <th className="text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading && allData.length === 0 && (
                  <tr><td colSpan={8} className="empty-state">数据加载中…</td></tr>
                )}
                {!loading && allData.length === 0 && (
                  <tr><td colSpan={8} className="empty-state">没有找到匹配的记录</td></tr>
                )}
                {allData.map((app) => {
                  const st = statusMeta(app.status)
                  const created = fmtCreated(app.createdAt)
                  const [datePart, timePart] = created.split(' ')
                  const phone = app.phoneCode ? `${app.phoneCode} ${app.phoneNumber}` : (app.phoneNumber || '')
                  return (
                    <tr key={app.id} className="table-row">
                      <td>
                        <div>
                          <div className="font-bold text-main text-14">{app.chineseName || ''} ({app.englishName || ''})</div>
                          <div className="text-muted text-12 mt-4">{app.gender || ''}</div>
                        </div>
                      </td>
                      <td><span className="company-badge">{app.companyName || ''}</span></td>
                      <td className="font-medium text-primary">{app.jobTitle || ''}</td>
                      <td>
                        <div className="text-14 text-main mb-4 cell-ellipsis">✉️ {app.email || ''}</div>
                        <div className="text-12 text-muted cell-ellipsis">📞 {phone}</div>
                      </td>
                      <td>
                        {app.resumeFileUrl ? (
                          <button className="btn-link" onClick={() => window.open(resolveFileUrl(app.resumeFileUrl), '_blank')}>
                            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            预览 PDF
                          </button>
                        ) : (
                          <button className="btn-link" style={{ opacity: 0.4, pointerEvents: 'none' }}>无附件</button>
                        )}
                      </td>
                      <td>
                        <div className="text-14 text-main mb-4 cell-ellipsis">{datePart}</div>
                        <div className="text-12 text-muted">{timePart}</div>
                      </td>
                      <td className="status-cell">
                        <div className="status-wrapper">
                          <span
                            className={'badge ' + st.cls}
                            title="点击修改状态"
                            onClick={(e) => togglePopover(app, e)}
                          >
                            {st.label}
                          </span>
                        </div>
                      </td>
                      <td className="text-center">
                        <button
                          className="btn-link-action btn-action-detail"
                          onClick={() => { setModalApp(app); setModalStatus(Number(app.status ?? 0)); setModalRemarks(app.hrRemarks || '') }}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <footer className="pagination-bar">
            <span className="text-muted text-14">共计 {allData.length} 条记录</span>
            <div className="page-controls" style={{ display: totalPages <= 1 ? 'none' : 'flex' }}>
              <button className="btn-page" disabled={page <= 1} style={page <= 1 ? { opacity: 0.4 } : {}} onClick={() => fetchData(page - 1)}>上一页</button>
              <span className="current-page">{page}</span>
              <button className="btn-page" disabled={page >= totalPages} style={page >= totalPages ? { opacity: 0.4 } : {}} onClick={() => fetchData(page + 1)}>下一页</button>
            </div>
          </footer>
        </div>
      </div>

      {/* 状态快速修改 Popover */}
      <div
        className={'status-popover' + (popover ? ' show' : '')}
        style={popover ? { top: popover.y, left: popover.x } : {}}
        onClick={(e) => e.stopPropagation()}
      >
        {STATUS_CONFIG.map((s) => (
          <button
            key={s.val}
            className={'status-option' + (popover?.app.status === s.val ? ' active' : '')}
            onClick={() => popover && changeStatus(popover.app, s.val)}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* 详情弹窗（对齐线上两栏布局：信息区 + HR处理区） */}
      <Modal
        open={!!modalApp}
        title="应聘者详情档案"
        onCancel={() => setModalApp(null)}
        width={900}
        footer={[
          <Button key="c" onClick={() => setModalApp(null)}>取消关闭</Button>,
          <Button key="s" type="primary" style={{ background: '#ff7b00', fontWeight: 'bold' }} onClick={saveModal} loading={saving} disabled={saving}>保存更新</Button>,
        ]}
      >
        {modalApp && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <div className="hr-section-title">基础申请信息</div>
              <div className="hr-modal-grid">
                <span className="hr-modal-label">申请公司：</span><span className="font-bold">{modalApp.companyName || ''}</span>
                <span className="hr-modal-label">申请职位：</span><span className="font-bold text-primary">{modalApp.jobTitle || ''}</span>
                <span className="hr-modal-label">提交时间：</span><span>{fmtCreated(modalApp.createdAt)}</span>
              </div>
              <div className="hr-section-title mt-24">个人联系资料</div>
              <div className="hr-modal-grid">
                <span className="hr-modal-label">中文姓名：</span><span className="font-bold">{modalApp.chineseName || ''}</span>
                <span className="hr-modal-label">英文姓名：</span><span className="font-bold">{modalApp.englishName || ''}</span>
                <span className="hr-modal-label">性别：</span><span className="font-normal">{modalApp.gender || ''}</span>
                <span className="hr-modal-label">电子邮箱：</span><span><a href={'mailto:' + modalApp.email} className="font-bold hr-modal-link">{modalApp.email || ''}</a></span>
                <span className="hr-modal-label">电话号码：</span><span className="font-bold">{modalApp.phoneCode ? modalApp.phoneCode + ' ' : ''}{modalApp.phoneNumber || ''}</span>
                <span className="hr-modal-label items-center flex-row">简历附件：</span>
                <span>
                  {modalApp.resumeFileUrl ? (
                    <button className="hr-resume-btn" onClick={() => window.open(resolveFileUrl(modalApp.resumeFileUrl), '_blank')}>📄 下载/预览简历</button>
                  ) : (
                    <span className="hr-resume-btn disabled">无简历附件</span>
                  )}
                </span>
              </div>
            </div>
            <div className="hr-action-section">
              <div className="hr-section-title">HR 处理进度跟进</div>
              <div className="mb-8">
                <label className="hr-modal-label mb-8">修改当前状态：</label>
                <Select
                  className="hr-modal-select"
                  style={{ width: '100%' }}
                  value={modalStatus}
                  onChange={setModalStatus}
                  options={STATUS_CONFIG.map((s) => ({ value: s.val, label: `${s.icon} ${s.label}` }))}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="hr-modal-label mt-24">内部备注 (仅 HR 可见)：</label>
                <textarea
                  className="form-control"
                  rows={7}
                  style={{ width: '100%', minWidth: '100%', resize: 'vertical', height: 'auto' }}
                  placeholder="在此记录面试情况、期望薪资、背景调查结果等..."
                  value={modalRemarks}
                  onChange={(e) => setModalRemarks(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
