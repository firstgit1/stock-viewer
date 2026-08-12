<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchExchangeMonitorList } from '../api/stock'

const loading = ref(false)
const error = ref('')
const list = ref([])
const stats = ref(null)
const keyword = ref('')
const expanded = ref('')

async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await fetchExchangeMonitorList('severe_abnormal')
    list.value = data.list
    stats.value = data.stats
  } catch (e) {
    error.value = e?.message || '加载失败'
    list.value = []
    stats.value = null
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter((item) => {
    const hay = [
      item.name,
      item.code,
      item.secucode,
      item.market_name,
      item.unusual_reason_type,
      item.unusual_reason,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
})

function toggle(id) {
  expanded.value = expanded.value === id ? '' : id
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>严重异动</h1>
        <p>交易所监控池 · 严重异常波动</p>
      </div>
      <div class="toolbar">
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索名称 / 代码 / 原因"
        />
        <button type="button" :disabled="loading" @click="load">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </div>

    <p class="status" :class="{ error: !!error }">
      <template v-if="error">{{ error }}</template>
      <template v-else-if="loading">加载中…</template>
      <template v-else>
        共 {{ filtered.length }} 条
        <template v-if="stats">
          （严重异动 {{ stats.severe_abnormal ?? '-' }} /
          风险提示 {{ stats.risk_warning ?? '-' }} /
          合计 {{ stats.total ?? '-' }}）
        </template>
      </template>
    </p>

    <div class="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>代码</th>
            <th>市场</th>
            <th>类型</th>
            <th>公告日</th>
            <th>监控期</th>
            <th>剩余</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in filtered" :key="item._id">
            <tr class="row" @click="toggle(item._id)">
              <td class="name">{{ item.name || '-' }}</td>
              <td class="code">{{ item.code || item.secucode || '-' }}</td>
              <td>{{ item.market_name || item.market || '-' }}</td>
              <td>
                <span class="tag">严重异常波动</span>
              </td>
              <td>{{ item.notice_date || '-' }}</td>
              <td class="range">
                {{ item.monitor_start_date || '-' }}
                ~
                {{ item.monitor_end_date || '-' }}
              </td>
              <td>
                <span class="remain" :class="{ urgent: Number(item.remaining_days) <= 2 }">
                  {{ item.remaining_days == null ? '-' : `${item.remaining_days}天` }}
                </span>
              </td>
            </tr>
            <tr v-if="expanded === item._id" class="detail-row">
              <td colspan="7">
                <div class="detail">
                  <p>
                    <strong>异动类型：</strong>
                    {{ item.unusual_reason_type || '-' }}
                  </p>
                  <p>
                    <strong>异动区间：</strong>
                    {{ item.abnormal_start_date || '-' }}
                    ~
                    {{ item.abnormal_end_date || '-' }}
                  </p>
                  <p>
                    <strong>公告说明：</strong>
                    {{ item.unusual_reason || '-' }}
                  </p>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="!loading && !filtered.length">
            <td colspan="7" class="empty">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th,
td {
  padding: 12px 10px;
  text-align: left;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
  font-size: 0.92rem;
}

th {
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
}

.row {
  cursor: pointer;
  transition: background 0.12s ease;
}

.row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.name {
  font-weight: 650;
  white-space: nowrap;
}

.code {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.range {
  white-space: nowrap;
  color: var(--muted);
  font-size: 0.88rem;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--up-soft);
  color: var(--up);
  font-size: 0.82rem;
  white-space: nowrap;
}

.remain {
  font-weight: 650;
}

.remain.urgent {
  color: var(--up);
}

.detail-row td {
  background: rgba(0, 0, 0, 0.16);
  padding: 0;
}

.detail {
  padding: 14px 14px 16px;
  display: grid;
  gap: 8px;
}

.detail p {
  margin: 0;
  color: var(--text);
  line-height: 1.55;
  font-size: 0.9rem;
}

.detail strong {
  color: var(--muted);
  font-weight: 600;
}

.empty {
  text-align: center;
  color: var(--muted);
  padding: 28px 10px;
}
</style>
