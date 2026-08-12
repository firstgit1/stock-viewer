import { handleRunPush } from '../../lib/push-handlers.js'
import { sendJson } from '../../lib/auth-handlers.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end('Method Not Allowed')
    return
  }

  try {
    sendJson(res, await handleRunPush(req.headers.cookie || ''))
  } catch {
    sendJson(res, { status: 500, data: { ok: false, message: '执行失败' } })
  }
}
