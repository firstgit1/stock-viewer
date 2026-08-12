import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Redis } from '@upstash/redis'
import { isUserStoreConfigured, listUsernames } from './users.js'

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

const LEGACY_CONFIG_KEY = 'sv:config:push'
const USER_KEY_PREFIX = 'sv:push:user:'
const USER_INDEX_KEY = 'sv:push:user-index'
const USER_LIST_KEY = 'sv:config:push-user-list'
const SEEN_KEY = 'sv:push:telegraph:seen'
const LOCAL_USERS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-users.json')
const LOCAL_SEEN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-seen.json')
const MAX_SEEN = 800

function userKey(username) {
  return `${USER_KEY_PREFIX}${String(username || '').trim().toLowerCase()}`
}

async function readPushUserList(redis) {
  const raw = await redis.get(USER_LIST_KEY)
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

async function rememberPushUsername(redis, username) {
  const name = String(username || '').trim()
  if (!name) return
  const lower = name.toLowerCase()
  await redis.sadd(USER_INDEX_KEY, lower)
  const list = await readPushUserList(redis)
  if (!list.some((x) => String(x).toLowerCase() === lower)) {
    list.push(name)
    await redis.set(USER_LIST_KEY, list)
  }
}

const PUSH_MODES = new Set(['all', 'important', 'keywords'])

export function defaultPushConfig() {
  return {
    enabled: false,
    token: '',
    mode: 'all',
    keywords: [],
    updatedAt: null,
    lastRunAt: null,
    lastResult: null,
  }
}

export function normalizeMode(mode) {
  const m = String(mode || 'all').trim().toLowerCase()
  return PUSH_MODES.has(m) ? m : 'all'
}

export function normalizeKeywords(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '').split(/[,，、\n]+/)
  return [...new Set(list.map((k) => String(k || '').trim()).filter(Boolean))].slice(0, 30)
}

function normalizeConfig(input = {}) {
  const base = defaultPushConfig()
  return {
    ...base,
    enabled: Boolean(input.enabled),
    token: String(input.token || base.token || '').trim(),
    mode: normalizeMode(input.mode ?? base.mode),
    keywords: normalizeKeywords(input.keywords ?? base.keywords),
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
    keywords: c.keywords,
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

  let current = await getUserPushConfig(name)
  const patchKeys = Object.keys(patch)
  const metaOnly =
    patchKeys.length > 0 &&
    patchKeys.every((k) => k === 'lastRunAt' || k === 'lastResult' || k === 'updatedAt')

  // 仅更新推送结果时：若读到空配置，不要用默认空值把已有 Token 覆盖掉
  if (metaOnly && !current.token && !current.enabled) {
    const redis = getRedis()
    if (redis) {
      const raw = await redis.get(userKey(name))
      if (!raw) return current
      current =
        typeof raw === 'string'
          ? normalizeConfig(JSON.parse(raw))
          : normalizeConfig(raw)
    } else if (!isUserStoreConfigured()) {
      return current
    } else {
      const users = await readLocalUsers()
      if (!users[name.toLowerCase()]) return current
      current = normalizeConfig(users[name.toLowerCase()])
    }
  }

  const next = normalizeConfig({
    ...current,
    ...patch,
    token:
      patch.token === undefined || patch.token === null || String(patch.token).trim() === ''
        ? current.token
        : String(patch.token).trim(),
    keywords: patch.keywords === undefined ? current.keywords : patch.keywords,
    mode: patch.mode === undefined ? current.mode : patch.mode,
    updatedAt: metaOnly ? current.updatedAt || new Date().toISOString() : new Date().toISOString(),
  })

  const redis = getRedis()
  if (redis) {
    await redis.set(userKey(name), next)
    await rememberPushUsername(redis, name)
    const verify = await redis.get(userKey(name))
    if (!verify) {
      const err = new Error('保存失败：写入后无法读取，请检查 Upstash Redis 配置')
      err.code = 'UNAVAILABLE'
      throw err
    }
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
  const nameSet = new Set()

  const redis = getRedis()
  if (redis) {
    const indexed = (await redis.smembers(USER_INDEX_KEY)) || []
    for (const raw of indexed) {
      const n = String(raw || '').trim()
      if (n) nameSet.add(n)
    }

    try {
      for (const n of await readPushUserList(redis)) {
        if (n) nameSet.add(n)
      }
    } catch {
      // ignore
    }

    // 与 sv:push:user:* 对账（部分 Upstash 环境 KEYS 可能不可用）
    try {
      const keys = (await redis.keys(`${USER_KEY_PREFIX}*`)) || []
      for (const key of keys) {
        const n = String(key || '').startsWith(USER_KEY_PREFIX)
          ? String(key).slice(USER_KEY_PREFIX.length).trim()
          : ''
        if (!n) continue
        nameSet.add(n)
        await rememberPushUsername(redis, n)
      }
    } catch {
      // ignore
    }
  }

  // 与注册用户列表对齐
  try {
    for (const username of await listUsernames()) {
      const n = String(username || '').trim()
      if (n) nameSet.add(n)
    }
  } catch {
    // ignore
  }

  if (!nameSet.size) {
    if (redis) return []
    if (!isUserStoreConfigured()) return []
    const all = await readLocalUsers()
    return Object.entries(all).map(([key, cfg]) => {
      const config = normalizeConfig(cfg)
      const token = resolveUserPushToken(config)
      const username = cfg.username || key
      return { username, config, token }
    })
  }

  const users = []
  for (const username of nameSet) {
    const config = await getUserPushConfig(username)
    const token = resolveUserPushToken(config)
    if (redis && (config.enabled || config.token || config.updatedAt)) {
      await rememberPushUsername(redis, username)
    }
    users.push({ username, config, token })
  }
  return users
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
