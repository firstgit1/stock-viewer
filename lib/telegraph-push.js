import {
  getPushConfig,
  getSeenIds,
  resolvePushToken,
  savePushConfig,
  saveSeenIds,
} from './push-store.js'
import { sendPushPlus } from './pushplus.js'

const TELEGRAPH_API = 'https://stock.quicktiny.cn/api/cailian-telegraph?count=50'

function itemId(item) {
  return String(item?.id ?? item?.sort_score ?? '')
}

function itemTitle(item) {
  const title = String(item?.title || '').trim()
  if (title) return title
  const brief = String(item?.brief || item?.content || '').trim()
  return brief.slice(0, 40) || '财联社电报'
}

function itemContent(item) {
  const title = String(item?.title || '').trim()
  const body = String(item?.brief || item?.content || '').trim()
  const subjects = (item?.subjects || [])
    .map((s) => s?.subject_name)
    .filter(Boolean)
    .join('、')
  const stocks = (item?.stock_list || [])
    .map((s) => s?.name)
    .filter(Boolean)
    .join('、')

  const parts = []
  if (title) parts.push(`<b>${escapeHtml(title)}</b>`)
  if (body) parts.push(escapeHtml(body))
  if (subjects) parts.push(`关键词：${escapeHtml(subjects)}`)
  if (stocks) parts.push(`相关：${escapeHtml(stocks)}`)
  return parts.join('<br/><br/>')
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function isImportant(item) {
  const level = String(item?.level || '').toUpperCase()
  return level === 'A' || level === 'B' || item?.recommend === 1
}

async function fetchTelegraph() {
  const res = await fetch(TELEGRAPH_API)
  if (!res.ok) throw new Error(`电报接口 HTTP ${res.status}`)
  const json = await res.json()
  if (json.error !== 0 && json.error !== undefined) {
    throw new Error('电报接口返回失败')
  }
  return Array.isArray(json.data) ? json.data : []
}

/**
 * 拉取电报并推送新消息。
 * 首次运行只建立已读集合，不推历史，避免刷屏。
 */
export async function runTelegraphPush({ force = false } = {}) {
  const config = await getPushConfig()
  const token = resolvePushToken(config)

  if (!force && !config.enabled) {
    return { ok: true, skipped: true, reason: '推送未开启' }
  }
  if (!token) {
    return { ok: false, skipped: true, reason: '未配置 PushPlus Token' }
  }

  const list = await fetchTelegraph()
  const ids = list.map(itemId).filter(Boolean)
  const seen = await getSeenIds()
  const seenSet = new Set(seen)

  // 首次：只记已读，不推送
  if (!seen.length) {
    await saveSeenIds(ids)
    const result = {
      ok: true,
      bootstrapped: true,
      fetched: list.length,
      pushed: 0,
      message: '已初始化，之后的新电报才会推送',
    }
    await savePushConfig({
      lastRunAt: new Date().toISOString(),
      lastResult: result,
    })
    return result
  }

  // 列表通常是新→旧，推送时按旧→新，方便阅读顺序
  const fresh = list
    .filter((item) => {
      const id = itemId(item)
      return id && !seenSet.has(id)
    })
    .reverse()

  let pushed = 0
  const errors = []
  for (const item of fresh) {
    try {
      const prefix = isImportant(item) ? '【重要】' : ''
      await sendPushPlus({
        token,
        title: `${prefix}${itemTitle(item)}`.slice(0, 100),
        content: itemContent(item),
        template: 'html',
      })
      pushed += 1
      seenSet.add(itemId(item))
      // 轻微间隔，降低触发频率限制风险
      await new Promise((r) => setTimeout(r, 350))
    } catch (e) {
      errors.push(e?.message || '发送失败')
      // 失败也标记，避免死循环狂推同一条；也可不标记。选择标记失败的 id 以免卡死。
      seenSet.add(itemId(item))
    }
  }

  // 合并本批所有 id，保证已见列表更新
  for (const id of ids) seenSet.add(id)
  await saveSeenIds([...seenSet])

  const result = {
    ok: errors.length === 0,
    fetched: list.length,
    newCount: fresh.length,
    pushed,
    errors: errors.slice(0, 5),
  }
  await savePushConfig({
    lastRunAt: new Date().toISOString(),
    lastResult: result,
  })
  return result
}
