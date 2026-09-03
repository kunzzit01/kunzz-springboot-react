import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import AppLayout from './components/AppLayout'
import { loadPagePerms, canAccess, resetPagePerms } from './utils/pagePerms'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
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
  const token = localStorage.getItem('inv_token')
  const location = useLocation()
  if (!token) {
    return <Navigate to={'/mobile/login?redirect=' + encodeURIComponent(location.pathname + location.search)} replace />
  }
  return children
}

function RequireAuth({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('inv_token')
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

/** 页面级权限守卫：URL 直达也拦截（对齐旧系统 sidebar/page permissions 语义；9/3 新增） */
function RequirePage({ children }: { children: ReactElement }) {
  const location = useLocation()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')
  useEffect(() => {
    // 登出后缓存作废
    if (!localStorage.getItem('inv_token')) { resetPagePerms(); setState('ok'); return }
    loadPagePerms()
      .then(({ perms, isSpecial }) => setState(canAccess(perms, location.pathname, location.search, isSpecial) ? 'ok' : 'denied'))
      .catch(() => setState('ok')) // 权限接口异常时不误伤（与 AppLayout 语义一致）
  }, [location.pathname, location.search])
  if (state === 'loading') return null
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 电话版（手机端专用，无侧边栏）：
          /mobile/login 手机用户专用登录（登录后自动去到有权限的分店）；
          /mobile/out 库存列表改量出货（对齐旧 /mobile/ch/stocklistjX.php）；
          /mobile/records 手机出货记录（对齐旧 /jX/jXstockeditmobile.php，桌面「手机版」按钮落点）；
          旧路径 /mobile/inout、/m/inout、/m/out 重定向到 /mobile/out */}
      <Route path="/mobile/login" element={<MobileLogin />} />
      <Route path="/mobile/out" element={<RequireMobileAuth><MobileOut /></RequireMobileAuth>} />
      <Route path="/mobile/records" element={<RequireMobileAuth><MobileRecords /></RequireMobileAuth>} />
      <Route path="/mobile/inout" element={<MobileRedirect to="/mobile/out" />} />
      <Route path="/m/inout" element={<MobileRedirect to="/mobile/out" />} />
      <Route path="/m/out" element={<MobileRedirect to="/mobile/out" />} />
      <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><RequirePage><AppLayout /></RequirePage></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="records" element={<StockRecords />} />
        <Route path="sot" element={<StockSot />} />
        <Route path="products" element={<StockProducts />} />
        <Route path="inout" element={<StockInout />} />
        <Route path="branches" element={<Branches />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="settings" element={<Settings />} />
        <Route path="dishware" element={<Dishware />} />
        <Route path="dishware_break" element={<DishwareBreak />} />
        <Route path="dishware_transfer" element={<DishwareTransfer />} />
        <Route path="staff" element={<Staff />} />
<Route path="staff/add" element={<AddEmployee />} />
        <Route path="hire" element={<Jobs />} />
        <Route path="qna" element={<Qna />} />
        <Route path="evaluation" element={<Evaluation />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="menu" element={<Menu />} />
        <Route path="price" element={<Price />} />
        <Route path="kpi" element={<Kpi />} />
        <Route path="kpi/upload" element={<KpiEdit />} />
<Route path="cost/upload" element={<CostEdit />} />
<Route path="cost" element={<Cost />} />
        <Route path="corporate" element={<Corporate />} />
        <Route path="corporate/edit" element={<CorporateEdit />} />
        <Route path="media" element={<Media />} />
        <Route path="media/music" element={<BgMusic />} />
        <Route path="media/about4" element={<Timeline />} />
        <Route path="media/join2" element={<JoinComphoto />} />
        <Route path="media/join3" element={<JobPositions />} />
        <Route path="media/:key" element={<PageUpload />} />
        <Route path="recycle" element={<Recycle />} />
        <Route path="remark" element={<RemarkAnalysis />} />
        <Route path="maintain" element={<Maintain />} />
        <Route path="phone" element={<Phone />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
