export async function fetchPushUsers() {
  const res = await fetch(`/api/push/config?t=${Date.now()}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '加载推送配置失败')
  return {
    users: data.users || [],
    diagnostics: data.diagnostics || null,
    withTokenCount: data.withTokenCount ?? 0,
    enabledCount: data.enabledCount ?? 0,
  }
}

export async function saveUserPush(payload) {
  const res = await fetch('/api/push/config', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '保存失败')
  return { user: data.user, diagnostics: data.diagnostics || null }
}

export async function testUserPush(payload = {}) {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '测试失败')
  return data
}

export async function runPushNow(payload = {}) {
  const res = await fetch('/api/push/run', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '执行失败')
  return data
}
