import {
  getAuthConfig,
  isAdminUsername,
  isAuthConfigured,
  readSessionFromCookie,
} from './auth-server.js'
import {
  getUserPushConfig,
  publicPushConfig,
  resolveUserPushToken,
  saveUserPushConfig,
} from './push-store.js'
import { sendPushPlus } from './pushplus.js'
import { runTelegraphPush } from './telegraph-push.js'

function getSessionUser(cookieHeader) {
  if (!isAuthConfigured()) return null
  const { secret } = getAuthConfig()
  const session = readSessionFromCookie(cookieHeader || '', secret)
  if (!session?.u) return null
  const isAdmin = session.r === 'admin' || isAdminUsername(session.u)
  return { username: session.u, isAdmin }
}

function requireLogin(cookieHeader) {
  const user = getSessionUser(cookieHeader)
  if (!user) return { error: { status: 401, data: { ok: false, message: '未登录' } } }
  return { user }
}

export async function handleGetPushConfig(cookieHeader) {
  const { user, error } = requireLogin(cookieHeader)
  if (error) return error
  const config = await getUserPushConfig(user.username)
  return { status: 200, data: { ok: true, config: publicPushConfig(config) } }
}

export async function handleSavePushConfig(cookieHeader, body = {}) {
  const { user, error } = requireLogin(cookieHeader)
  if (error) return error

  try {
    const patch = {}
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    if (typeof body.token === 'string') patch.token = body.token
    if (body.mode) patch.mode = body.mode

    const config = await saveUserPushConfig(user.username, patch)
    return { status: 200, data: { ok: true, config: publicPushConfig(config) } }
  } catch (e) {
    if (e.code === 'UNAVAILABLE') {
      return { status: 503, data: { ok: false, message: e.message } }
    }
    throw e
  }
}

export async function handleTestPush(cookieHeader, body = {}) {
  const { user, error } = requireLogin(cookieHeader)
  if (error) return error

  const config = await getUserPushConfig(user.username)
  const token = String(body.token || '').trim() || resolveUserPushToken(config)
  if (!token) {
    return { status: 400, data: { ok: false, message: '请先填写 PushPlus Token' } }
  }

  try {
    await sendPushPlus({
      token,
      title: body.title || '数据看板测试',
      content: body.content || `这是发给 ${user.username} 的测试推送。`,
    })
    return { status: 200, data: { ok: true, message: '测试消息已发送，请查看微信' } }
  } catch (e) {
    return { status: 400, data: { ok: false, message: e.message || '发送失败' } }
  }
}

export async function handleRunPush(cookieHeader) {
  const { user, error } = requireLogin(cookieHeader)
  if (error) return error

  try {
    const result = await runTelegraphPush({ username: user.username, force: true })
    const config = await getUserPushConfig(user.username)
    return {
      status: 200,
      data: {
        ok: true,
        result,
        config: publicPushConfig(config),
      },
    }
  } catch (e) {
    return { status: 500, data: { ok: false, message: e.message || '执行失败' } }
  }
}

export function assertCronAuth(req) {
  const secret = process.env.CRON_SECRET || ''
  if (!secret) return true
  const auth = req.headers.authorization || ''
  return auth === `Bearer ${secret}`
}
