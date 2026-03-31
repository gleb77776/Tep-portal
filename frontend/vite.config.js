import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// BACKEND_URL в frontend/.env — должен совпадать с PORT бэкенда (например http://localhost:8000)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // VITE_API_BASE — тот же хост, что в браузере (см. backendUrl.js); иначе BACKEND_URL для прокси
  const backend = env.VITE_API_BASE || env.BACKEND_URL || 'http://localhost:8000'

  /** Одинаковый прокси для dev и preview — иначе `vite preview` не проксирует /api и даёт 404 */
  const proxy = {
    '/home-hero.mov': { target: backend, changeOrigin: true },
    '/api': { target: backend, changeOrigin: true },
    '/diagrams': { target: backend, changeOrigin: true },
    '/smk': { target: backend, changeOrigin: true },
    '/ot': { target: backend, changeOrigin: true },
    '/kepr': { target: backend, changeOrigin: true },
    '/forms': { target: backend, changeOrigin: true },
    '/training': { target: backend, changeOrigin: true },
    '/site-files': { target: backend, changeOrigin: true },
    '/section-project-files': { target: backend, changeOrigin: true },
  }

  return {
    plugins: [react()],
    server: {
      // Чтобы фронтенд был доступен с других ПК в сети.
      host: '0.0.0.0',
      port: 8080,
      allowedHosts: true,
      proxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 8080,
      proxy,
    },
  }
})
