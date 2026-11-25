import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import AppLayout from './components/AppLayout'
import { loadPagePerms, canAccess, resetPagePerms } from './utils/pagePerms'
import { hasToken, hasValidToken } from './utils/authToken'
import { ensureSession } from './utils/authSession'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import StockRecords from './pages/StockRecords'
import StockProducts from './pages/StockProducts'
import StockInout from './pages/StockInout'
import StockSot from './pages/StockSot'
import RemarkAnalysis from './pages/RemarkAnalysis'
import Branches from './pages/Branches'
import Suppliers from './pages/Suppliers'
import Settings from './pages/Settings'
import Dishware from './pages/Dishware'
import DishwareBreak from './pages/DishwareBreak'
import DishwareTransfer from './pages/DishwareTransfer'
import Staff from './pages/Staff'
import Jobs from './pages/Jobs'
import Qna from './pages/Qna'
import Evaluation from './pages/Evaluation'
import Schedule from './pages/Schedule'
import Menu from './pages/Menu'
import Price from './pages/Price'
import Kpi from './pages/Kpi'
import KpiEdit from './pages/KpiEdit'
import CostEdit from './pages/CostEdit'
import Cost from './pages/Cost'
import AddEmployee from './pages/AddEmployee'
import Corporate from './pages/Corporate'
import CorporateEdit from './pages/CorporateEdit'
import Media from './pages/Media'
import PageUpload from './pages/PageUpload'
import BgMusic from './pages/BgMusic'
import Timeline from './pages/Timeline'
import JoinComphoto from './pages/JoinComphoto'
import JobPositions from './pages/JobPositions'
import Recycle from './pages/Recycle'
import Maintain from './pages/Maintain'
import Phone from './pages/Phone'
import MobileOut from './pages/MobileOut'
import MobileRecords from './pages/MobileRecords'
import MobileLogin from './pages/MobileLogin'

/** 手机路径重定向（保留 ?system= 参数） */
function MobileRedirect({ to }: { to: string }) {
  const [sp] = useSearchParams()
  const sys = sp.get('system')
  return <Navigate to={to + (sys ? `?system=${sys}` : '')} replace />
}

/** 手机页鉴权：未登录 → 手机专用登录页（带 redirect 回跳） */
function RequireMobileAuth({ children }: { children: ReactElement }) {
  const token = hasToken()
  const location = useLocation()
  if (!token) {
    return <Navigate to={'/mobile/login?redirect=' + encodeURIComponent(location.pathname + location.search)} replace />
  }
  return children
}

function RequireAuth({ children }: { children: ReactElement }) {
  const token = hasToken()
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

/** 启动门禁（2026-10-28「记住这台设备」）：
 *  JWT 不存在/已过期时，先用设备令牌静默续登，再渲染路由。
 *  不加这一层的话，重启电脑后打开 /dashboard 会先闪一下登录页（RequireAuth 是同步判断 JWT 的）。 */
export function AutoLogin({ children }: { children: ReactElement }) {
  const [ready, setReady] = useState(() => hasValidToken())
  useEffect(() => {
    if (ready) return
    let alive = true
    ensureSession().finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [ready])
  if (ready) return children
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6b7280',
    }}>
      <div style={{
        width: 32, height: 32, border: '3px solid #ffd9bf', borderTopColor: '#ff5c00',
        borderRadius: '50%', animation: 'bootspin 0.9s linear infinite',
      }} />
      <div style={{ fontSize: 13.5 }}>正在恢复登录状态…</div>
    </div>
  )
}

/** 页面级权限守卫：URL 直达也拦截（对齐旧系统 sidebar/page permissions 语义；9/3 新增） */
function RequirePage({ children }: { children: ReactElement }) {
  const location = useLocation()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')
  useEffect(() => {
    // 登出后缓存作废
    if (!hasToken()) { resetPagePerms(); setState('ok'); return }
    loadPagePerms()
      .then(({ perms, isSpecial }) => setState(canAccess(perms, location.pathname, location.search, isSpecial) ? 'ok' : 'denied'))
      .catch(() => setState('ok')) // 权限接口异常时不误伤（与 AppLayout 语义一致）
  }, [location.pathname, location.search])
  if (state === 'loading') {
    // 网络慢时权限接口要等：这里给个加载提示，不要 return null（那样这段时间整页空白 = 白屏）
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6b7280' }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #ffd9bf', borderTopColor: '#ff5c00',
          borderRadius: '50%', animation: 'bootspin 0.9s linear infinite',
        }} />
        <div style={{ fontSize: 13.5 }}>正在加载…</div>
      </div>
    )
  }
  if (state === 'denied') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <i className="fas fa-lock" style={{ fontSize: 42, color: '#d1d5db' }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: '#374151' }}>无权限访问此页面</div>
        <div style={{ fontSize: 13.5, color: '#9ca3af' }}>如需开通请联系管理员调整您的权限设定</div>
        <a href="/" style={{ marginTop: 6, padding: '9px 22px', borderRadius: 10, background: '#ff5c00', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>返回首页</a>
      </div>
    )
  }
  return children
}

// 路由表：交给 createBrowserRouter（data router）—— 只有 data router 才支持 useBlocker，
// KPI 上传页靠它实现「有未保存数据时离开前必须确认」（2026-11-25）。
// 注意：JSX <Route> 换成对象数组后，路径与元素保持一一对应，别顺手改语义。
export const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  // 电话版（手机端专用，无侧边栏）：
  //   /mobile/login 手机用户专用登录（登录后自动去到有权限的分店）
  //   /mobile/out 库存列表改量出货；/mobile/records 手机出货记录
  //   旧路径 /mobile/inout、/m/inout、/m/out 重定向到 /mobile/out
  { path: '/mobile/login', element: <MobileLogin /> },
  { path: '/mobile/out', element: <RequireMobileAuth><MobileOut /></RequireMobileAuth> },
  { path: '/mobile/records', element: <RequireMobileAuth><MobileRecords /></RequireMobileAuth> },
  { path: '/mobile/inout', element: <MobileRedirect to="/mobile/out" /> },
  { path: '/m/inout', element: <MobileRedirect to="/mobile/out" /> },
  { path: '/m/out', element: <MobileRedirect to="/mobile/out" /> },
  { path: '/change-password', element: <RequireAuth><ChangePassword /></RequireAuth> },
  {
    path: '/',
    element: <RequireAuth><RequirePage><AppLayout /></RequirePage></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'records', element: <StockRecords /> },
      { path: 'sot', element: <StockSot /> },
      { path: 'products', element: <StockProducts /> },
      { path: 'inout', element: <StockInout /> },
      { path: 'branches', element: <Branches /> },
      { path: 'suppliers', element: <Suppliers /> },
      { path: 'settings', element: <Settings /> },
      { path: 'dishware', element: <Dishware /> },
      { path: 'dishware_break', element: <DishwareBreak /> },
      { path: 'dishware_transfer', element: <DishwareTransfer /> },
      { path: 'staff', element: <Staff /> },
      { path: 'staff/add', element: <AddEmployee /> },
      { path: 'hire', element: <Jobs /> },
      { path: 'qna', element: <Qna /> },
      { path: 'evaluation', element: <Evaluation /> },
      { path: 'schedule', element: <Schedule /> },
      { path: 'menu', element: <Menu /> },
      { path: 'price', element: <Price /> },
      { path: 'kpi', element: <Kpi /> },
      { path: 'kpi/upload', element: <KpiEdit /> },
      { path: 'cost/upload', element: <CostEdit /> },
      { path: 'cost', element: <Cost /> },
      { path: 'corporate', element: <Corporate /> },
      { path: 'corporate/edit', element: <CorporateEdit /> },
      { path: 'media', element: <Media /> },
      { path: 'media/music', element: <BgMusic /> },
      { path: 'media/about4', element: <Timeline /> },
      { path: 'media/join2', element: <JoinComphoto /> },
      { path: 'media/join3', element: <JobPositions /> },
      { path: 'media/:key', element: <PageUpload /> },
      { path: 'recycle', element: <Recycle /> },
      { path: 'remark', element: <RemarkAnalysis /> },
      { path: 'maintain', element: <Maintain /> },
      { path: 'phone', element: <Phone /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]
