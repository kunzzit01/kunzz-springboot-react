import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/home/', // 一键启动模式下官网由后端托管在 /home 子路径
  plugins: [react()],
  server: {
    port: 5175,
    host: true, // 监听 0.0.0.0（localhost / 127.0.0.1 / 局域网 IP 均可访问）
    proxy: {
      // 官网媒体（视频/图片）→ 本地后端（MediaController /media/{type} serve，对齐线上 serve_media.php）
      // 本地无文件时后端自动从线上拉取缓存，后台上传后官网立即生效
      '/media': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      // 职位数据 → Spring Boot 后端（与后台联动）
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      // 登录等 PHP 页面路径保持线上可访问（展示用）
      '/frontend': {
        target: 'https://kunzzgroup.com',
        changeOrigin: true,
      },
    },
  },
});
