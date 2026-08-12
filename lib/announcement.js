import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Redis } from '@upstash/redis'
import { isUserStoreConfigured } from './users.js'

const REDIS_KEY = 'sv:config:announcement'
const LOCAL_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.data',
  'announcement.json',
)
const MAX_TEXT = 500

export function defaultAnnouncement() {
  return {
    enabled: false,
    text: '',
    updatedAt: null,
  }
}

export function normalizeAnnouncement(input = {}) {
  const base = defaultAnnouncement()
  return {
    enabled: Boolean(input.enabled),
    text: String(input.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT),
    updatedAt: input.updatedAt || null,
  }
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

async function readLocal() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, 'utf8')
    return normalizeAnnouncement(JSON.parse(raw))
  } catch {
    return defaultAnnouncement()
  }
}

async function writeLocal(data) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
  await fs.writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), 'utf8')
}

export async function getAnnouncement() {
  const redis = getRedis()
  if (redis) {
    const data = await redis.get(REDIS_KEY)
    if (!data) return defaultAnnouncement()
    if (typeof data === 'string') {
      try {
        return normalizeAnnouncement(JSON.parse(data))
      } catch {
        return defaultAnnouncement()
      }
    }
    return normalizeAnnouncement(data)
  }

  if (!isUserStoreConfigured()) return defaultAnnouncement()
  return readLocal()
}

export async function updateAnnouncement(patch = {}) {
  const current = await getAnnouncement()
  const next = normalizeAnnouncement({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  })

  if (next.enabled && !next.text) {
    const err = new Error('开启公告前请填写内容')
    err.code = 'INVALID'
    throw err
  }

  const redis = getRedis()
  if (redis) {
    await redis.set(REDIS_KEY, next)
    return next
  }

  if (!isUserStoreConfigured()) {
    const err = new Error('未配置存储（UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）')
    err.code = 'UNAVAILABLE'
    throw err
  }

  await writeLocal(next)
  return next
}
