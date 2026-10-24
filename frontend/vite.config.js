import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api requests to the FastAPI backend during development
// so the frontend dev server and API share the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://data-sentinel.onrender.com',
        changeOrigin: true,
      },
    },
  },
})
