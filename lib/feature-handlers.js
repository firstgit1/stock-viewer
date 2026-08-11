import {
  getAuthConfig,
  isAdminUsername,
  isAuthConfigured,
  readSessionFromCookie,
} from './auth-server.js'
import { FEATURE_DEFS, getFeatures, updateFeatures } from './features.js'

function getSessionUser(cookieHeader) {
  if (!isAuthConfigured()) return null
  const { secret } = getAuthConfig()
  const session = readSessionFromCookie(cookieHeader || '', secret)
  if (!session?.u) return null
  const isAdmin = session.r === 'admin' || isAdminUsername(session.u)
  return { username: session.u, isAdmin }
}

export async function handleGetFeatures(cookieHeader) {
  const user = getSessionUser(cookieHeader)
  if (!user) return { status: 401, data: { ok: false, message: '未登录' } }

  const features = await getFeatures()
  return {
    status: 200,
    data: {
      ok: true,
      features,
      defs: FEATURE_DEFS,
    },
  }
}

export async function handleUpdateFeatures(cookieHeader, body) {
  const user = getSessionUser(cookieHeader)
  if (!user) return { status: 401, data: { ok: false, message: '未登录' } }
  if (!user.isAdmin) return { status: 403, data: { ok: false, message: '需要管理员权限' } }

  try {
    const patch = body?.features && typeof body.features === 'object' ? body.features : body
    const replace = body?.replace !== false
    const features = await updateFeatures(patch || {}, { replace })
    return {
      status: 200,
      data: {
        ok: true,
        features,
        defs: FEATURE_DEFS,
      },
    }
  } catch (e) {
    if (e.code === 'UNAVAILABLE') {
      return { status: 503, data: { ok: false, message: e.message } }
    }
    throw e
  }
}
