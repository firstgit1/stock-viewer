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
/** 所有推送用户配置的唯一权威来源（避免索引/KEYS 不同步） */
const USERS_MAP_KEY = 'sv:config:push-users-map'
const SEEN_KEY = 'sv:push:telegraph:seen'
const LOCAL_USERS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-users.json')
const LOCAL_SEEN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-seen.json')
const MAX_SEEN = 800

function userKey(username) {
  return `${USER_KEY_PREFIX}${String(username || '').trim().toLowerCase()}`
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

async function readUsersMap(redis) {
  const raw = await redis.get(USERS_MAP_KEY)
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  return {}
}

async function writeUsersMap(redis, map) {
  await redis.set(USERS_MAP_KEY, map)
}

async function hydrateUsersMapFromLegacy(redis) {
  const map = await readUsersMap(redis)
  if (Object.keys(map).length) return map

  // 兼容旧的单用户 key / 全局 legacy
  try {
    const keys = (await redis.keys(`${USER_KEY_PREFIX}*`)) || []
    for (const key of keys) {
      const username = String(key || '').startsWith(USER_KEY_PREFIX)
        ? String(key).slice(USER_KEY_PREFIX.length).trim()
        : ''
      if (!username) continue
      const data = await redis.get(key)
      if (!data) continue
      const cfg = typeof data === 'string' ? normalizeConfig(JSON.parse(data)) : normalizeConfig(data)
      map[username.toLowerCase()] = { ...cfg, username }
    }
  } catch {
    // KEYS 不可用时忽略
  }

  try {
    const legacy = await redis.get(LEGACY_CONFIG_KEY)
    if (legacy) {
      const { isAdminUsername, getAuthConfig } = await import('./auth-server.js')
      const adminName = getAuthConfig().user || 'admin'
      if (isAdminUsername(adminName) && !map[adminName.toLowerCase()]) {
        const cfg =
          typeof legacy === 'string' ? normalizeConfig(JSON.parse(legacy)) : normalizeConfig(legacy)
        map[adminName.toLowerCase()] = { ...cfg, username: adminName }
      }
    }
  } catch {
    // ignore
  }

  if (Object.keys(map).length) await writeUsersMap(redis, map)
  return map
}

export async function getUserPushConfig(username) {
  const name = String(username || '').trim()
  if (!name) return defaultPushConfig()
  const lower = name.toLowerCase()

  const redis = getRedis()
  if (redis) {
    const map = await hydrateUsersMapFromLegacy(redis)
    const fromMap = map[lower]
    const mapCfg = fromMap ? normalizeConfig(fromMap) : null
    if (mapCfg && (mapCfg.token || mapCfg.enabled || mapCfg.updatedAt)) {
      return mapCfg
    }

    const data = await redis.get(userKey(name))
    if (data) {
      const cfg = typeof data === 'string' ? normalizeConfig(JSON.parse(data)) : normalizeConfig(data)
      if (cfg.token || cfg.enabled || cfg.updatedAt) {
        map[lower] = { ...cfg, username: name }
        await writeUsersMap(redis, map)
        return cfg
      }
    }
    return mapCfg || defaultPushConfig()
  }

  if (!isUserStoreConfigured()) return defaultPushConfig()
  const users = await readLocalUsers()
  return normalizeConfig(users[lower] || {})
}

export async function saveUserPushConfig(username, patch = {}) {
  const name = String(username || '').trim()
  if (!name) {
    const err = new Error('用户无效')
    err.code = 'INVALID'
    throw err
  }
  const lower = name.toLowerCase()

  let current = await getUserPushConfig(name)
  const patchKeys = Object.keys(patch)
  const metaOnly =
    patchKeys.length > 0 &&
    patchKeys.every((k) => k === 'lastRunAt' || k === 'lastResult' || k === 'updatedAt')

  const redis = getRedis()

  // 仅更新推送结果时：禁止用空配置覆盖已有 Token
  if (metaOnly && !current.token && !current.enabled) {
    if (redis) {
      const map = await readUsersMap(redis)
      if (!map[lower]) return current
      current = normalizeConfig(map[lower])
    } else if (!isUserStoreConfigured()) {
      return current
    } else {
      const users = await readLocalUsers()
      if (!users[lower]) return current
      current = normalizeConfig(users[lower])
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

  if (redis) {
    const map = await readUsersMap(redis)
    map[lower] = { ...next, username: name }
    await writeUsersMap(redis, map)
    // 双写旧 key，兼容过渡
    await redis.set(userKey(name), next)

    const verifyMap = await readUsersMap(redis)
    if (!verifyMap[lower]?.token && next.token) {
      const err = new Error('保存失败：写入后校验未通过，请检查 Upstash Redis')
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
  users[lower] = { ...next, username: name }
  await writeLocalJson(LOCAL_USERS, users)
  return next
}

/** 返回已开启且有 token 的用户列表 */
export async function listEnabledPushUsers() {
  const all = await listAllPushConfigs()
  return all.filter((u) => u.config.enabled && u.token)
}

/** 返回全部推送用户配置 */
export async function listAllPushConfigs() {
  const redis = getRedis()
  if (redis) {
    const map = await hydrateUsersMapFromLegacy(redis)
    const users = []
    const seen = new Set()

    for (const [key, cfg] of Object.entries(map)) {
      const username = String(cfg?.username || key).trim() || key
      seen.add(String(username).toLowerCase())
      const config = normalizeConfig(cfg)
      users.push({
        username,
        config,
        token: resolveUserPushToken(config),
      })
    }

    // 注册用户即使还没配推送，也出现在列表里（要真正读配置，不能塞空默认值）
    try {
      for (const username of await listUsernames()) {
        const lower = String(username || '')
          .trim()
          .toLowerCase()
        if (!lower || seen.has(lower)) continue
        seen.add(lower)
        const config = await getUserPushConfig(username)
        users.push({
          username,
          config,
          token: resolveUserPushToken(config),
        })
      }
    } catch {
      // ignore
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

export async function getPushConfig() {
  return defaultPushConfig()
}

export async function savePushConfig() {
  return defaultPushConfig()
}

export function resolvePushToken(config) {
  return resolveUserPushToken(config) || String(process.env.PUSHPLUS_TOKEN || '').trim()
}
