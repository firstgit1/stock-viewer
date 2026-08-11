import {
  getAuthConfig,
  isAuthConfigured,
  readSessionFromCookie,
  sessionCookie,
  clearSessionCookie,
  signSession,
} from './auth-server.js'
import {
  authenticateUser,
  createUser,
  isUserStoreConfigured,
  normalizeUsername,
} from './users.js'

function cookieSecure() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

export async function handleRegister(body) {
  if (!isAuthConfigured()) {
    return { status: 503, data: { ok: false, message: '未配置 AUTH_SECRET' } }
  }
  if (!isUserStoreConfigured()) {
    return {
      status: 503,
      data: { ok: false, message: '未配置 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN' },
    }
  }

  try {
    const username = normalizeUsername(body?.username)
    const password = String(body?.password || '')
    const user = await createUser(username, password)
    const { secret } = getAuthConfig()
    const token = signSession(user.username, secret)
    return {
      status: 201,
      data: { ok: true, username: user.username },
      headers: { 'Set-Cookie': sessionCookie(token, { secure: cookieSecure() }) },
    }
  } catch (e) {
    if (e.code === 'CONFLICT') {
      return { status: 409, data: { ok: false, message: e.message } }
    }
    if (e.code === 'INVALID') {
      return { status: 400, data: { ok: false, message: e.message } }
    }
    if (e.code === 'UNAVAILABLE') {
      return { status: 503, data: { ok: false, message: e.message } }
    }
    throw e
  }
}

export async function handleLogin(body) {
  if (!isAuthConfigured()) {
    return { status: 503, data: { ok: false, message: '未配置 AUTH_SECRET' } }
  }

  const username = normalizeUsername(body?.username)
  const password = String(body?.password || '')
  if (!username || !password) {
    return { status: 400, data: { ok: false, message: '请输入用户名和密码' } }
  }

  const user = await authenticateUser(username, password)
  if (!user) {
    return { status: 401, data: { ok: false, message: '用户名或密码错误' } }
  }

  const { secret } = getAuthConfig()
  const token = signSession(user.username, secret)
  return {
    status: 200,
    data: { ok: true, username: user.username },
    headers: { 'Set-Cookie': sessionCookie(token, { secure: cookieSecure() }) },
  }
}

export function handleLogout() {
  return {
    status: 200,
    data: { ok: true },
    headers: { 'Set-Cookie': clearSessionCookie({ secure: cookieSecure() }) },
  }
}

export function handleMe(cookieHeader) {
  if (!isAuthConfigured()) {
    return { status: 503, data: { ok: false, message: '未配置登录环境变量' } }
  }
  const { secret } = getAuthConfig()
  const session = readSessionFromCookie(cookieHeader || '', secret)
  if (!session) return { status: 401, data: { ok: false } }
  return { status: 200, data: { ok: true, username: session.u } }
}

export function sendJson(res, result) {
  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (result.headers) {
    Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v))
  }
  res.end(JSON.stringify(result.data))
}
