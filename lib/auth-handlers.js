import {
  getAuthConfig,
  isAuthConfigured,
  isAdminUsername,
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

function sessionFor(user) {
  const { secret } = getAuthConfig()
  const role = user.role || (user.isAdmin ? 'admin' : 'user')
  const token = signSession(user.username, secret, { role })
  return {
    status: 200,
    data: {
      ok: true,
      username: user.username,
      role,
      isAdmin: role === 'admin',
    },
    headers: { 'Set-Cookie': sessionCookie(token, { secure: cookieSecure() }) },
  }
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
    return {
      ...sessionFor({ username: user.username, role: 'user' }),
      status: 201,
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

  try {
    const user = await authenticateUser(username, password)
    return sessionFor(user)
  } catch (e) {
    if (e.code === 'NOT_FOUND' || e.code === 'BAD_PASSWORD') {
      return { status: 401, data: { ok: false, message: e.message } }
    }
    throw e
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

  const role = session.r === 'admin' || isAdminUsername(session.u) ? 'admin' : 'user'
  return {
    status: 200,
    data: {
      ok: true,
      username: session.u,
      role,
      isAdmin: role === 'admin',
    },
  }
}

export function sendJson(res, result) {
  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (result.headers) {
    Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v))
  }
  res.end(JSON.stringify(result.data))
}
