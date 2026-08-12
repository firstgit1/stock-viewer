import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Redis } from '@upstash/redis'
import { getAuthConfig } from './auth-server.js'

const USER_PREFIX = 'sv:user:'
const USER_INDEX_KEY = 'sv:user-index'
const LOCAL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'users.json')

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err)
      else resolve(key.toString('base64url'))
    })
  })
}

export function normalizeUsername(username) {
  return String(username || '').trim()
}

export function usernameKey(username) {
  return `${USER_PREFIX}${normalizeUsername(username).toLowerCase()}`
}

export function validateUsername(username) {
  const u = normalizeUsername(username)
  if (u.length < 2 || u.length > 20) {
    return '用户名长度需为 2–20 个字符'
  }
  if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(u)) {
    return '用户名仅支持中文、字母、数字和下划线'
  }
  return ''
}

export function validatePassword(password) {
  const p = String(password || '')
  if (p.length < 6 || p.length > 64) {
    return '密码长度需为 6–64 个字符'
  }
  return ''
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url')
  const hash = await scryptAsync(password, salt)
  return `${salt}:${hash}`
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const next = await scryptAsync(password, salt)
  const a = Buffer.from(hash)
  const b = Buffer.from(next)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export function isUserStoreConfigured(env = process.env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return true
  // 本地开发可用文件存储，生产必须配 Redis
  return env.VERCEL !== '1' && env.NODE_ENV !== 'production'
}

async function readLocalUsers() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeLocalUsers(users) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
  await fs.writeFile(LOCAL_FILE, JSON.stringify(users, null, 2), 'utf8')
}

export async function findUser(username) {
  const key = usernameKey(username)
  const redis = getRedis()
  if (redis) {
    const data = await redis.get(key)
    if (!data) return null
    if (typeof data === 'string') {
      try {
        return JSON.parse(data)
      } catch {
        return null
      }
    }
    return data
  }

  const users = await readLocalUsers()
  return users[key] || null
}

export async function createUser(username, password) {
  const name = normalizeUsername(username)
  const nameError = validateUsername(name)
  if (nameError) {
    const err = new Error(nameError)
    err.code = 'INVALID'
    throw err
  }
  const passError = validatePassword(password)
  if (passError) {
    const err = new Error(passError)
    err.code = 'INVALID'
    throw err
  }

  const { user: reserved } = getAuthConfig()
  if (reserved && name.toLowerCase() === reserved.toLowerCase()) {
    const err = new Error('该用户名已被占用')
    err.code = 'CONFLICT'
    throw err
  }

  const passwordHash = await hashPassword(password)
  const record = {
    username: name,
    passwordHash,
    createdAt: new Date().toISOString(),
  }
  const key = usernameKey(name)

  const redis = getRedis()
  if (redis) {
    const ok = await redis.set(key, record, { nx: true })
    if (ok === null) {
      const err = new Error('该用户名已被占用')
      err.code = 'CONFLICT'
      throw err
    }
    await redis.sadd(USER_INDEX_KEY, name.toLowerCase())
    return { username: name }
  }

  if (!isUserStoreConfigured()) {
    const err = new Error('未配置用户存储（UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）')
    err.code = 'UNAVAILABLE'
    throw err
  }

  const users = await readLocalUsers()
  if (users[key]) {
    const err = new Error('该用户名已被占用')
    err.code = 'CONFLICT'
    throw err
  }
  users[key] = record
  await writeLocalUsers(users)
  return { username: name }
}

/** 列出已注册用户名（含环境变量管理员账号） */
export async function listUsernames() {
  const names = new Set()
  const { user: adminName } = getAuthConfig()
  if (adminName) names.add(adminName)

  const redis = getRedis()
  if (redis) {
    const indexed = (await redis.smembers(USER_INDEX_KEY)) || []
    for (const raw of indexed) {
      const n = String(raw || '').trim()
      if (n) names.add(n)
    }

    // 每次列表都与 sv:user:* 对账，避免漏掉未写入索引的新注册用户
    try {
      const keys = (await redis.keys(`${USER_PREFIX}*`)) || []
      for (const key of keys) {
        const rawKey = String(key || '')
        const fromKey = rawKey.startsWith(USER_PREFIX)
          ? rawKey.slice(USER_PREFIX.length).trim()
          : ''
        let username = fromKey
        try {
          const data = await redis.get(rawKey)
          const parsed =
            typeof data === 'string'
              ? JSON.parse(data)
              : data && typeof data === 'object'
                ? data
                : null
          if (parsed?.username) username = String(parsed.username).trim() || fromKey
        } catch {
          // keep fromKey
        }
        if (!username) continue
        names.add(username)
        await redis.sadd(USER_INDEX_KEY, username.toLowerCase())
      }
    } catch {
      // ignore scan errors
    }

    return [...names].sort((a, b) => a.localeCompare(b, 'zh'))
  }

  if (!isUserStoreConfigured()) return [...names].sort((a, b) => a.localeCompare(b, 'zh'))
  const users = await readLocalUsers()
  for (const record of Object.values(users)) {
    const n = String(record?.username || '').trim()
    if (n) names.add(n)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'zh'))
}

export async function authenticateUser(username, password) {
  const name = normalizeUsername(username)
  const { user, pass } = getAuthConfig()

  // 环境变量管理员账号（AUTH_USER / AUTH_PASS）
  if (user && name.toLowerCase() === user.toLowerCase()) {
    if (pass && password === pass) {
      return { username: user, role: 'admin', isAdmin: true }
    }
    const err = new Error('密码错误')
    err.code = 'BAD_PASSWORD'
    throw err
  }

  const found = await findUser(name)
  if (!found?.passwordHash) {
    const err = new Error('该用户名尚未注册，请先注册')
    err.code = 'NOT_FOUND'
    throw err
  }
  const ok = await verifyPassword(password, found.passwordHash)
  if (!ok) {
    const err = new Error('密码错误')
    err.code = 'BAD_PASSWORD'
    throw err
  }
  return { username: found.username || name, role: 'user', isAdmin: false }
}
