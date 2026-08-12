import { handleTestPush } from '../../lib/push-handlers.js'
import { readJsonBody } from '../../lib/auth-server.js'
import { sendJson } from '../../lib/auth-handlers.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end('Method Not Allowed')
    return
  }
  try {
    const body = await readJsonBody(req)
    sendJson(res, await handleTestPush(req.headers.cookie || '', body))
  } catch {
    sendJson(res, { status: 400, data: { ok: false, message: '请求无效' } })
  }
}
