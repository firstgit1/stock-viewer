import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Redis } from '@upstash/redis'
import { isUserStoreConfigured } from './users.js'

export const FEATURE_DEFS = [
  { key: 'ladder', label: '涨停天梯', description: '涨停天梯数据页' },
  { key: 'telegraph', label: '财联社电报', description: '财联社电报列表' },
  { key: 'search', label: '搜索', description: '搜索与详情' },
  { key: 'severeAbnormal', label: '严重异动', description: '交易所监控池 · 严重异常波动' },
]

const FEATURE_KEYS = FEATURE_DEFS.map((x) => x.key)
const REDIS_KEY = 'sv:config:features'
const LOCAL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'features.json')

export function defaultFeatures() {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]))
}

function normalizeFeatures(input = {}) {
  const base = defaultFeatures()
  for (const key of FEATURE_KEYS) {
    if (typeof input[key] === 'boolean') base[key] = input[key]
  }
  return base
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
    return normalizeFeatures(JSON.parse(raw))
  } catch {
    return defaultFeatures()
  }
}

async function writeLocal(features) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
  await fs.writeFile(LOCAL_FILE, JSON.stringify(features, null, 2), 'utf8')
}

export async function getFeatures() {
  const redis = getRedis()
  if (redis) {
    const data = await redis.get(REDIS_KEY)
    if (!data) return defaultFeatures()
    if (typeof data === 'string') {
      try {
        return normalizeFeatures(JSON.parse(data))
      } catch {
        return defaultFeatures()
      }
    }
    return normalizeFeatures(data)
  }

  if (!isUserStoreConfigured()) return defaultFeatures()
  return readLocal()
}

export async function updateFeatures(patch = {}, { replace = false } = {}) {
  // replace=true 时以客户端提交的完整状态为准，避免并发读写互相覆盖
  const next = replace
    ? normalizeFeatures(patch)
    : normalizeFeatures({ ...(await getFeatures()), ...patch })

  const redis = getRedis()
  if (redis) {
    await redis.set(REDIS_KEY, next)
    return next
  }

  if (!isUserStoreConfigured()) {
    const err = new Error('未配置用户存储（UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）')
    err.code = 'UNAVAILABLE'
    throw err
  }

  await writeLocal(next)
  return next
}

export { FEATURE_KEYS }
