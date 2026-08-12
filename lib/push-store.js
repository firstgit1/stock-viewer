import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Redis } from '@upstash/redis'
import { isUserStoreConfigured } from './users.js'

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

const LEGACY_CONFIG_KEY = 'sv:config:push'
const USER_KEY_PREFIX = 'sv:push:user:'
const USER_INDEX_KEY = 'sv:push:user-index'
const SEEN_KEY = 'sv:push:telegraph:seen'
const LOCAL_USERS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-users.json')
const LOCAL_SEEN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-seen.json')
const MAX_SEEN = 800

function userKey(username) {
  return `${USER_KEY_PREFIX}${String(username || '').trim().toLowerCase()}`
}

export function defaultPushConfig() {
  return {
    enabled: false,
    token: '',
    mode: 'all',
    updatedAt: null,
    lastRunAt: null,
    lastResult: null,
  }
}

function normalizeConfig(input = {}) {
  const base = defaultPushConfig()
  return {
    ...base,
    enabled: Boolean(input.enabled),
    token: String(input.token || base.token || '').trim(),
    mode: 'all',
    updatedAt: input.updatedAt || null,
    lastRunAt: input.lastRunAt || null,
    lastResult: input.lastResult || null,
  }
}

export function maskToken(token = '') {
  const t = String(token || '')
  if (t.length <= 8) return t ? '********' : ''
  return `${t.slice(0, 4)}******${t.slice(-4)}`
}

export function publicPushConfig(config) {
  const c = normalizeConfig(config)
  return {
    enabled: c.enabled,
    mode: c.mode,
    hasToken: Boolean(c.token),
    tokenMasked: maskToken(c.token),
    updatedAt: c.updatedAt,
    lastRunAt: c.lastRunAt,
    lastResult: c.lastResult,
  }
}

async function readLocalJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeLocalJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

async function readLocalUsers() {
  const data = await readLocalJson(LOCAL_USERS, {})
  return data && typeof data === 'object' ? data : {}
}

async function migrateLegacyIfNeeded(username) {
  const name = String(username || '').trim()
  if (!name) return null
  const redis = getRedis()
  if (!redis) return null
  const existing = await redis.get(userKey(name))
  if (existing) return null
  const legacy = await redis.get(LEGACY_CONFIG_KEY)
  if (!legacy) return null
  try {
    const { isAdminUsername } = await import('./auth-server.js')
    if (!isAdminUsername(name)) return null
    const cfg =
      typeof legacy === 'string' ? normalizeConfig(JSON.parse(legacy)) : normalizeConfig(legacy)
    await redis.set(userKey(name), cfg)
    await redis.sadd(USER_INDEX_KEY, name.toLowerCase())
    return cfg
  } catch {
    return null
  }
}

export async function getUserPushConfig(username) {
  const name = String(username || '').trim()
  if (!name) return defaultPushConfig()

  const redis = getRedis()
  if (redis) {
    const migrated = await migrateLegacyIfNeeded(name)
    if (migrated) return migrated
    const data = await redis.get(userKey(name))
    if (!data) return defaultPushConfig()
    if (typeof data === 'string') {
      try {
        return normalizeConfig(JSON.parse(data))
      } catch {
        return defaultPushConfig()
      }
    }
    return normalizeConfig(data)
  }

  if (!isUserStoreConfigured()) return defaultPushConfig()
  const users = await readLocalUsers()
  return normalizeConfig(users[name.toLowerCase()] || {})
}

export async function saveUserPushConfig(username, patch = {}) {
  const name = String(username || '').trim()
  if (!name) {
    const err = new Error('用户无效')
    err.code = 'INVALID'
    throw err
  }

  const current = await getUserPushConfig(name)
  const next = normalizeConfig({
    ...current,
    ...patch,
    token:
      patch.token === undefined || patch.token === null || String(patch.token).trim() === ''
        ? current.token
        : String(patch.token).trim(),
    updatedAt: new Date().toISOString(),
  })

  const redis = getRedis()
  if (redis) {
    await redis.set(userKey(name), next)
    await redis.sadd(USER_INDEX_KEY, name.toLowerCase())
    return next
  }

  if (!isUserStoreConfigured()) {
    const err = new Error('未配置存储（UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）')
    err.code = 'UNAVAILABLE'
    throw err
  }

  const users = await readLocalUsers()
  users[name.toLowerCase()] = { ...next, username: name }
  await writeLocalJson(LOCAL_USERS, users)
  return next
}

/** 返回已开启且有 token 的用户列表 */
export async function listEnabledPushUsers() {
  const all = await listAllPushConfigs()
  return all.filter((u) => u.config.enabled && u.token)
}

/** 返回索引中全部推送用户（含未开启） */
export async function listAllPushConfigs() {
  const redis = getRedis()
  if (redis) {
    const names = (await redis.smembers(USER_INDEX_KEY)) || []
    const users = []
    for (const raw of names) {
      const username = String(raw || '').trim()
      if (!username) continue
      const config = await getUserPushConfig(username)
      const token = resolveUserPushToken(config)
      users.push({ username, config, token })
    }
    return users
  }

  if (!isUserStoreConfigured()) return []
  const all = await readLocalUsers()
  return Object.entries(all).map(([key, cfg]) => {
    const config = normalizeConfig(cfg)
    const token = resolveUserPushToken(config)
    const username = cfg.username || key
    return { username, config, token }
  })
}

export async function getSeenIds() {
  const redis = getRedis()
  if (redis) {
    const data = await redis.get(SEEN_KEY)
    if (!data) return []
    if (typeof data === 'string') {
      try {
        const arr = JSON.parse(data)
        return Array.isArray(arr) ? arr.map(String) : []
      } catch {
        return []
      }
    }
    return Array.isArray(data) ? data.map(String) : []
  }
  if (!isUserStoreConfigured()) return []
  const data = await readLocalJson(LOCAL_SEEN, [])
  return Array.isArray(data) ? data.map(String) : []
}

export async function saveSeenIds(ids = []) {
  const uniq = [...new Set(ids.map(String))].slice(-MAX_SEEN)
  const redis = getRedis()
  if (redis) {
    await redis.set(SEEN_KEY, uniq)
    return uniq
  }
  if (!isUserStoreConfigured()) return uniq
  await writeLocalJson(LOCAL_SEEN, uniq)
  return uniq
}

export function resolveUserPushToken(config) {
  return String(config?.token || '').trim()
}

// 兼容旧代码命名
export async function getPushConfig() {
  return defaultPushConfig()
}

export async function savePushConfig() {
  return defaultPushConfig()
}

export function resolvePushToken(config) {
  return resolveUserPushToken(config) || String(process.env.PUSHPLUS_TOKEN || '').trim()
}
