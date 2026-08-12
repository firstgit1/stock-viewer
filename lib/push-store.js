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

const CONFIG_KEY = 'sv:config:push'
const SEEN_KEY = 'sv:push:telegraph:seen'
const LOCAL_CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-config.json')
const LOCAL_SEEN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'push-seen.json')
const MAX_SEEN = 800

export function defaultPushConfig() {
  return {
    enabled: false,
    token: '',
    mode: 'all', // 后续可扩展 keywords / important
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
    mode: input.mode === 'all' ? 'all' : 'all',
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

export async function getPushConfig() {
  const redis = getRedis()
  if (redis) {
    const data = await redis.get(CONFIG_KEY)
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
  return normalizeConfig(await readLocalJson(LOCAL_CONFIG, {}))
}

export async function savePushConfig(patch = {}) {
  const current = await getPushConfig()
  const next = normalizeConfig({
    ...current,
    ...patch,
    // 空字符串表示不改 token
    token:
      patch.token === undefined || patch.token === null || String(patch.token).trim() === ''
        ? current.token
        : String(patch.token).trim(),
    updatedAt: new Date().toISOString(),
  })

  const redis = getRedis()
  if (redis) {
    await redis.set(CONFIG_KEY, next)
    return next
  }
  if (!isUserStoreConfigured()) {
    const err = new Error('未配置存储（UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）')
    err.code = 'UNAVAILABLE'
    throw err
  }
  await writeLocalJson(LOCAL_CONFIG, next)
  return next
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

export function resolvePushToken(config) {
  return String(config?.token || process.env.PUSHPLUS_TOKEN || '').trim()
}
