import crypto from 'node:crypto'

const COOKIE_NAME = 'sv_session'
const MAX_AGE_SEC = 60 * 60 * 24 * 7 // 7 天

export function getAuthConfig(env = process.env) {
  return {
    user: env.AUTH_USER || '',
    pass: env.AUTH_PASS || '',
    secret: env.AUTH_SECRET || '',
  }
}

/** 会话签名密钥必填；AUTH_USER/AUTH_PASS 为可选管理员账号 */
export function isAuthConfigured(env = process.env) {
  return Boolean(getAuthConfig(env).secret)
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromB64url(input) {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const raw = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(raw, 'base64').toString('utf8')
}

export function signSession(username, secret, maxAgeSec = MAX_AGE_SEC) {
  const payload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  }
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySession(token, secret) {
  if (!token || !secret || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(fromB64url(body))
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function parseCookies(cookieHeader = '') {
  const out = {}
  String(cookieHeader)
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((part) => {
      const i = part.indexOf('=')
      if (i === -1) return
      out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1))
    })
  return out
}

export function sessionCookie(token, { secure = true } = {}) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SEC}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie({ secure = true } = {}) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readSessionFromCookie(cookieHeader, secret) {
  const cookies = parseCookies(cookieHeader)
  return verifySession(cookies[COOKIE_NAME], secret)
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}

export { COOKIE_NAME, MAX_AGE_SEC }
