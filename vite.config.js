import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  
  // GitHub Pages 部署时需要设置 base
  // 部署到 https://wangshibogt.github.io/simo/
  base: '/simo/',
  
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  
  // 生产环境 API 地址（GitHub Pages 需要指向后端服务器）
  define: {
    '__API_BASE__': JSON.stringify(
      process.env.VITE_API_URL || ''
    )
  }
})
