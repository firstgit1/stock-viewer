import { handleGetPushConfig, handleSavePushConfig } from '../../lib/push-handlers.js'
import { readJsonBody } from '../../lib/auth-server.js'
import { sendJson } from '../../lib/auth-handlers.js'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, await handleGetPushConfig(req.headers.cookie || ''))
      return
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readJsonBody(req)
      sendJson(res, await handleSavePushConfig(req.headers.cookie || '', body))
      return
    }
    res.statusCode = 405
    res.setHeader('Allow', 'GET, PUT, POST')
    res.end('Method Not Allowed')
  } catch {
    sendJson(res, { status: 400, data: { ok: false, message: '请求无效' } })
  }
}
