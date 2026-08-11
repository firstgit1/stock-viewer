let cachedUser = null
let checking = null

function toUser(data) {
  if (!data?.ok || !data.username) return null
  return {
    username: data.username,
    role: data.role || (data.isAdmin ? 'admin' : 'user'),
    isAdmin: Boolean(data.isAdmin || data.role === 'admin'),
  }
}

export function getCachedUser() {
  return cachedUser
}

export function clearCachedUser() {
  cachedUser = null
}

export async function fetchMe({ force = false } = {}) {
  if (!force && cachedUser) return cachedUser
  if (!force && checking) return checking

  checking = (async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' })
      if (!res.ok) {
        cachedUser = null
        return null
      }
      const data = await res.json()
      cachedUser = toUser(data)
      return cachedUser
    } catch {
      cachedUser = null
      return null
    } finally {
      checking = null
    }
  })()

  return checking
}

async function postAuth(path, username, password) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw new Error(data.message || '操作失败')
  }
  cachedUser = toUser(data)
  return cachedUser
}

export function login(username, password) {
  return postAuth('/api/login', username, password)
}

export function register(username, password) {
  return postAuth('/api/register', username, password)
}

export async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
  } finally {
    cachedUser = null
  }
}
