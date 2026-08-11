<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchCailianTelegraph, formatUnixTime } from '../api/stock'

const loading = ref(false)
const error = ref('')
const list = ref([])
const onlyImportant = ref(false)
const countInput = ref(100)
const lastCount = ref(100)

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

const importantCount = computed(() => list.value.filter(isImportant).length)
const displayList = computed(() =>
  onlyImportant.value ? list.value.filter(isImportant) : list.value,
)

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
        <label class="count-field">
          一次查询
          <input
            v-model.number="countInput"
            type="number"
            min="1"
            max="10000"
            step="10"
            title="失焦或回车后查询"
            @keyup.enter="onCountCommit"
            @blur="onCountCommit"
          />
          <span>条</span>
        </label>
        <label class="filter">
          <input v-model="onlyImportant" type="checkbox" />
          仅看标红（重要）
        </label>
        <button type="button" :disabled="loading" @click="load">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </div>

    <p class="status" :class="{ error: !!error }">
      <template v-if="error">{{ error }}</template>
      <template v-else-if="loading">加载中…</template>
      <template v-else-if="onlyImportant">
        重要 {{ displayList.length }} 条（全部 {{ list.length }} 条中筛出）
      </template>
      <template v-else>共 {{ list.length }} 条，其中重要 {{ importantCount }} 条</template>
    </p>

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
            <span v-for="sub in item.subjects" :key="sub.subject_id" class="tag">
              {{ sub.subject_name }}
            </span>
          </div>
        </div>
      </article>
      <div v-if="!loading && !displayList.length" class="empty">
        {{ onlyImportant ? '当前没有标红重要电报' : '暂无电报' }}
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
  background: rgba(62, 168, 196, 0.14);
  color: #7ed7f2;
  border: 1px solid #4eb6d4;
  font-size: 0.82rem;
  font-weight: 600;
}

@media (max-width: 560px) {
  .item {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
