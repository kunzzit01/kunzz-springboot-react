/** React routes served at site root (not a deploy folder name). */
const ROOT_ROUTES = new Set(['Home_en', 'about', 'joinus']);

/** e.g. /kunzzgroup when the app is served from a subdirectory on Apache. */
function getDeployBasePath() {
  if (typeof window === 'undefined') return '';
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments.length === 0 || ROOT_ROUTES.has(segments[0])) return '';
  return `/${segments[0]}`;
}

function joinPath(base, path) {
  const normalizedBase = base.replace(/\/$/, '');
  const normalizedPath = path.replace(/^\//, '');
  if (/^https?:\/\//i.test(normalizedBase)) {
    return `${normalizedBase}/${normalizedPath}`;
  }
  return `${normalizedBase}/${normalizedPath}`;
}

/** Base URL for PHP pages not yet migrated to React. */
export function getPhpBase() {
  if (import.meta.env.VITE_PHP_BASE) return import.meta.env.VITE_PHP_BASE;
  if (import.meta.env.DEV) return 'http://localhost/kunzzgroup/frontend';
  const deployBase = getDeployBasePath();
  return deployBase ? `${deployBase}/frontend` : '/frontend';
}

export function getLoginUrl() {
  if (import.meta.env.VITE_LOGIN_URL) return import.meta.env.VITE_LOGIN_URL;
  return joinPath(getPhpBase(), 'login.html');
}

/** @deprecated Use getPhpBase() so subdirectory deploy resolves at runtime. */
export const PHP_BASE = getPhpBase();

/** @deprecated Use getLoginUrl() so subdirectory deploy resolves at runtime. */
export const LOGIN_URL = getLoginUrl();

export const EN_SITE_URL =
  import.meta.env.VITE_EN_SITE_URL || '/Home_en';
