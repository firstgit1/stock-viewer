import {
  getSeenIds,
  getUserPushConfig,
  listAllPushConfigs,
  listEnabledPushUsers,
  getPushStorageDiagnostics,
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
  if (level === 'A' || level === 'B') return true
  const recommend = item?.recommend
  if (recommend === 1 || recommend === '1' || recommend === true) return true
  const bold = item?.bold
  if (bold === 1 || bold === '1' || bold === true) return true
  return false
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
export async function runTelegraphPush({ username = '', force = false, skipBacklog = false } = {}) {
  const list = await fetchTelegraph()
  const ids = list.map(itemId).filter(Boolean)
  const seen = await getSeenIds()
  const seenSet = new Set(seen)

  if (skipBacklog) {
    for (const id of ids) seenSet.add(id)
    await saveSeenIds([...seenSet])
    return {
      ok: true,
      backlogSkipped: true,
      marked: ids.length,
      message: '已跳过积压，之后只推新电报',
    }
  }

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

  const freshBase = list
    .filter((item) => {
      const id = itemId(item)
      return id && !seenSet.has(id)
    })
    .reverse()

  // 定时任务遇到大量积压时直接跳过，避免补发旧电报（手动「立即推送」仍可补发）
  if (!force && !username && freshBase.length > 8) {
    for (const id of ids) seenSet.add(id)
    await saveSeenIds([...seenSet])
    return {
      ok: true,
      backlogSkipped: true,
      skippedCount: freshBase.length,
      marked: ids.length,
      message: '积压过多已自动跳过，之后只推新电报',
    }
  }

  // cron-job.org 约 30s 超时；每条推送含网络延迟，单轮最多推几条，剩余留给下次
  const MAX_PER_RUN = force ? 5 : 6
  // 管理员手动「立即推送」时：若没有新电报，补推最近几条方便验证通道
  const freshRaw =
    force && !freshBase.length && list.length ? [...list].slice(0, 5).reverse() : freshBase
  const fresh = freshRaw.slice(0, MAX_PER_RUN)
  const deferredCount = Math.max(0, freshRaw.length - fresh.length)

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
      const allPushUsers = await listAllPushConfigs()
      const diagnostics = await getPushStorageDiagnostics()
      // 没有可推送用户时不要标记已读，否则之后补开推送也补不回这些电报
      return {
        ok: true,
        skipped: true,
        reason: '没有已开启推送的用户',
        fetched: list.length,
        newCount: fresh.length,
        pushed: 0,
        pushUserCount: allPushUsers.length,
        enabledCount: allPushUsers.filter((u) => u.config.enabled).length,
        withTokenCount: allPushUsers.filter((u) => u.token).length,
        users: allPushUsers
          .filter((u) => u.config.enabled && u.token)
          .map((u) => ({ username: u.username, mode: u.config?.mode || 'all' })),
        diagnostics,
      }
    }
  }

  const modeSnapshot = targets.map((u) => ({
    username: u.username,
    mode: u.config?.mode || 'all',
  }))

  // 没有新电报时也返回当前生效规则，便于核对「仅重要」是否已写入线上
  if (!fresh.length) {
    return {
      ok: true,
      fetched: list.length,
      newCount: 0,
      processed: 0,
      deferred: 0,
      pushed: 0,
      userCount: targets.length,
      users: modeSnapshot,
      errors: [],
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

  // 只标记本轮已处理的电报为已读，未推完的下次继续（避免一次积压导致超时）
  for (const item of fresh) {
    const id = itemId(item)
    if (id) seenSet.add(id)
  }
  await saveSeenIds([...seenSet])

  return {
    ok: allErrors.length === 0,
    fetched: list.length,
    newCount: freshRaw.length,
    processed: fresh.length,
    deferred: deferredCount,
    pushed: totalPushed,
    userCount: targets.length,
    users: targets.map((u) => ({
      username: u.username,
      mode: u.config?.mode || 'all',
      matched: filterItemsForUser(fresh, u.config).length,
    })),
    errors: allErrors.slice(0, 8),
  }
}
