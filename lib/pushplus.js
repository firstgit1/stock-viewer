export async function sendPushPlus({ token, title, content, template = 'html' }) {
  const t = String(token || '').trim()
  if (!t) {
    const err = new Error('未配置 PushPlus Token')
    err.code = 'NO_TOKEN'
    throw err
  }

  const res = await fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: t,
      title: String(title || '通知').slice(0, 100),
      content: String(content || ''),
      template,
      channel: 'wechat',
    }),
  })

  const data = await res.json().catch(() => ({}))
  // pushplus: code === 200 成功
  if (!res.ok || (data.code != null && Number(data.code) !== 200)) {
    const err = new Error(data.msg || data.message || `PushPlus 发送失败 (${res.status})`)
    err.code = 'PUSH_FAILED'
    err.detail = data
    throw err
  }
  return data
}
