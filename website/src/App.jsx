import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import LanguageSync from './components/LanguageSync.jsx';
import { LanguageProvider } from './contexts/LanguageContext.jsx';
import HomePage from './pages/HomePage.jsx';

// 2026-10-29 性能：除首页外全部按路由懒加载 —— 首屏只下载首页需要的代码，
// joinus / about / tokyo / 英文站各自成 chunk（joinus 里的「我们的足迹」动画代码不再拖累首屏）。
const AboutPage = lazy(() => import('./pages/AboutPage.jsx'));
const JoinPage = lazy(() => import('./pages/JoinPage.jsx'));
const HomePage_en = lazy(() => import('./pages/HomePage_en.jsx'));
const AboutPage_en = lazy(() => import('./pages/AboutPage_en.jsx'));
const JoinPage_en = lazy(() => import('./pages/JoinPage_en.jsx'));
const TokyoPage = lazy(() => import('./pages/TokyoPage.jsx'));

/** 路由切换时的占位：撑满一屏，避免全屏 Swiper 站点出现高度塌陷/闪动 */
function RouteFallback() {
  return <div style={{ minHeight: '100vh', background: '#fff' }} aria-hidden="true" />;
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter basename="/home">
        <LanguageSync />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/joinus" element={<JoinPage />} />
            <Route path="/Home_en" element={<HomePage_en />} />
            <Route path="/about_en" element={<AboutPage_en />} />
            <Route path="/join_en" element={<JoinPage_en />} />
            <Route path="/About_en" element={<Navigate to="/about_en" replace />} />
            <Route path="/Join_en" element={<Navigate to="/join_en" replace />} />
            <Route path="/tokyo" element={<TokyoPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </LanguageProvider>
  );
}
