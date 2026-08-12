import { readJsonBody } from '../lib/auth-server.js'
import { sendJson } from '../lib/auth-handlers.js'
import {
  handleGetAnnouncement,
  handleUpdateAnnouncement,
} from '../lib/announcement-handlers.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    sendJson(res, await handleGetAnnouncement(req.headers.cookie || ''))
    return
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      sendJson(res, await handleUpdateAnnouncement(req.headers.cookie || '', body))
    } catch {
      sendJson(res, { status: 400, data: { ok: false, message: '请求无效' } })
    }
    return
  }

  res.statusCode = 405
  res.setHeader('Allow', 'GET, PUT, POST')
  res.end('Method Not Allowed')
}
