<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  fetchLadderDay,
  formatPct,
  formatYi,
  inputToYyyymmdd,
  toYyyymmdd,
  yyyymmddToInput,
} from '../api/stock'

const dateInput = ref(yyyymmddToInput(toYyyymmdd(new Date('2026-08-11'))))
const loading = ref(false)
const error = ref('')
const payload = ref(null)
const expanded = ref('')
const keyword = ref('')

const day = computed(() => payload.value?.dates?.[0] ?? null)
const boards = computed(() => day.value?.boards ?? [])
const themes = computed(() => day.value?.primaryThemeStats ?? [])
const emotion = computed(() => day.value?.emotionMetrics ?? null)
const meta = computed(() => payload.value?.meta ?? null)

const promotionRows = computed(() => {
  const stats = emotion.value?.promotionStats
  if (!stats) return []
  return [
    { key: '1to2', label: '1进2', ...stats['1to2'] },
    { key: '2to3', label: '2进3', ...stats['2to3'] },
    { key: '3to4', label: '3进4', ...stats['3to4'] },
    { key: 'high', label: '高位晋级', ...stats.high },
  ].filter((x) => x && typeof x.rate === 'number')
})

const filteredBoards = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return boards.value
  return boards.value
    .map((board) => ({
      ...board,
      stocks: (board.stocks || []).filter((s) => {
        const hay = [
          s.name,
          s.code,
          s.primary_theme,
          s.industry,
          s.reason_type,
          s.high_days,
          s.auto_position,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      }),
    }))
    .filter((b) => b.stocks.length)
})

async function load() {
  const ymd = inputToYyyymmdd(dateInput.value)
  if (!/^\d{8}$/.test(ymd)) {
    error.value = '请选择有效日期'
    return
  }

  loading.value = true
  error.value = ''
  expanded.value = ''
  try {
    payload.value = await fetchLadderDay(ymd)
    if (!payload.value?.dates?.length) {
      error.value = '该日期暂无天梯数据'
    }
  } catch (e) {
    payload.value = null
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function toggle(code) {
  expanded.value = expanded.value === code ? '' : code
}

function shiftDay(delta) {
  const base = new Date(dateInput.value || yyyymmddToInput(toYyyymmdd()))
  base.setDate(base.getDate() + delta)
  dateInput.value = yyyymmddToInput(toYyyymmdd(base))
  load()
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>涨停天梯</h1>
        <p>接口 /api/ladder/day/{YYYYMMDD}，按连板高度展示当日涨停梯队</p>
      </div>
      <form class="toolbar" @submit.prevent="load">
        <button type="button" class="ghost" @click="shiftDay(-1)">前一日</button>
        <input v-model="dateInput" type="date" />
        <button type="button" class="ghost" @click="shiftDay(1)">后一日</button>
        <button type="submit" :disabled="loading">{{ loading ? '加载中…' : '查询' }}</button>
      </form>
    </div>

    <p class="status" :class="{ error: !!error }">
      <template v-if="error">{{ error }}</template>
      <template v-else-if="loading">加载中…</template>
      <template v-else-if="day">
        {{ payload.dateRange }} · {{ day.dayOfWeek }} · 涨停 {{ day.totalStocks }} 只 ·
        封板率相关 pauseRatio={{ day.pauseRatio }}
      </template>
    </p>

    <template v-if="day">
      <section class="stats">
        <article class="stat">
          <div class="label">涨停家数</div>
          <div class="value up">{{ day.totalStocks }}</div>
        </article>
        <article class="stat">
          <div class="label">最高连板</div>
          <div class="value up">{{ boards[0]?.level ?? '-' }}板</div>
        </article>
        <article class="stat">
          <div class="label">题材数</div>
          <div class="value">{{ themes.length }}</div>
        </article>
        <article class="stat">
          <div class="label">实时数据</div>
          <div class="value">{{ meta?.hasRealtimeData ? '有' : '无' }}</div>
        </article>
      </section>

      <section v-if="promotionRows.length" class="panel block">
        <div class="block-head">
          <h2>晋级率</h2>
          <span class="muted">对比前一交易日 {{ emotion?.prevDate }}</span>
        </div>
        <div class="promo-grid">
          <div v-for="row in promotionRows" :key="row.key" class="promo">
            <div class="promo-label">{{ row.label }}</div>
            <div class="promo-rate up">{{ row.rate }}%</div>
            <div class="muted">{{ row.promoted }}/{{ row.base }}</div>
          </div>
        </div>
      </section>

      <section v-if="themes.length" class="panel block">
        <div class="block-head">
          <h2>主线题材</h2>
          <span class="muted">按涨停数量排序</span>
        </div>
        <div class="theme-grid">
          <div v-for="t in themes" :key="t.theme" class="theme">
            <div class="theme-top">
              <strong>{{ t.theme }}</strong>
              <span class="tag hot">{{ t.limitUpCount }} 只</span>
            </div>
            <div class="muted">最高 {{ t.maxContinueNum }} 连板</div>
            <div class="samples">
              <span v-for="s in (t.sampleStocks || []).slice(0, 4)" :key="s.code">
                {{ s.name }}
                <em class="up">{{ s.continueNum }}</em>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="block">
        <div class="block-head inline">
          <h2>连板梯队</h2>
          <input
            v-model="keyword"
            type="search"
            class="filter"
            placeholder="筛选名称/代码/题材/原因…"
          />
        </div>

        <div v-if="!filteredBoards.length" class="panel empty">没有匹配的</div>

        <div v-for="board in filteredBoards" :key="board.level" class="panel ladder-level">
          <div class="level-head">
            <div class="level-badge">{{ board.level }} 板</div>
            <span class="muted">{{ board.stocks.length }} 只</span>
          </div>

          <div class="stock-list">
            <article
              v-for="stock in board.stocks"
              :key="stock.code"
              class="stock"
              @click="toggle(stock.code)"
            >
              <div class="stock-main">
                <div class="name-row">
                  <strong>{{ stock.name }}</strong>
                  <code>{{ stock.code }}</code>
                  <span v-if="stock.auto_position" class="tag hot">{{ stock.auto_position }}</span>
                  <span v-if="stock.limit_up_type" class="tag">{{ stock.limit_up_type }}</span>
                </div>
                <div class="meta-row">
                  <span class="up">{{ stock.change || formatPct(stock.change_rate) }}</span>
                  <span>{{ stock.price || (stock.latest + '元') }}</span>
                  <span>{{ stock.high_days }}</span>
                  <span>{{ stock.primary_theme || stock.industry }}</span>
                  <span>封单 {{ stock.limitAmount || formatYi(stock.order_amount) }}</span>
                  <span>成交 {{ stock.tradeAmount || formatYi(stock.trading_amount) }}</span>
                  <span>首封 {{ stock.first_limit_up_time_text || '-' }}</span>
                </div>
                <div v-if="stock.reason_type" class="reason-type">{{ stock.reason_type }}</div>
              </div>

              <div v-if="expanded === stock.code" class="detail" @click.stop>
                <div class="detail-grid">
                  <div><span class="muted">换手</span>{{ formatPct(stock.turnover_rate) }}</div>
                  <div><span class="muted">实际换手</span>{{ formatPct(stock.actual_turnover_rate) }}</div>
                  <div><span class="muted">流通市值</span>{{ formatYi(stock.currency_value) }}</div>
                  <div><span class="muted">实际流通</span>{{ formatYi(stock.actual_currency_value) }}</div>
                  <div><span class="muted">开板次数</span>{{ stock.open_num ?? '-' }}</div>
                  <div><span class="muted">连板数</span>{{ stock.continue_num ?? '-' }}</div>
                  <div><span class="muted">末封</span>{{ stock.last_limit_up_time_text || '-' }}</div>
                  <div><span class="muted">题材标签</span>{{ stock.kpl_theme_tag_text || '-' }}</div>
                </div>
                <pre v-if="stock.reason_info" class="reason">{{ stock.reason_info }}</pre>
                <p v-if="stock.main_business" class="biz muted">主营：{{ stock.main_business }}</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text);
}

.ghost:hover {
  background: rgba(255, 255, 255, 0.04);
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
}

.stat .label {
  color: var(--muted);
  font-size: 0.85rem;
}

.stat .value {
  margin-top: 6px;
  font-size: 1.55rem;
  font-weight: 750;
}

.block {
  margin-bottom: 16px;
  padding: 16px;
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.block-head.inline {
  margin-bottom: 14px;
}

.block-head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.filter {
  width: min(320px, 100%);
}

.promo-grid,
.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.promo,
.theme {
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.promo-label,
.theme-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.promo-rate {
  margin: 8px 0 2px;
  font-size: 1.4rem;
  font-weight: 750;
}

.samples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  font-size: 0.85rem;
}

.samples em {
  font-style: normal;
  margin-left: 2px;
}

.ladder-level {
  padding: 0;
  overflow: hidden;
  margin-bottom: 12px;
}

.level-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.16);
}

.level-badge {
  min-width: 54px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--up-soft);
  color: #ff8f82;
  font-weight: 700;
  text-align: center;
}

.stock {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}

.stock:last-child { border-bottom: 0; }
.stock:hover { background: rgba(255, 255, 255, 0.025); }

.name-row,
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
}

.name-row strong {
  font-size: 1.02rem;
}

.meta-row {
  margin-top: 6px;
  color: var(--muted);
  font-size: 0.86rem;
}

.reason-type {
  margin-top: 6px;
  color: #d7c39a;
  font-size: 0.86rem;
}

.detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 12px;
  font-size: 0.88rem;
}

.detail-grid .muted {
  display: block;
  margin-bottom: 2px;
  font-size: 0.78rem;
}

.reason {
  margin: 12px 0 0;
  padding: 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.22);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 0.86rem;
  line-height: 1.65;
  color: #d5dde6;
}

.biz {
  margin: 10px 0 0;
  font-size: 0.84rem;
}

@media (max-width: 900px) {
  .stats,
  .promo-grid,
  .theme-grid,
  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .page-head .toolbar {
    width: 100%;
  }

  .page-head .toolbar input[type='date'] {
    flex: 1 1 100%;
    min-width: 0;
  }

  .page-head .toolbar .ghost,
  .page-head .toolbar button[type='submit'] {
    flex: 1;
    min-height: 42px;
  }

  .block-head.inline {
    flex-direction: column;
    align-items: stretch;
  }

  .filter {
    width: 100%;
  }

  .meta-row {
    gap: 6px 10px;
    font-size: 0.8rem;
  }
}

@media (max-width: 560px) {
  .stats,
  .promo-grid,
  .theme-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
