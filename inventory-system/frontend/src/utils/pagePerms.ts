import { getMyPermissions, getMe } from '../api'

/**
 * 页面级权限（URL 守卫共用模块）——对齐旧系统 sidebar/page permissions 语义：
 * - user_sidebar_permissions 无记录 = 从未配置 → 全放行（保持旧语义）
 * - sections（一级组）不含该组 → 拒绝
 * - submenu（二级）该组配置过数组且不含该 key → 拒绝；无 key 的子项跟随一级
 * - account_type = special（老板）恒放行
 */

export interface MyPerms {
  sections?: string[]
  submenu?: Record<string, string[]>
  brand?: Record<string, string[]>
  pages?: Record<string, unknown>
}

export interface RoutePerm {
  section: string
  sub?: string
}

/** 路由 → 权限映射（对齐 AppLayout MENU；未列出的路由 = 公共/不设限，返回 null） */
export function routePerm(pathname: string, search: string): RoutePerm | null {
  const p = pathname
  const q = new URLSearchParams(search)
  // 集团架构
  if (p.startsWith('/corporate/edit')) return { section: 'visual' } // 企业蓝图管理在视觉组
  if (p.startsWith('/corporate')) return { section: 'brand', sub: 'kunzz_holdings' }
  if (p.startsWith('/schedule') || p.startsWith('/phone')) {
    const restaurant = (q.get('restaurant') || '').toUpperCase()
    return { section: 'brand', sub: restaurant === 'J3' ? 'tokyo_izakaya' : 'tokyo_cuisine' }
  }
  // 营收数据
  if (p === '/kpi/upload' || p.startsWith('/kpi/upload')) return { section: 'analytics', sub: 'kpi_upload' }
  if (p.startsWith('/kpi')) return { section: 'analytics', sub: 'kpi_report' }
  // 人事管理
  if (p.startsWith('/staff')) return { section: 'hr', sub: 'staff_management' }
  if (p.startsWith('/qna') || p.startsWith('/evaluation') || p.startsWith('/hire')) return { section: 'hr' }
  // 资源总库（库存功能区共用 stock_inventory；碗碟/价格对比有独立 key）
  if (p.startsWith('/dishware')) return { section: 'resource', sub: 'dishware' }
  if (p.startsWith('/price')) return { section: 'resource', sub: 'price_comparison' }
  if (
    p.startsWith('/records') || p.startsWith('/remark') || p.startsWith('/products') ||
    p.startsWith('/sot') || p.startsWith('/inout') || p.startsWith('/branches') ||
    p.startsWith('/recycle') || p.startsWith('/maintain') || p.startsWith('/suppliers') ||
    p.startsWith('/settings')
  ) return { section: 'resource', sub: 'stock_inventory' }
  // 视觉管理
  if (p.startsWith('/media') || p.startsWith('/menu')) return { section: 'visual' }
  // 其余（dashboard、change-password 等）不设限
  return null
}

/** 判定：给定权限数据下能否访问该路由（perms=null = 尚未加载完成，保守放行由调用方决定加载态） */
export function canAccess(perms: MyPerms | null | undefined, pathname: string, search: string, isSpecial: boolean): boolean {
  if (isSpecial) return true
  const rp = routePerm(pathname, search)
  if (!rp) return true
  if (!perms) return true // 无 sidebar 记录 = 从未配置 → 全放行（对齐旧系统与 AppLayout 语义）
  const sections = perms.sections || []
  if (!sections.includes(rp.section)) return false
  if (rp.sub) {
    const arr = perms.submenu?.[rp.section]
    if (arr !== undefined && !arr.includes(rp.sub)) return false
  }
  return true
}

// —— 会话级缓存（一次登录拉一次，切换路由不再重复请求）——
let permsPromise: Promise<MyPerms> | null = null
let specialFlag = false

export function loadPagePerms(force = false): Promise<{ perms: MyPerms; isSpecial: boolean }> {
  if (!permsPromise || force) {
    permsPromise = Promise.all([getMyPermissions().catch(() => null), getMe().catch(() => null)])
      .then(([perms, me]) => {
        specialFlag = String(me?.accountType || '') === 'special'
        return { perms: (perms || {}) as MyPerms, isSpecial: specialFlag }
      })
  }
  return permsPromise
}

export function resetPagePerms() {
  permsPromise = null
  specialFlag = false
}
