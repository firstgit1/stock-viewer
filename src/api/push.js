export async function fetchPushConfig() {
  const res = await fetch('/api/push/config', { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '加载推送配置失败')
  return data.config
}

export async function savePushConfig(payload) {
  const res = await fetch('/api/push/config', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '保存失败')
  return data.config
}

export async function testPush(payload = {}) {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '测试失败')
  return data
}

export async function runPushNow() {
  const res = await fetch('/api/push/run', {
    method: 'POST',
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '执行失败')
  return data
}
