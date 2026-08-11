import { handleLogout, sendJson } from '../lib/auth-handlers.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end('Method Not Allowed')
    return
  }

  sendJson(res, handleLogout())
}
