import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { isEnglishRoute } from '../utils/languageRoutes.js';

/** Keeps LanguageContext in sync with the current URL. */
export default function LanguageSync() {
  const location = useLocation();
  const { changeLanguage } = useLanguage();

  useEffect(() => {
    changeLanguage(isEnglishRoute(location.pathname) ? 'en' : 'cn');
  }, [location.pathname, changeLanguage]);

  return null;
}
