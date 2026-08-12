import {
  getAuthConfig,
  isAdminUsername,
  isAuthConfigured,
  readSessionFromCookie,
} from './auth-server.js'
import {
  getPushStorageDiagnostics,
  getUserPushConfig,
  listAllPushConfigs,
  normalizeKeywords,
  normalizeMode,
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

function requireAdmin(cookieHeader) {
  const user = getSessionUser(cookieHeader)
  if (!user) return { error: { status: 401, data: { ok: false, message: '未登录' } } }
  if (!user.isAdmin) return { error: { status: 403, data: { ok: false, message: '需要管理员权限' } } }
  return { user }
}

/** 管理员：列出注册用户 + 推送配置 */
export async function handleGetPushConfig(cookieHeader) {
  const { error } = requireAdmin(cookieHeader)
  if (error) return error

  const pushUsers = await listAllPushConfigs()
  const users = pushUsers.map((u) => ({
    username: u.username,
    ...publicPushConfig(u.config),
  }))
  users.sort((a, b) => a.username.localeCompare(b.username, 'zh'))
  const diagnostics = await getPushStorageDiagnostics()
  return {
    status: 200,
    data: {
      ok: true,
      users,
      diagnostics,
      withTokenCount: users.filter((u) => u.hasToken).length,
      enabledCount: users.filter((u) => u.enabled && u.hasToken).length,
    },
  }
}

/** 管理员：为指定用户保存 Token / 开关 */
export async function handleSavePushConfig(cookieHeader, body = {}) {
  const { error } = requireAdmin(cookieHeader)
  if (error) return error

  const username = String(body.username || '').trim()
  if (!username) {
    return { status: 400, data: { ok: false, message: '请填写用户名' } }
  }

  try {
    const current = await getUserPushConfig(username)
    const patch = {}
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    if (typeof body.token === 'string') patch.token = body.token
    if (body.mode != null) patch.mode = body.mode
    if (body.keywords != null) patch.keywords = body.keywords

    const nextMode = normalizeMode(patch.mode ?? current.mode)
    const nextKeywords = normalizeKeywords(patch.keywords ?? current.keywords)
    if (nextMode === 'keywords' && !nextKeywords.length) {
      return { status: 400, data: { ok: false, message: '关键词模式请至少填写一个关键词' } }
    }

    const config = await saveUserPushConfig(username, patch)
    const diagnostics = await getPushStorageDiagnostics()
    return {
      status: 200,
      data: {
        ok: true,
        user: { username, ...publicPushConfig(config) },
        diagnostics,
      },
    }
  } catch (e) {
    if (e.code === 'UNAVAILABLE' || e.code === 'INVALID') {
      return { status: e.code === 'INVALID' ? 400 : 503, data: { ok: false, message: e.message } }
    }
    throw e
  }
}

/** 管理员：测试推送给指定用户 */
export async function handleTestPush(cookieHeader, body = {}) {
  const { error } = requireAdmin(cookieHeader)
  if (error) return error

  const username = String(body.username || '').trim()
  if (!username) {
    return { status: 400, data: { ok: false, message: '请选择用户' } }
  }

  const config = await getUserPushConfig(username)
  const token = String(body.token || '').trim() || resolveUserPushToken(config)
  if (!token) {
    return { status: 400, data: { ok: false, message: '请先为该用户填写 PushPlus Token' } }
  }

  try {
    await sendPushPlus({
      token,
      title: body.title || '数据看板测试',
      content: body.content || `这是管理员发给 ${username} 的测试推送。`,
    })
    return { status: 200, data: { ok: true, message: `测试消息已发给 ${username}，请查看微信` } }
  } catch (e) {
    return { status: 400, data: { ok: false, message: e.message || '发送失败' } }
  }
}

/** 管理员：检查新电报并推送给所有已开启用户（或指定用户） */
export async function handleRunPush(cookieHeader, body = {}) {
  const { error } = requireAdmin(cookieHeader)
  if (error) return error

  const username = String(body.username || '').trim()
  const skipBacklog = Boolean(body.skipBacklog)

  try {
    const result = skipBacklog
      ? await runTelegraphPush({ skipBacklog: true })
      : username
        ? await runTelegraphPush({ username, force: true })
        : await runTelegraphPush({ force: true })
    return {
      status: 200,
      data: {
        ok: true,
        result,
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
