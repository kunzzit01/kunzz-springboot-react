import { useEffect } from 'react';
import bodyHtml from '../tokyo/body.html?raw';

/**
 * 东京日料官网（与线上 tokyo-japanese-cuisine 页面完全一致）
 * 原样渲染抓取的 HTML body + 原版 tokyo.css / app.js
 * 链接替换为 React 路由，图片指向本地 /tokyo/images/
 */
export default function TokyoPage() {
  const processed = bodyHtml
    .replaceAll('href="index.php"', 'href="/tokyo"')
    .replaceAll('href="tokyo-japanese-cuisine.php"', 'href="/tokyo"')
    // 子页与线上完全一致（线上 about/joinus 即根路径 PHP 页面）
    .replaceAll('href="about.php', 'href="https://kunzzgroup.com/about.php"')
    .replaceAll('href="joinus.php', 'href="https://kunzzgroup.com/joinus.php"')
    .replaceAll('href="tokyo-izakaya.php', 'href="https://kunzzgroup.com/tokyo-japanese-cuisine"')
    .replaceAll('href="login.html"', 'href="https://kunzzgroup.com/frontend/login.html"')
    .replaceAll('src="images/', 'src="/tokyo/images/')
    .replaceAll('href="images/', 'href="/tokyo/images/')
    .replaceAll('src="../public/', 'src="/tokyo/');

  // 加载原版 app.js（swiper 初始化与动画），保持线上行为一致；样式也页面内动态加载（不污染全局主页）
  useEffect(() => {
    const links = ['/tokyo/tokyo.css', '/tokyo/tokyoanimation.css'].map((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
      return link;
    });
    const script = document.createElement('script');
    script.src = '/tokyo/app.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      links.forEach((l) => l.remove());
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="tokyo-page-root">
      <div dangerouslySetInnerHTML={{ __html: processed }} />
    </div>
  );
}
