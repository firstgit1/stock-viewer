<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchExchangeMonitorList } from '../api/stock'

const loading = ref(false)
const error = ref('')
const list = ref([])
const stats = ref(null)
const keyword = ref('')
const expanded = ref(new Set())

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
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function isExpanded(id) {
  return expanded.value.has(id)
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

    <div class="panel table-wrap desktop-only">
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
              <td class="market">{{ item.market_name || item.market || '-' }}</td>
              <td>
                <span class="tag">严重异常波动</span>
              </td>
              <td class="date">{{ item.notice_date || '-' }}</td>
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
            <tr v-if="isExpanded(item._id)" class="detail-row">
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

    <div class="card-list mobile-only">
      <p v-if="!loading && !filtered.length" class="empty-card">暂无数据</p>
      <article
        v-for="item in filtered"
        :key="`m-${item._id}`"
        class="stock-card"
        :class="{ open: isExpanded(item._id) }"
        @click="toggle(item._id)"
      >
        <div class="card-top">
          <div class="card-title">
            <h3>{{ item.name || '-' }}</h3>
            <span class="code">{{ item.code || item.secucode || '-' }}</span>
          </div>
          <span class="remain" :class="{ urgent: Number(item.remaining_days) <= 2 }">
            {{ item.remaining_days == null ? '-' : `剩 ${item.remaining_days} 天` }}
          </span>
        </div>
        <div class="card-meta">
          <span class="tag">严重异常波动</span>
          <span class="meta-item">{{ item.market_name || item.market || '-' }}</span>
          <span class="meta-item">公告 {{ item.notice_date || '-' }}</span>
        </div>
        <p class="card-range">
          监控期 {{ item.monitor_start_date || '-' }} ~ {{ item.monitor_end_date || '-' }}
        </p>
        <div v-if="isExpanded(item._id)" class="detail" @click.stop>
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
        <p class="card-hint">{{ isExpanded(item._id) ? '收起详情' : '点击查看详情' }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}

.desktop-only {
  display: block;
}

.mobile-only {
  display: none;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th,
td {
  padding: 13px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(132, 150, 168, 0.28);
  vertical-align: middle;
  font-size: 0.94rem;
  color: #eef3f8;
}

th {
  color: #c8d5e4;
  font-weight: 650;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.03);
}

.row {
  cursor: pointer;
  transition: background 0.12s ease;
}

.row:nth-child(4n + 1) {
  background: rgba(255, 255, 255, 0.015);
}

.row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.name {
  color: #ffffff;
  font-weight: 700;
  white-space: nowrap;
}

.code {
  font-variant-numeric: tabular-nums;
  color: #8ec5ff;
  font-weight: 600;
}

.market {
  color: #dce6f0;
}

.date,
.range {
  white-space: nowrap;
  color: #c3d0de;
  font-variant-numeric: tabular-nums;
}

.tag {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(255, 92, 82, 0.18);
  color: #ff8b82;
  border: 1px solid rgba(255, 120, 110, 0.35);
  font-size: 0.82rem;
  font-weight: 650;
  white-space: nowrap;
}

.remain {
  color: #f0c56d;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.remain.urgent {
  color: #ff7a6e;
}

.detail-row td {
  background: rgba(20, 28, 38, 0.92);
  padding: 0;
  border-bottom: 1px solid rgba(132, 150, 168, 0.28);
}

.detail {
  padding: 16px 14px 18px;
  display: grid;
  gap: 10px;
}

.detail p {
  margin: 0;
  color: #e8eef4;
  line-height: 1.6;
  font-size: 0.92rem;
}

.detail strong {
  color: #9ec5e8;
  font-weight: 650;
}

.empty {
  text-align: center;
  color: #b7c4d2;
  padding: 28px 10px;
}

.card-list {
  display: grid;
  gap: 10px;
}

.stock-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(27, 36, 48, 0.95);
  padding: 14px 14px 10px;
  cursor: pointer;
}

.stock-card.open {
  border-color: rgba(255, 120, 110, 0.35);
  background: rgba(32, 40, 52, 0.98);
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-title h3 {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 750;
  color: #fff;
  line-height: 1.3;
}

.card-title .code {
  font-size: 0.92rem;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.meta-item {
  color: #b7c4d2;
  font-size: 0.86rem;
}

.card-range {
  margin: 10px 0 0;
  color: #c3d0de;
  font-size: 0.86rem;
  font-variant-numeric: tabular-nums;
}

.stock-card .detail {
  margin-top: 12px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(12, 18, 26, 0.75);
  border: 1px solid rgba(132, 150, 168, 0.2);
}

.card-hint {
  margin: 10px 0 0;
  text-align: right;
  color: #7f91a4;
  font-size: 0.78rem;
}

.empty-card {
  margin: 0;
  text-align: center;
  color: #b7c4d2;
  padding: 28px 10px;
  border: 1px dashed var(--line);
  border-radius: 14px;
}

@media (max-width: 768px) {
  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: grid;
  }
}
</style>
