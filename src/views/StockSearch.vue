<script setup>
import { ref } from 'vue'
import StockDetailModal from '../components/StockDetailModal.vue'
import {
  fetchRealtimeStocks,
  fetchStockMinuteBatch,
  pickRealtimeQuote,
  searchStockBasic,
  toRealtimeCode,
} from '../api/stock'

const query = ref('')
const loading = ref(false)
const error = ref('')
const items = ref([])
const total = ref(0)

const selected = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const realtime = ref(null)
const minute = ref(null)

async function search() {
  const q = query.value.trim()
  if (!q) {
    error.value = '请输入查询关键词'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const data = await searchStockBasic(q, 20)
    items.value = data?.items ?? []
    total.value = data?.total ?? items.value.length
  } catch (e) {
    error.value = e.message || '查询失败'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function openDetail(item) {
  selected.value = item
  detailLoading.value = true
  detailError.value = ''
  realtime.value = null
  minute.value = null

  const tsCode = item.ts_code || item.symbol
  const rtCode = toRealtimeCode(tsCode)

  try {
    const [rtMap, minuteMap] = await Promise.all([
      fetchRealtimeStocks([rtCode || tsCode]),
      fetchStockMinuteBatch([tsCode]),
    ])

    realtime.value = pickRealtimeQuote(
      rtMap,
      rtCode,
      tsCode,
      item.symbol,
      item.ts_code,
    )

    minute.value =
      minuteMap[tsCode] ||
      minuteMap[item.ts_code] ||
      minuteMap[item.symbol] ||
      Object.values(minuteMap)[0] ||
      null

    if (!realtime.value && !minute.value) {
      detailError.value = '未获取到行情/分时数据'
    }
  } catch (e) {
    detailError.value = e.message || '详情加载失败'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  selected.value = null
  detailError.value = ''
  realtime.value = null
  minute.value = null
}

</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>搜索</h1>
        <p>搜索后点击，弹出详情：实时行情 + 分时图</p>
      </div>
      <form class="toolbar" @submit.prevent="search">
        <input v-model="query" type="search" placeholder="例如：中恒、600519、贵州茅台" />
        <button type="submit" :disabled="loading">{{ loading ? '查询中…' : '查询' }}</button>
      </form>
    </div>

    <p class="status" :class="{ error: !!error }">
      <template v-if="error">{{ error }}</template>
      <template v-else-if="loading">查询中…</template>
      <template v-else-if="items.length || total">找到 {{ total }} 条结果（点击打开详情）</template>
      <template v-else>输入关键词后点击查询</template>
    </p>

    <div class="panel table-wrap desktop-only">
      <table v-if="items.length">
        <thead>
          <tr>
            <th>TS代码</th>
            <th>名称</th>
            <th>代码</th>
            <th>市场</th>
            <th>交易所</th>
            <th>行业</th>
            <th>地区</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.ts_code || item._id"
            @click="openDetail(item)"
          >
            <td><code>{{ item.ts_code }}</code></td>
            <td>{{ item.name }}</td>
            <td>{{ item.symbol }}</td>
            <td>{{ item.market }}</td>
            <td>{{ item.exchange }}</td>
            <td>{{ item.industry }}</td>
            <td>{{ item.area }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">{{ loading ? '加载中…' : '暂无数据' }}</div>
    </div>

    <div class="mobile-list mobile-only">
      <button
        v-for="item in items"
        :key="item.ts_code || item._id"
        type="button"
        class="stock-card"
        @click="openDetail(item)"
      >
        <div class="card-top">
          <strong>{{ item.name }}</strong>
          <code>{{ item.ts_code }}</code>
        </div>
        <div class="card-meta">
          <span>{{ item.market || '-' }}</span>
          <span>{{ item.industry || '-' }}</span>
          <span>{{ item.area || '-' }}</span>
        </div>
      </button>
      <div v-if="!items.length" class="panel empty">
        {{ loading ? '加载中…' : '暂无数据' }}
      </div>
    </div>

    <StockDetailModal
      v-if="selected"
      :stock="selected"
      :realtime="realtime"
      :minute="minute"
      :loading="detailLoading"
      :error="detailError"
      @close="closeDetail"
    />
  </div>
</template>

<style scoped>
.table-wrap {
  overflow: auto;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: rgba(47, 143, 102, 0.12);
}

.mobile-only {
  display: none;
}

.mobile-list {
  display: none;
  flex-direction: column;
  gap: 10px;
}

.stock-card {
  width: 100%;
  padding: 14px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  text-align: left;
}

.stock-card:hover {
  background: rgba(47, 143, 102, 0.12);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.card-top strong {
  font-size: 1.05rem;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.84rem;
}

@media (max-width: 768px) {
  .desktop-only {
    display: none;
  }

  .mobile-only,
  .mobile-list {
    display: flex;
  }
}
</style>
