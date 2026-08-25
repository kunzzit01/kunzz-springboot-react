import { createContext, useCallback, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('cn');

  // Initialize language from localStorage on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('preferredLanguage');
    if (savedLanguage === 'en' || savedLanguage === 'cn') {
      setLanguage(savedLanguage);
    } else {
      // Default to Chinese if no preference saved
      localStorage.setItem('preferredLanguage', 'cn');
    }
  }, []);

  // Update localStorage when language changes
  const changeLanguage = useCallback((newLanguage) => {
    if (newLanguage === 'en' || newLanguage === 'cn') {
      setLanguage(newLanguage);
      localStorage.setItem('preferredLanguage', newLanguage);
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
