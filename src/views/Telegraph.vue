<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchCailianTelegraph, formatUnixTime } from '../api/stock'

const loading = ref(false)
const error = ref('')
const list = ref([])
const onlyImportant = ref(false)
const countInput = ref(100)
const lastCount = ref(100)
const selectedTag = ref('') // subject_name
const searchText = ref('')
const appliedSearch = ref('')

function normalizeCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 100
  return Math.min(10000, Math.max(1, Math.round(n)))
}

async function load({ force = true } = {}) {
  const count = normalizeCount(countInput.value)
  countInput.value = count
  if (!force && count === lastCount.value) return
  if (loading.value) return

  loading.value = true
  error.value = ''
  selectedTag.value = ''
  searchText.value = ''
  appliedSearch.value = ''
  try {
    list.value = await fetchCailianTelegraph(count)
    lastCount.value = count
  } catch (e) {
    error.value = e.message || '加载失败'
    list.value = []
  } finally {
    loading.value = false
  }
}

function onCountCommit() {
  load({ force: false })
}

function onSearch() {
  appliedSearch.value = searchText.value.trim()
}

function clearSearch() {
  searchText.value = ''
  appliedSearch.value = ''
}

function stockText(stock) {
  const pct = stock.RiseRange
  const sign = pct > 0 ? '+' : ''
  const pctText = pct == null ? '' : ` ${sign}${Number(pct).toFixed(2)}%`
  return `${stock.name}${pctText}`
}

function stockClass(stock) {
  const pct = Number(stock.RiseRange)
  if (pct > 0) return 'up'
  if (pct < 0) return 'down'
  return ''
}

/** 财联社重要电报：level 为 A/B（与 recommend=1 对应） */
function isImportant(item) {
  const level = String(item?.level || '').toUpperCase()
  return level === 'A' || level === 'B' || item?.recommend === 1
}

function itemHasTag(item, tag) {
  if (!tag) return true
  return (item.subjects || []).some((s) => s?.subject_name === tag)
}

function itemMatchesSearch(item, q) {
  if (!q) return true
  const hay = [
    item.title,
    item.brief,
    item.content,
    ...(item.subjects || []).map((s) => s?.subject_name),
    ...(item.stock_list || []).map((s) => s?.name || s?.StockID),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function toggleTag(name) {
  selectedTag.value = selectedTag.value === name ? '' : name
}

const importantCount = computed(() => list.value.filter(isImportant).length)

/** 从本次查询结果聚合 subjects，按出现次数降序，约保留 1/10 条数的热门标签 */
const keywordTags = computed(() => {
  const map = new Map()
  for (const item of list.value) {
    for (const sub of item.subjects || []) {
      const name = String(sub?.subject_name || '').trim()
      if (!name) continue
      const prev = map.get(name)
      if (prev) prev.count += 1
      else map.set(name, { name, count: 1 })
    }
  }
  const limit = Math.max(1, Math.round(list.value.length / 10))
  const ranked = [...map.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'),
  )
  const top = ranked.slice(0, limit)
  const selected = selectedTag.value
  if (selected && !top.some((t) => t.name === selected)) {
    const extra = map.get(selected)
    if (extra) top.push(extra)
  }
  return top
})

const baseList = computed(() => {
  let rows = list.value
  if (onlyImportant.value) rows = rows.filter(isImportant)
  const q = appliedSearch.value.trim().toLowerCase()
  if (q) rows = rows.filter((item) => itemMatchesSearch(item, q))
  return rows
})

const displayList = computed(() => {
  const tag = selectedTag.value
  if (!tag) return baseList.value
  return baseList.value.filter((item) => itemHasTag(item, tag))
})

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>财联社电报</h1>
        <p>最新 {{ lastCount }} 条快讯</p>
      </div>
      <div class="toolbar">
        <div class="search-group">
          <input
            v-model="searchText"
            class="search-input"
            type="search"
            placeholder="搜索标题 / 内容 / 关键词 / 股票"
            @keyup.enter="onSearch"
          />
          <button type="button" class="search-btn" @click="onSearch">查询</button>
        </div>
        <label class="count-field">
          一次查询
          <input
            v-model.number="countInput"
            type="number"
            min="1"
            max="10000"
            step="10"
            title="失焦或回车后重新拉取"
            @keyup.enter="onCountCommit"
            @blur="onCountCommit"
          />
          <span>条</span>
        </label>
        <label class="filter">
          <input v-model="onlyImportant" type="checkbox" />
          仅看标红（重要）
        </label>
      </div>
    </div>

    <p class="status" :class="{ error: !!error }">
      <template v-if="error">{{ error }}</template>
      <template v-else-if="loading">加载中…</template>
      <template v-else-if="selectedTag || appliedSearch">
        筛选结果 {{ displayList.length }} 条
        <template v-if="selectedTag">（关键词「{{ selectedTag }}」）</template>
        <template v-if="appliedSearch">（搜索「{{ appliedSearch }}」）</template>
        <button
          v-if="selectedTag"
          type="button"
          class="clear-tag"
          @click="selectedTag = ''"
        >
          清除关键词
        </button>
        <button
          v-if="appliedSearch"
          type="button"
          class="clear-tag"
          @click="clearSearch"
        >
          清除搜索
        </button>
      </template>
      <template v-else-if="onlyImportant">
        重要 {{ displayList.length }} 条（全部 {{ list.length }} 条中筛出）
      </template>
      <template v-else>共 {{ list.length }} 条，其中重要 {{ importantCount }} 条</template>
    </p>

    <div v-if="keywordTags.length" class="tag-bar">
      <span class="tag-label">关键词</span>
      <div class="tag-list">
        <button
          v-for="tag in keywordTags"
          :key="tag.name"
          type="button"
          class="kw-tag"
          :class="{ active: selectedTag === tag.name }"
          @click="toggleTag(tag.name)"
        >
          {{ tag.name }}
          <em>{{ tag.count }}</em>
        </button>
      </div>
    </div>

    <div class="panel feed">
      <article
        v-for="item in displayList"
        :key="item.id"
        class="item"
        :class="{ important: isImportant(item) }"
      >
        <div class="time">{{ formatUnixTime(item.ctime || item.sort_score) }}</div>
        <div class="body">
          <h3 v-if="item.title">{{ item.title }}</h3>
          <p>{{ item.brief || item.content }}</p>
          <div v-if="item.stock_list?.length" class="stocks">
            <span
              v-for="s in item.stock_list"
              :key="s.StockID"
              class="stock"
              :class="stockClass(s)"
            >
              {{ stockText(s) }}
            </span>
          </div>
          <div v-if="item.subjects?.length" class="subjects">
            <button
              v-for="sub in item.subjects"
              :key="sub.subject_id"
              type="button"
              class="tag"
              :class="{ active: selectedTag === sub.subject_name }"
              @click="toggleTag(sub.subject_name)"
            >
              {{ sub.subject_name }}
            </button>
          </div>
        </div>
      </article>
      <div v-if="!loading && !displayList.length" class="empty">
        <template v-if="selectedTag || appliedSearch">当前筛选下没有匹配电报</template>
        <template v-else-if="onlyImportant">当前没有标红重要电报</template>
        <template v-else>暂无电报</template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.count-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  color: var(--muted);
  font-size: 0.9rem;
  white-space: nowrap;
  cursor: text;
}

.search-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  width: min(260px, 42vw);
  height: 42px;
}

.search-btn {
  height: 42px;
  padding: 0 16px;
  white-space: nowrap;
}

.count-field input {
  width: 3.2em;
  height: 1.6em;
  padding: 0 2px;
  border: 0;
  border-bottom: 1px solid #5f7388;
  border-radius: 0;
  background: transparent;
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
}

.count-field input:hover {
  border-bottom-color: #8aa0b5;
}

.count-field input:focus {
  border-bottom-color: #4eb6d4;
}

.count-field span {
  color: var(--muted);
}

.count-field input::-webkit-outer-spin-button,
.count-field input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}

.filter input {
  width: 16px;
  height: 16px;
  accent-color: #e85d4c;
  cursor: pointer;
}

.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.clear-tag {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.84rem;
}

.clear-tag:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}

.tag-bar {
  display: flex;
  gap: 10px 12px;
  align-items: flex-start;
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(27, 36, 48, 0.55);
}

.tag-label {
  flex-shrink: 0;
  margin-top: 5px;
  color: var(--muted);
  font-size: 0.86rem;
  white-space: nowrap;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.kw-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(140, 160, 180, 0.4);
  background: transparent;
  color: #9aa8b8;
  font-size: 0.84rem;
  font-weight: 400;
}

.kw-tag em {
  font-style: normal;
  color: #7f8c9c;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
}

.kw-tag:hover {
  border-color: rgba(126, 215, 242, 0.55);
  color: #b7e9f8;
}

.kw-tag:hover em {
  color: #8ecfe0;
}

.kw-tag.active {
  background: rgba(78, 182, 212, 0.42);
  border-color: #6fd0ec;
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 0 0 1px rgba(111, 208, 236, 0.25);
}

.kw-tag.active em {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 700;
}

.feed {
  padding: 0;
  overflow: hidden;
  background: #121820;
  border-color: #3a4656;
}

.item {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid #2f3a48;
}

.item:last-child {
  border-bottom: 0;
}

.item.important {
  background: rgba(232, 93, 76, 0.06);
}

.item.important .time,
.item.important .body h3,
.item.important .body p {
  color: #ff6b5c;
}

.time {
  padding-top: 2px;
  color: #d7e2ee;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  font-weight: 700;
}

.body h3 {
  margin: 0 0 6px;
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 750;
  line-height: 1.4;
}

.body p {
  margin: 0;
  color: #f0f4f8;
  font-size: 0.95rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.stocks,
.subjects {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.stock {
  padding: 3px 9px;
  border-radius: 6px;
  background: #2a3441;
  color: #eef3f8;
  font-size: 0.84rem;
  font-weight: 600;
}

.stock.up {
  background: rgba(232, 93, 76, 0.22);
  color: #ffb0a6;
}

.stock.down {
  background: rgba(63, 175, 122, 0.22);
  color: #8fe0b6;
}

.subjects .tag {
  padding: 3px 10px;
  background: transparent;
  color: #7ed7f2;
  border: 1px solid #4eb6d4;
  font-size: 0.82rem;
  font-weight: 600;
  border-radius: 6px;
}

.subjects .tag:hover {
  background: rgba(62, 168, 196, 0.12);
}

.subjects .tag.active {
  background: rgba(78, 182, 212, 0.42);
  color: #fff;
  border-color: #6fd0ec;
}

.empty {
  padding: 28px 18px;
  text-align: center;
  color: var(--muted);
}

@media (max-width: 560px) {
  .item {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .tag-bar {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
