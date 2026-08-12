export async function fetchAnnouncement({ force = false } = {}) {
  const res = await fetch(`/api/announcement?t=${force ? Date.now() : ''}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '加载公告失败')
  return data.announcement || { enabled: false, text: '' }
}

export async function updateAnnouncement(payload) {
  const res = await fetch('/api/announcement', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.message || '保存公告失败')
  return data.announcement
}
