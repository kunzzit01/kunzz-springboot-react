import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './styles/toast.css' // 全局 toast：1:1 对齐旧 live 系统（backend/css/toast.css）

dayjs.locale('zh-cn')

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
        <BrowserRouter>
          {/* 全局兜底：渲染期异常显示"页面出错了 + 重新加载"，而不是整页白屏 */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
