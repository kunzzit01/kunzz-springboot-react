import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactElement } from 'react'
import AppLayout from './components/AppLayout'
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
import MobileInout from './pages/MobileInout'

function RequireAuth({ children }: { children: ReactElement }) {
  const token = localStorage.getItem('inv_token')
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 电话版出货：独立布局（无侧边栏），对齐旧 /mobile/ch/stocklistjX.php 改量出货业务 */}
      <Route path="/mobile/inout" element={<RequireAuth><MobileInout /></RequireAuth>} />
      <Route path="/m/inout" element={<Navigate to="/mobile/inout" replace />} />
      <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
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
