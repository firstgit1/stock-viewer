import {
  getAuthConfig,
  isAdminUsername,
  isAuthConfigured,
  readSessionFromCookie,
} from './auth-server.js'
import { getAnnouncement, updateAnnouncement } from './announcement.js'

function getSessionUser(cookieHeader) {
  if (!isAuthConfigured()) return null
  const { secret } = getAuthConfig()
  const session = readSessionFromCookie(cookieHeader || '', secret)
  if (!session?.u) return null
  const isAdmin = session.r === 'admin' || isAdminUsername(session.u)
  return { username: session.u, isAdmin }
}

export async function handleGetAnnouncement(cookieHeader) {
  const user = getSessionUser(cookieHeader)
  if (!user) return { status: 401, data: { ok: false, message: '未登录' } }

  const announcement = await getAnnouncement()
  return { status: 200, data: { ok: true, announcement } }
}

export async function handleUpdateAnnouncement(cookieHeader, body = {}) {
  const user = getSessionUser(cookieHeader)
  if (!user) return { status: 401, data: { ok: false, message: '未登录' } }
  if (!user.isAdmin) return { status: 403, data: { ok: false, message: '需要管理员权限' } }

  try {
    const patch = {}
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    if (body.text != null) patch.text = body.text
    const announcement = await updateAnnouncement(patch)
    return { status: 200, data: { ok: true, announcement } }
  } catch (e) {
    if (e.code === 'UNAVAILABLE' || e.code === 'INVALID') {
      return { status: e.code === 'INVALID' ? 400 : 503, data: { ok: false, message: e.message } }
    }
    throw e
  }
}
