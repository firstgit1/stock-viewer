import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readJsonBody } from './lib/auth-server.js'
import {
  handleLogin,
  handleLogout,
  handleMe,
  handleRegister,
  sendJson,
} from './lib/auth-handlers.js'
import { handleGetFeatures, handleUpdateFeatures } from './lib/feature-handlers.js'

function localAuthApi() {
  return {
    name: 'local-auth-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (!url?.startsWith('/api/')) return next()

        try {
          if (url === '/api/register' && req.method === 'POST') {
            const body = await readJsonBody(req)
            return sendJson(res, await handleRegister(body))
          }
          if (url === '/api/login' && req.method === 'POST') {
            const body = await readJsonBody(req)
            return sendJson(res, await handleLogin(body))
          }
          if (url === '/api/logout' && req.method === 'POST') {
            return sendJson(res, handleLogout())
          }
          if (url === '/api/me' && req.method === 'GET') {
            return sendJson(res, handleMe(req.headers.cookie || ''))
          }
          if (url === '/api/features' && req.method === 'GET') {
            return sendJson(res, await handleGetFeatures(req.headers.cookie || ''))
          }
          if (url === '/api/admin/features' && (req.method === 'PUT' || req.method === 'POST')) {
            const body = await readJsonBody(req)
            return sendJson(res, await handleUpdateFeatures(req.headers.cookie || '', body))
          }
        } catch {
          return sendJson(res, { status: 400, data: { ok: false, message: '请求无效' } })
        }

        return next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [vue(), localAuthApi()],
    server: {
      host: true,
      allowedHosts: true,
      port: 5173,
      open: true,
    },
  }
})
