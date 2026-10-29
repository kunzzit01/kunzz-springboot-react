import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 2026-10-29 vite 5 → 7（任务 2026-10-29-deps-security）：
    // vite 6 起默认 target 抬到 baseline-widely-available（Chrome 107 / Safari 16），
    // 而仓库实际使用者里有旧 iPhone / 旧 Windows 浏览器。这里显式钉回 es2020，
    // 与 vite 5 的默认 'modules'（chrome87 / safari14）基本一致，避免升级后老设备白屏。
    target: 'es2020',
  },
  server: {
    port: 5174,
    host: true, // 监听 0.0.0.0（localhost / 127.0.0.1 / 局域网 IP 均可访问）
    proxy: {
      // 开发环境将 /api 代理到库存后端
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      // 碗碟照片等静态资源 → 后端 uploads 目录
      '/uploads': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
})
