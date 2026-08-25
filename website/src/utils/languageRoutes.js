const CN_HOME = '/';
const CN_ABOUT = '/about';
const CN_JOIN = '/joinus';

const EN_HOME = '/Home_en';
const EN_ABOUT = '/about_en';
const EN_JOIN = '/join_en';

const CN_TO_EN = {
  [CN_HOME]: EN_HOME,
  [CN_ABOUT]: EN_ABOUT,
  [CN_JOIN]: EN_JOIN,
};

const EN_TO_CN = {
  '/home_en': CN_HOME,
  '/about_en': CN_ABOUT,
  '/join_en': CN_JOIN,
};

export function isEnglishRoute(pathname) {
  const path = pathname.toLowerCase();
  return path === '/home_en' || path === '/about_en' || path === '/join_en';
}

export function getHomePath(pathname) {
  return isEnglishRoute(pathname) ? EN_HOME : CN_HOME;
}

export function getAboutPath(pathname) {
  return isEnglishRoute(pathname) ? EN_ABOUT : CN_ABOUT;
}

export function getJoinPath(pathname) {
  return isEnglishRoute(pathname) ? EN_JOIN : CN_JOIN;
}

export function getPathForLanguage(pathname, search, targetLang) {
  const path = pathname.toLowerCase();
  const query = search || '';

  if (targetLang === 'en') {
    if (isEnglishRoute(pathname)) return pathname + query;
    return (CN_TO_EN[path] || EN_HOME) + query;
  }

  if (targetLang === 'cn') {
    if (!isEnglishRoute(pathname)) return pathname + query;
    return (EN_TO_CN[path] || CN_HOME) + query;
  }

  return pathname + query;
}