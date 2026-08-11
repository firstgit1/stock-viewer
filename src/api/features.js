import { FEATURE_DEFS } from './feature-defs'

let cached = null
let loading = null

export function getCachedFeatures() {
  return cached
}

export function clearFeaturesCache() {
  cached = null
}

export async function fetchFeatures({ force = false } = {}) {
  if (!force && cached) return cached
  if (!force && loading) return loading

  loading = (async () => {
    try {
      const res = await fetch('/api/features', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        cached = {
          features: Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])),
          defs: FEATURE_DEFS,
        }
        return cached
      }
      cached = {
        features: data.features,
        defs: data.defs || FEATURE_DEFS,
      }
      return cached
    } catch {
      cached = {
        features: Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])),
        defs: FEATURE_DEFS,
      }
      return cached
    } finally {
      loading = null
    }
  })()

  return loading
}

export async function updateFeatures(patch) {
  const res = await fetch('/api/admin/features', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features: patch }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw new Error(data.message || '保存失败')
  }
  cached = {
    features: data.features,
    defs: data.defs || FEATURE_DEFS,
  }
  return cached
}
