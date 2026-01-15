import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  
  // GitHub Pages 部署时需要设置 base
  // 如果部署到 https://用户名.github.io/simo/，设置 base: '/simo/'
  // 如果部署到根目录或自己的服务器，设置 base: '/'
  base: process.env.GITHUB_PAGES ? '/simo/' : '/',
  
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
