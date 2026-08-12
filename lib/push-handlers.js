import {
  getAuthConfig,
  isAdminUsername,
  isAuthConfigured,
  readSessionFromCookie,
} from './auth-server.js'
import {
  getPushConfig,
  publicPushConfig,
  resolvePushToken,
  savePushConfig,
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

function requireAdmin(cookieHeader) {
  const user = getSessionUser(cookieHeader)
  if (!user) return { status: 401, data: { ok: false, message: '未登录' } }
  if (!user.isAdmin) return { status: 403, data: { ok: false, message: '需要管理员权限' } }
  return null
}

export async function handleGetPushConfig(cookieHeader) {
  const denied = requireAdmin(cookieHeader)
  if (denied) return denied
  const config = await getPushConfig()
  return { status: 200, data: { ok: true, config: publicPushConfig(config) } }
}

export async function handleSavePushConfig(cookieHeader, body = {}) {
  const denied = requireAdmin(cookieHeader)
  if (denied) return denied

  try {
    const patch = {}
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    if (typeof body.token === 'string') patch.token = body.token
    if (body.mode) patch.mode = body.mode

    const config = await savePushConfig(patch)
    return { status: 200, data: { ok: true, config: publicPushConfig(config) } }
  } catch (e) {
    if (e.code === 'UNAVAILABLE') {
      return { status: 503, data: { ok: false, message: e.message } }
    }
    throw e
  }
}

export async function handleTestPush(cookieHeader, body = {}) {
  const denied = requireAdmin(cookieHeader)
  if (denied) return denied

  const config = await getPushConfig()
  const token = String(body.token || '').trim() || resolvePushToken(config)
  if (!token) {
    return { status: 400, data: { ok: false, message: '请先填写 PushPlus Token' } }
  }

  try {
    await sendPushPlus({
      token,
      title: body.title || '数据看板测试',
      content: body.content || '这是一条来自股票数据看板的测试推送。',
    })
    return { status: 200, data: { ok: true, message: '测试消息已发送，请查看微信' } }
  } catch (e) {
    return { status: 400, data: { ok: false, message: e.message || '发送失败' } }
  }
}

export async function handleRunPush(cookieHeader) {
  const denied = requireAdmin(cookieHeader)
  if (denied) return denied

  try {
    const result = await runTelegraphPush({ force: true })
    const config = await getPushConfig()
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
  if (!secret) return true // 未配置时允许（本地），生产建议配置
  const auth = req.headers.authorization || ''
  return auth === `Bearer ${secret}`
}
