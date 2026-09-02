import { useEffect, useState } from 'react'
import { getMe, getStockPerms } from '../api'

/**
 * 电话版（/mobile/*）双层权限：
 * ① users.branch（对齐旧 phone 版 branch_check.php：kh 全通，否则须包含分店）
 * ② 页面权限树 stock_inventory.system（职员管理·权限设定：配置过 → 须包含；未配置（老手机账号）→ 放行）
 * 两层都通过才允许访问。手机账号通常只有 ①，桌面账号两层都有。
 */

const STORES = ['j1', 'j2', 'j3'] as const

export interface MobileAccess {
  ready: boolean
  username: string
  /** branch 字段原文（kh/j1,j2,j3/空） */
  branch: string
  /** 允许访问的分店（j1/j2/j3，按此顺序） */
  allowedSystems: string[]
}

export function useMobileAccess(): MobileAccess {
  const [state, setState] = useState<MobileAccess>({ ready: false, username: '', branch: '', allowedSystems: [] })
  useEffect(() => {
    let alive = true
    Promise.all([getMe().catch(() => null), getStockPerms().catch(() => null)]).then(([me, perms]) => {
      if (!alive) return
      if (!me) { setState({ ready: true, username: '', branch: '', allowedSystems: [] }); return }
      const branch = (me.branch || '').toLowerCase()
      const parts = branch.split(',').map(s => s.trim()).filter(Boolean)
      // ① branch：kh 全通；否则须包含分店
      const branchAllowed = parts.includes('kh') ? [...STORES] : STORES.filter(s => parts.includes(s))
      // ② 权限树：配置过（后端 configured 标记；后端未升级时回退「非空数组」启发式）→ 按 systems 过滤
      const treeList = ((perms?.systems || []) as string[]).map(s => s.toLowerCase())
      const fallbackConfigured = (perms?.systems || []).length > 0 || (perms?.views || []).length > 0
      const configured = perms == null ? false : ((perms as any).configured ?? fallbackConfigured)
      const treeAllowed = !configured ? [...STORES] : STORES.filter(s => treeList.includes(s))
      setState({
        ready: true,
        username: me.username || '',
        branch: me.branch || '',
        allowedSystems: branchAllowed.filter(s => treeAllowed.includes(s)),
      })
    }).catch(() => { if (alive) setState({ ready: true, username: '', branch: '', allowedSystems: [] }) })
    return () => { alive = false }
  }, [])
  return state
}

/** 退出登录（对齐旧 logout.php：清凭据回手机登录页） */
export function mobileLogout() {
  localStorage.removeItem('inv_token')
  sessionStorage.clear()
  window.location.href = '/mobile/login'
}

/** 无权限访问页（对齐旧 branch_check.php 的 403 卡片：当前账户分支 / 页面要求分支 / 返回） */
export function MobileDenied({ branch, system }: { branch: string; system: string }) {
  return (
    <div className="msl-page">
      <div className="msl-denied">
        <div className="msl-denied-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1>抱歉，您无权访问该分店页面</h1>
        <h2>Access Denied</h2>
        <div className="msl-denied-box">
          <div className="msl-denied-row"><span>当前账户分支</span><b>{branch || '未分配'}</b></div>
          <div className="msl-denied-row"><span>页面要求分支</span><b>{system.toUpperCase()}</b></div>
        </div>
        <button className="msl-denied-btn" onClick={() => { window.history.length > 1 ? window.history.back() : (window.location.href = '/mobile/login') }}>
          返回上一页 / Go Back
        </button>
      </div>
    </div>
  )
}
