import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { getMe, getMyPermissions, getPendingCount } from '../api'
import type { Permissions, UserInfo } from '../types'
import RealtimeStatus from '../utils/RealtimeStatus'
import '../styles/sidebar.css'

interface LinkItem { label: string; path: string }
interface ExpandItem { label: string; options: LinkItem[] }
interface MenuChild {
  label: string
  path?: string
  panel?: string
  links?: LinkItem[]
  expandables?: ExpandItem[]
  /** 二级权限 key（对齐旧系统 submenu_permissions）；缺省 = 跟随一级组权限不过滤 */
  perm?: string
}
interface MenuSection { id: string; icon: string; label: string; children: MenuChild[] }

const ICONS: Record<string, string> = {
  '网页照片上传.svg': '/static/images/网页照片上传.svg',
  '运营分析与报表.svg': '/static/images/运营分析与报表.svg',
  '人事与资源管理.svg': '/static/images/人事与资源管理.svg',
  '资源库管理.svg': '/static/images/资源库管理.svg',
}

const MENU: MenuSection[] = [
  {
    id: 'brand-items',
    icon: '网页照片上传.svg',
    label: '集团架构',
    children: [
      { label: 'KUNZZ HOLDINGS SDN BHD', panel: 'KUNZZ HOLDINGS SDN BHD', links: [{ label: '企业蓝图', path: '/corporate' }], perm: 'kunzz_holdings' },
      {
        label: 'TOKYO JAPANESE CUISINE SDN BHD', panel: 'TOKYO JAPANESE CUISINE SDN BHD', perm: 'tokyo_cuisine',
        expandables: [
          { label: 'J1 (MIDVALLEY)', options: [
            { label: '员工排班表', path: '/schedule?restaurant=J1' },
            { label: '员工手机记录', path: '/phone?restaurant=J1' },
          ]},
          { label: 'J2 (PARADIGM MALL)', options: [
            { label: '员工排班表', path: '/schedule?restaurant=J2' },
            { label: '员工手机记录', path: '/phone?restaurant=J2' },
          ]},
        ],
      },
      {
        label: 'TOKYO IZAKAYA SDN BHD', panel: 'TOKYO IZAKAYA SDN BHD', perm: 'tokyo_izakaya',
        expandables: [
          { label: 'J3 (DESA TEBRAU)', options: [
            { label: '员工排班表', path: '/schedule?restaurant=J3' },
            { label: '员工手机记录', path: '/phone?restaurant=J3' },
          ]},
        ],
      },
    ],
  },
  {
    id: 'analytics-items',
    icon: '运营分析与报表.svg',
    label: '营收数据',
    children: [
      { label: 'KPI报表', path: '/kpi', perm: 'kpi_report' },
      { label: '数据上传', path: '/kpi/upload', perm: 'kpi_upload' },
    ],
  },
  {
    id: 'hr-items',
    icon: '人事与资源管理.svg',
    label: '人事管理',
    children: [
      { label: '职员管理', path: '/staff', perm: 'staff_management' },
      { label: '问卷回答', path: '/qna' },
      { label: '考核表单', path: '/evaluation' },
      { label: '招聘列表', path: '/hire' },
    ],
  },
  {
    id: 'resource-items',
    icon: '资源库管理.svg',
    label: '资源总库',
    children: [
      { label: '库存', path: '/records', perm: 'stock_inventory' },
      { label: '碗碟', path: '/dishware', perm: 'dishware' },
      { label: '价格对比', path: '/price', perm: 'price_comparison' },
    ],
  },
  {
    id: 'photoupload-items',
    icon: '网页照片上传.svg',
    label: '视觉管理',
    children: [
      { label: '背景音乐', path: '/media/music' },
      { label: '首页', panel: '首页', links: [{ label: '第一页', path: '/media/homepage1' }] },
      { label: '关于我们', panel: '关于我们', links: [
        { label: '第一页', path: '/media/about1' },
        { label: '第四页', path: '/media/about4' },
      ]},
      { label: '加入我们', panel: '加入我们', links: [
        { label: '第一页', path: '/media/join1' }, { label: '第二页', path: '/media/join2' }, { label: '第三页（职位）', path: '/media/join3' },
      ]},
      { label: '企业蓝图管理', path: '/corporate/edit' },
    ],
  },
]

function groupOf(pathname: string): string {
  if (pathname.startsWith('/corporate') || pathname.startsWith('/schedule') || pathname.startsWith('/phone')) return 'brand-items'
  if (pathname.startsWith('/kpi')) return 'analytics-items'
  if (pathname.startsWith('/staff') || pathname.startsWith('/qna') || pathname.startsWith('/evaluation') || pathname.startsWith('/hire')) return 'hr-items'
  if (pathname.startsWith('/records') || pathname.startsWith('/remark') || pathname.startsWith('/products') || pathname.startsWith('/sot') || pathname.startsWith('/inout') || pathname.startsWith('/branches') || pathname.startsWith('/dishware') || pathname.startsWith('/price') || pathname.startsWith('/recycle') || pathname.startsWith('/maintain') || pathname.startsWith('/settings') || pathname.startsWith('/suppliers')) return 'resource-items'
  if (pathname.startsWith('/media') || pathname.startsWith('/menu')) return 'photoupload-items'
  return ''
}


export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [perms, setPerms] = useState<Permissions | null>(null)
  const [pending, setPending] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // 当前 hover 的品牌面板 key（鼠标在菜单项或面板上时保持打开）
  const [hoverPanel, setHoverPanel] = useState<string | null>(null)
  const hoverTimer = useRef<any>(null)

  useEffect(() => {
    getMe().then((u) => {
      setUser(u)
      // 保险：已登录但还没重设密码（is_first_login）→ 强制去改密
      if (u?.isFirstLogin && location.pathname !== '/change-password') {
        window.location.href = '/change-password'
      }
    }).catch(() => {})
    getMyPermissions().then(setPerms).catch(() => {})
    getPendingCount().then(setPending).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const g = groupOf(location.pathname)
    if (g) setOpenGroups(prev => ({ ...prev, [g]: true }))
  }, [location.pathname])

  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', collapsed)
    return () => document.body.classList.remove('sidebar-collapsed')
  }, [collapsed])

  const has = (s: string) => perms?.sections.includes(s) ?? true
  // 二级权限（submenu）：该组有 submenu 配置时，带 perm key 的项按数组过滤；无 key 的项跟随一级权限
  const hasSub = (secPerm: string, child: MenuChild) => {
    const arr = perms?.submenu?.[secPerm]
    if (arr === undefined) return true
    if (!child.perm) return true
    return arr.includes(child.perm)
  }
  const secPermOf = (label: string) =>
    label === '集团架构' ? 'brand' : label === '营收数据' ? 'analytics' : label === '人事管理' ? 'hr' : label === '资源总库' ? 'resource' : 'visual'
  const go = (path: string) => {
    setHoverPanel(null)
    navigate(path)
  }
  const isActive = (p: string) => {
    const [path, qs] = p.split('?')
    const cur = location.pathname
    if (path !== cur) return false
    if (!qs) return true
    const params = new URLSearchParams(qs)
    const curParams = new URLSearchParams(location.search)
    return Array.from(params.entries()).every(([k, v]) => curParams.get(k) === v)
  }
  const logout = () => {
    localStorage.removeItem('inv_token')
    sessionStorage.clear()
    // 回到官网主页（一键启动模式下官网由后端托管在 /home）
    window.location.href = '/home'
  }

  const toggleGroup = (id: string) => {
    if (collapsed) setCollapsed(false)
    setOpenGroups(prev => {
      const next: Record<string, boolean> = {}
      Object.keys(prev).forEach(k => { next[k] = false })
      next[id] = !prev[id]
      return next
    })
  }
  const toggleExpand = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  // hover 面板：进入延迟打开（避免快速划过闪烁），离开延迟关闭（允许移到面板）
  const panelKey = (sectionId: string, idx: number) => sectionId + '|' + idx
  const enterPanel = (key: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoverPanel(key), 60)
  }
  const leavePanel = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoverPanel(null), 200)
  }

  const filteredMenu = MENU
    .map(section => {
      const secPerm = secPermOf(section.label)
      if (!has(secPerm)) return null
      const children = section.children.filter(child => hasSub(secPerm, child))
      return children.length ? { ...section, children } : null
    })
    .filter(Boolean) as MenuSection[]

  const renderChild = (child: MenuChild, sectionId: string, idx: number) => {
    const hasPanel = !!child.panel && (child.links || child.expandables)
    const key = panelKey(sectionId, idx)
    const panelOpen = hoverPanel === key

    if (hasPanel) {
      return (
        <div className="menu-item-wrapper" key={idx}
          onMouseEnter={() => enterPanel(key)}
          onMouseLeave={leavePanel}>
          <a href={'#' + child.label} className={'informationmenu-item' + (panelOpen ? ' active' : '')}
            onClick={(e) => e.preventDefault()}>
            {child.label}
            <span className="informationmenu-arrow">›</span>
          </a>
          <div className={'submenu' + (panelOpen ? ' open' : '')}
            onMouseEnter={() => enterPanel(key)}
            onMouseLeave={leavePanel}>
            <div className="submenu-header">
              <div className="submenu-title">{child.panel}</div>
            </div>
            <div className="submenu-content">
              {child.links && child.links.map((l, li) => (
                <a key={li} href={'#' + l.path} className={'submenu-item' + (isActive(l.path) ? ' active' : '')}
                  onClick={(e) => { e.preventDefault(); go(l.path) }}>
                  {l.label}
                </a>
              ))}
              {child.expandables && child.expandables.map((ex, ei) => {
                const exKey = sectionId + '-' + idx + '-' + ei
                const isExpanded = !!expanded[exKey]
                return (
                  <div key={ei}>
                    <a href="#" className={'submenu-item expandable' + (isExpanded ? ' expanded' : '')}
                      onClick={(e) => { e.preventDefault(); toggleExpand(exKey) }}>
                      {ex.label}
                      <span className="expand-arrow">›</span>
                    </a>
                    <div className={'sub-options' + (isExpanded ? ' expanded' : '')}>
                      {ex.options.map((o, oi) => (
                        <a key={oi} href={'#' + o.path} className={'sub-option' + (isActive(o.path) ? ' active' : '')}
                          onClick={(e) => { e.preventDefault(); go(o.path) }}>
                          {o.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="menu-item-wrapper" key={idx}>
        <a href={'#' + (child.path || '')} className={'informationmenu-item' + (child.path && isActive(child.path) ? ' active' : '')}
          onClick={(e) => { e.preventDefault(); if (child.path) go(child.path) }}>
          {child.label}
          {child.path === '/hire' && pending > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>{pending}</span>
          )}
        </a>
      </div>
    )
  }

  return (
    <>
      <aside className={'informationmenu' + (collapsed ? ' collapsed' : '')}>
        <div className="informationmenu-header">
          <div className="user-avatar-dropdown">
            <div id="user-avatar" className="user-avatar">{(user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user?.displayName || user?.username || 'User'}</div>
              <div className="user-position">{user?.position || 'User'}</div>
            </div>
          </div>
          <div className="sidebar-menu-hamburger" id="sidebarToggle" onClick={() => setCollapsed(!collapsed)}>
            <span></span><span></span><span></span>
          </div>
        </div>

        <div className="informationmenu-content">
          {filteredMenu.map(section => (
            <div className="informationmenu-section" key={section.id}>
              <div className={'informationmenu-section-title' + (openGroups[section.id] ? ' active' : '')} data-target={section.id}
                onClick={() => toggleGroup(section.id)}>
                <img src={ICONS[section.icon] || ''} alt="" className="section-icon" />
                <span style={{ flex: 1, paddingLeft: 4 }}>{section.label}</span>
                <span className="section-arrow">⮞</span>
              </div>
              <div className={'dropdown-menu-items' + (openGroups[section.id] ? ' show' : '')} id={section.id}>
                {section.children.map((child, ci) => renderChild(child, section.id, ci))}
              </div>
            </div>
          ))}
        </div>

        <div className="informationmenu-footer">
          <RealtimeStatus />
          <button className="logout-btn" onClick={logout}>登出</button>
        </div>
      </aside>
      <main className="kz-main">
        <Outlet />
      </main>
    </>
  )
}
