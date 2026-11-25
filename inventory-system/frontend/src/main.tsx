import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { routes, AutoLogin } from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './styles/toast.css' // 全局 toast：1:1 对齐旧 live 系统（backend/css/toast.css）

dayjs.locale('zh-cn')

// data router：useBlocker 依赖它（KPI 上传页「有未保存数据不许离开」）
const router = createBrowserRouter(routes)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          // 老版主色：橙 #ff5c00
          colorPrimary: '#ff5c00',
          colorInfo: '#ff5c00',
          colorLink: '#ff5c00',
          borderRadius: 8,
          fontFamily: "'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: {
            bodyBg: '#f7f2ea',
            headerBg: '#ffffff',
            siderBg: '#ffffff',
          },
          Card: {
            headerBg: '#fff',
          },
        },
      }}
    >
      <AntApp>
        <AutoLogin>
          {/* 全局兜底：渲染期异常显示「页面出错了 + 重新加载」，而不是整页白屏 */}
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </AutoLogin>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
