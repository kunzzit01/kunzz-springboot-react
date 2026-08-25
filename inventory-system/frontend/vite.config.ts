import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
