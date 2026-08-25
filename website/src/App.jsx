import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import LanguageSync from './components/LanguageSync.jsx';
import { LanguageProvider } from './contexts/LanguageContext.jsx';
import AboutPage from './pages/AboutPage.jsx';
import HomePage from './pages/HomePage.jsx';
import JoinPage from './pages/JoinPage.jsx';
import HomePage_en from './pages/HomePage_en.jsx';
import AboutPage_en from './pages/AboutPage_en.jsx'
import JoinPage_en from './pages/JoinPage_en.jsx'
import TokyoPage from './pages/TokyoPage.jsx'

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter basename="/home">
        <LanguageSync />
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
      </BrowserRouter>
    </LanguageProvider>
  );
}
