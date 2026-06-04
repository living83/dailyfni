import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Python FastAPI (blog-macro-python) — 대시보드 생성/매뉴얼 로그인
      '/api/dashboard': 'http://localhost:8001',
      '/api/generate': 'http://localhost:8001',
      '/api/manual-login': 'http://localhost:8001',
      // Node Express (blog-macro) — 계정/콘텐츠/포스팅/엔게이지/통계 등 그 외 전부
      '/api': 'http://localhost:3001',
    },
  },
})
