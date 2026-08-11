import { handleMe, sendJson } from '../lib/auth-handlers.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    res.end('Method Not Allowed')
    return
  }

  sendJson(res, handleMe(req.headers.cookie || ''))
}
