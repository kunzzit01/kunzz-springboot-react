import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { getLoginUrl } from '../../config.js';
import {
  getAboutPath,
  getHomePath,
  getJoinPath,
  getPathForLanguage,
  isEnglishRoute,
} from '../../utils/languageRoutes.js';

export default function Header({ activeSlide = 0, onSlideTo, totalSlides = 4 }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { changeLanguage } = useLanguage();
  const isEn = isEnglishRoute(location.pathname);
  const homePath = getHomePath(location.pathname);
  const aboutPath = getAboutPath(location.pathname);
  const joinPath = getJoinPath(location.pathname);
  const isAboutPage = location.pathname.toLowerCase() === aboutPath.toLowerCase();
  const isJoinPage = location.pathname.toLowerCase() === joinPath.toLowerCase();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const loginRef = useRef(null);
  const navRef = useRef(null);
  const rightRef = useRef(null);

  useEffect(() => {
    const login = loginRef.current;
    const nav = navRef.current;
    const right = rightRef.current;
    if (!login || !nav || !right) return;

    const moveLogin = () => {
      if (window.innerWidth <= 768) {
        if (!nav.contains(login)) nav.appendChild(login);
      } else if (!right.contains(login)) {
        right.insertBefore(login, right.firstChild);
      }
    };

    moveLogin();
    window.addEventListener('resize', moveLogin);
    return () => window.removeEventListener('resize', moveLogin);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('header-mobile-menu-open', mobileOpen);
    document.documentElement.classList.toggle('header-mobile-menu-open', mobileOpen);
    return () => {
      document.body.classList.remove('header-mobile-menu-open');
      document.documentElement.classList.remove('header-mobile-menu-open');
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileOpen(false);
        setBrandsOpen(false);
        setLoginOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (loginRef.current && !loginRef.current.contains(e.target)) {
        setLoginOpen(false);
      }
      if (
        brandsOpen &&
        navRef.current &&
        !navRef.current.querySelector('.header-nav-dropdown')?.contains(e.target)
      ) {
        setBrandsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [brandsOpen]);

  const closeMobile = () => {
    if (window.innerWidth <= 768) {
      setMobileOpen(false);
      setBrandsOpen(false);
      setLoginOpen(false);
    }
  };

  const handleHomeClick = (e) => {
    e.preventDefault();
    if (isAboutPage || isJoinPage) {
      navigate(homePath);
    } else {
      onSlideTo?.(0);
    }
    closeMobile();
  };

  const toggleBrands = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBrandsOpen((prev) => !prev);
    setLoginOpen(false);
  };

  const toggleLogin = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLoginOpen((prev) => !prev);
    setBrandsOpen(false);
  };

  const switchLanguage = (e, lang) => {
    e.preventDefault();
    changeLanguage(lang);
    navigate(getPathForLanguage(location.pathname, location.search, lang));
    closeMobile();
  };

  return (
    <>
      <header className="header-navbar">
        <div className="header-logo-section">
          <a href={homePath} onClick={handleHomeClick}>
            <img src="/images/KUNZZ.webp" alt="Logo" className="header-logo" />
          </a>
        </div>

        <nav
          ref={navRef}
          className={`header-nav-links${mobileOpen ? ' active' : ''}`}
          id="navMenu"
        >
          <div className="header-nav-item">
            <a href={homePath} onClick={handleHomeClick}>
              Home
            </a>
          </div>
          <div className="header-nav-item">
            <Link to={aboutPath} onClick={closeMobile}>
              About Us
            </Link>
          </div>
          <div className="header-nav-item">
            <Link to={joinPath} onClick={closeMobile}>
              Join Us
            </Link>
          </div>
        </nav>

        <div ref={rightRef} className="header-right-section">
          <div
            ref={loginRef}
            className={`header-login-dropdown${loginOpen ? ' is-open' : ''}`}
          >
            <button
              type="button"
              className={`header-login-btn${loginOpen ? ' active' : ''}`}
              aria-expanded={loginOpen}
              onClick={toggleLogin}
            >
              Login
            </button>
            <div className={`header-login-dropdown-menu${loginOpen ? ' show' : ''}`}>
              <a href={getLoginUrl()} className="header-login-dropdown-item">
                Staff Login
              </a>
            </div>
          </div>

          <div className="header-language-switch" aria-label="Select language">
            <a
              href="/"
              className={`header-language-option${!isEn ? ' active' : ''}`}
              aria-current={!isEn ? 'true' : undefined}
              onClick={(e) => switchLanguage(e, 'cn')}
            >
              中文
            </a>
            <a
              href="/Home_en"
              className={`header-language-option${isEn ? ' active' : ''}`}
              aria-current={isEn ? 'true' : undefined}
              onClick={(e) => switchLanguage(e, 'en')}
            >
              EN
            </a>
          </div>

          <button
            type="button"
            className="header-hamburger"
            aria-expanded={mobileOpen}
            aria-controls="navMenu"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            &#9776;
          </button>
        </div>
      </header>

      <div className="header-page-indicator">
        {Array.from({ length: totalSlides }, (_, i) => (
          <div
            key={i}
            className={`header-page-dot${activeSlide === i ? ' active' : ''}`}
            data-slide={i}
            onClick={() => onSlideTo?.(i)}
            onKeyDown={(e) => e.key === 'Enter' && onSlideTo?.(i)}
            role="button"
            tabIndex={0}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </>
  );
}
