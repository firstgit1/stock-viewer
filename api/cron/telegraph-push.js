import { assertCronAuth } from '../../lib/push-handlers.js'
import { runTelegraphPush } from '../../lib/telegraph-push.js'
import { sendJson } from '../../lib/auth-handlers.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST')
    res.end('Method Not Allowed')
    return
  }

  if (!assertCronAuth(req)) {
    sendJson(res, { status: 401, data: { ok: false, message: 'Unauthorized' } })
    return
  }

  try {
    const result = await runTelegraphPush()
    sendJson(res, { status: 200, data: { ok: true, result } })
  } catch (e) {
    sendJson(res, { status: 500, data: { ok: false, message: e.message || 'cron failed' } })
  }
}
