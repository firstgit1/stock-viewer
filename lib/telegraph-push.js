import {
  getSeenIds,
  getUserPushConfig,
  listEnabledPushUsers,
  resolveUserPushToken,
  saveSeenIds,
  saveUserPushConfig,
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

function itemSearchText(item) {
  const parts = [
    item?.title,
    item?.brief,
    item?.content,
    ...((item?.subjects || []).map((s) => s?.subject_name)),
    ...((item?.stock_list || []).map((s) => `${s?.name || ''} ${s?.symbol || ''}`)),
  ]
  return parts.filter(Boolean).join('\n').toLowerCase()
}

function matchKeywords(item, keywords = []) {
  if (!keywords.length) return false
  const text = itemSearchText(item)
  return keywords.some((k) => text.includes(String(k).toLowerCase()))
}

function filterItemsForUser(items, config) {
  const mode = config?.mode || 'all'
  if (mode === 'important') return items.filter(isImportant)
  if (mode === 'keywords') return items.filter((item) => matchKeywords(item, config.keywords || []))
  return items
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

async function pushItemsToUser(token, items) {
  let pushed = 0
  const errors = []
  for (const item of items) {
    try {
      const prefix = isImportant(item) ? '【重要】' : ''
      await sendPushPlus({
        token,
        title: `${prefix}${itemTitle(item)}`.slice(0, 100),
        content: itemContent(item),
        template: 'html',
      })
      pushed += 1
      await new Promise((r) => setTimeout(r, 350))
    } catch (e) {
      errors.push(e?.message || '发送失败')
    }
  }
  return { pushed, errors }
}

/**
 * 拉取电报并推送给用户。
 * - username 指定时：只处理该用户（立即检查）
 * - 否则：推送给所有已开启用户（定时任务）
 * 首次全局运行只初始化已读，不推历史。
 */
export async function runTelegraphPush({ username = '', force = false } = {}) {
  const list = await fetchTelegraph()
  const ids = list.map(itemId).filter(Boolean)
  const seen = await getSeenIds()
  const seenSet = new Set(seen)

  if (!seen.length) {
    await saveSeenIds(ids)
    const result = {
      ok: true,
      bootstrapped: true,
      fetched: list.length,
      pushed: 0,
      userCount: 0,
      message: '已初始化，之后的新电报才会推送',
    }
    if (username) {
      await saveUserPushConfig(username, {
        lastRunAt: new Date().toISOString(),
        lastResult: result,
      })
    }
    return result
  }

  const fresh = list
    .filter((item) => {
      const id = itemId(item)
      return id && !seenSet.has(id)
    })
    .reverse()

  let targets = []
  if (username) {
    const config = await getUserPushConfig(username)
    const token = resolveUserPushToken(config)
    if (!force && !config.enabled) {
      return { ok: true, skipped: true, reason: '推送未开启' }
    }
    if (!token) {
      return { ok: false, skipped: true, reason: '未配置 PushPlus Token' }
    }
    targets = [{ username, config, token }]
  } else {
    targets = await listEnabledPushUsers()
    if (!targets.length) {
      // 仍更新已读，避免堆积
      for (const id of ids) seenSet.add(id)
      await saveSeenIds([...seenSet])
      return { ok: true, skipped: true, reason: '没有已开启推送的用户', fetched: list.length, newCount: fresh.length, pushed: 0 }
    }
  }

  let totalPushed = 0
  const allErrors = []
  for (const user of targets) {
    const matched = filterItemsForUser(fresh, user.config)
    const { pushed, errors } = await pushItemsToUser(user.token, matched)
    totalPushed += pushed
    allErrors.push(...errors.map((m) => `${user.username}: ${m}`))
    await saveUserPushConfig(user.username, {
      lastRunAt: new Date().toISOString(),
      lastResult: {
        ok: errors.length === 0,
        fetched: list.length,
        newCount: fresh.length,
        matched: matched.length,
        pushed,
        mode: user.config?.mode || 'all',
        errors: errors.slice(0, 3),
      },
    })
  }

  for (const id of ids) seenSet.add(id)
  await saveSeenIds([...seenSet])

  return {
    ok: allErrors.length === 0,
    fetched: list.length,
    newCount: fresh.length,
    pushed: totalPushed,
    userCount: targets.length,
    errors: allErrors.slice(0, 8),
  }
}
