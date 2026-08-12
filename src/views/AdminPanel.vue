<script setup>
import { computed, onMounted, ref } from 'vue'
import { FEATURE_DEFS } from '../api/feature-defs'
import { fetchFeatures, updateFeatures } from '../api/features'
import { fetchPushUsers, runPushNow, saveUserPush } from '../api/push'
import { toast } from '../composables/toast'

const features = ref(Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])))
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')

const pushUsers = ref([])
const pushLoading = ref(true)
const pushBusy = ref(false)

const modalOpen = ref(false)
const modalMode = ref('edit') // edit | add
const modalUser = ref(null)
const modalToken = ref('')
const modalEnabled = ref(true)
const modalUsername = ref('')
const modalRule = ref('all')
const modalKeywords = ref('')

const modalTitle = computed(() =>
  modalMode.value === 'add' ? '添加推送用户' : `配置推送 · ${modalUser.value?.username || ''}`,
)

function statusText(user) {
  if (user.enabled && user.hasToken) return '可推送'
  if (user.hasToken) return '已关闭'
  return '未配置'
}

function statusClass(user) {
  if (user.enabled && user.hasToken) return 'ok'
  if (user.hasToken) return 'off'
  return 'empty'
}

function ruleText(user) {
  const mode = user?.mode || 'all'
  if (mode === 'important') return '仅重要'
  if (mode === 'keywords') {
    const kws = user.keywords || []
    return kws.length ? `关键词（${kws.slice(0, 2).join('、')}${kws.length > 2 ? '…' : ''}）` : '关键词'
  }
  return '全部'
}

function formatTime(iso) {
  if (!iso) return '—'
  return String(iso).slice(0, 19).replace('T', ' ')
}

function lastPushCount(user) {
  const n = user?.lastResult?.pushed
  if (n === 0 || n === '0') return '0'
  if (n == null || n === '') return '—'
  return String(n)
}

async function loadFeatures() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchFeatures({ force: true })
    features.value = { ...features.value, ...data.features }
  } catch (e) {
    loadError.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadPush() {
  pushLoading.value = true
  try {
    pushUsers.value = await fetchPushUsers()
  } catch (e) {
    toast.error(e?.message || '加载推送用户失败')
  } finally {
    pushLoading.value = false
  }
}

async function toggle(key) {
  if (loading.value || saving.value) return

  const prev = { ...features.value }
  const next = {
    ...features.value,
    [key]: !features.value[key],
  }
  features.value = next
  saving.value = true

  try {
    const data = await updateFeatures(next)
    features.value = { ...features.value, ...data.features }
    toast.success('已保存')
  } catch (e) {
    features.value = prev
    toast.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function upsertLocalUser(user) {
  const idx = pushUsers.value.findIndex(
    (x) => x.username.toLowerCase() === user.username.toLowerCase(),
  )
  if (idx >= 0) pushUsers.value[idx] = user
  else pushUsers.value.push(user)
  pushUsers.value.sort((a, b) => a.username.localeCompare(b.username, 'zh'))
}

function openConfig(user) {
  modalMode.value = 'edit'
  modalUser.value = user
  modalUsername.value = user.username
  modalToken.value = ''
  modalEnabled.value = Boolean(user.enabled)
  modalRule.value = user.mode || 'all'
  modalKeywords.value = (user.keywords || []).join('，')
  modalOpen.value = true
}

function openAdd() {
  modalMode.value = 'add'
  modalUser.value = null
  modalUsername.value = ''
  modalToken.value = ''
  modalEnabled.value = true
  modalRule.value = 'all'
  modalKeywords.value = ''
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalUser.value = null
  modalToken.value = ''
  modalUsername.value = ''
  modalRule.value = 'all'
  modalKeywords.value = ''
}

async function saveModal() {
  if (pushBusy.value) return
  const username =
    modalMode.value === 'add' ? modalUsername.value.trim() : modalUser.value?.username
  if (!username) {
    toast.error('请填写用户名')
    return
  }
  const token = modalToken.value.trim()
  if (modalMode.value === 'add' && !token) {
    toast.error('请填写 Token')
    return
  }
  if (modalRule.value === 'keywords' && !modalKeywords.value.trim()) {
    toast.error('关键词模式请至少填写一个关键词')
    return
  }

  pushBusy.value = true
  try {
    const payload = {
      username,
      enabled: modalEnabled.value,
      mode: modalRule.value,
      keywords: modalKeywords.value,
    }
    if (token) payload.token = token
    const saved = await saveUserPush(payload)
    upsertLocalUser(saved)
    toast.success(`已保存 ${saved.username}`)
    closeModal()
  } catch (e) {
    toast.error(e?.message || '保存失败')
  } finally {
    pushBusy.value = false
  }
}

async function toggleEnabled(user) {
  if (pushBusy.value) return
  if (!user.hasToken && !user.enabled) {
    openConfig(user)
    toast.info('请先配置 Token')
    return
  }
  pushBusy.value = true
  try {
    const saved = await saveUserPush({
      username: user.username,
      enabled: !user.enabled,
    })
    upsertLocalUser(saved)
    toast.success(saved.enabled ? `已开启 ${saved.username}` : `已关闭 ${saved.username}`)
  } catch (e) {
    toast.error(e?.message || '操作失败')
  } finally {
    pushBusy.value = false
  }
}

async function onPushAll() {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    const data = await runPushNow({})
    const result = data.result || {}
    if (result.bootstrapped) toast.success(result.message || '已初始化，之后才推新电报')
    else if (result.skipped) toast.info(result.reason || '已跳过')
    else {
      toast.success(
        `推送完成：新 ${result.newCount || 0} 条，发出 ${result.pushed || 0} 条，覆盖 ${result.userCount || 0} 人`,
      )
    }
    await loadPush()
  } catch (e) {
    toast.error(e?.message || '推送失败')
  } finally {
    pushBusy.value = false
  }
}

onMounted(() => {
  loadFeatures()
  loadPush()
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>管理后台</h1>
        <p class="muted">功能开关与微信推送均由管理员配置。</p>
      </div>
    </div>

    <p v-if="loading || loadError" class="status" :class="{ error: !!loadError }">
      <template v-if="loadError">{{ loadError }}</template>
      <template v-else>加载中…</template>
    </p>

    <h2 class="section-title">微信推送</h2>
    <div class="toolbar">
      <button type="button" class="primary" :disabled="pushBusy || pushLoading" @click="onPushAll">
        立即推送
      </button>
      <button type="button" class="ghost" :disabled="pushBusy || pushLoading" @click="loadPush">
        刷新列表
      </button>
      <button type="button" class="ghost" :disabled="pushBusy || pushLoading" @click="openAdd">
        添加用户
      </button>
    </div>

    <p v-if="pushLoading" class="status">推送用户加载中…</p>

    <section v-else class="panel push-panel">
      <div class="push-table" :class="{ dim: pushBusy }">
        <table class="user-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>Token</th>
              <th>状态</th>
              <th>规则</th>
              <th>上次推送</th>
              <th>推送条数</th>
              <th class="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!pushUsers.length">
              <td colspan="7" class="empty">暂无用户，可点击「添加用户」或等新账号注册后刷新。</td>
            </tr>
            <tr v-for="user in pushUsers" :key="user.username">
              <td class="name">{{ user.username }}</td>
              <td class="mono">{{ user.hasToken ? user.tokenMasked : '—' }}</td>
              <td>
                <span class="badge" :class="statusClass(user)">{{ statusText(user) }}</span>
              </td>
              <td class="rule">{{ ruleText(user) }}</td>
              <td class="time">{{ formatTime(user.lastRunAt) }}</td>
              <td class="count">{{ lastPushCount(user) }}</td>
              <td class="ops">
                <button type="button" class="link" :disabled="pushBusy" @click="openConfig(user)">
                  配置
                </button>
                <button type="button" class="link" :disabled="pushBusy" @click="toggleEnabled(user)">
                  {{ user.enabled ? '关闭' : '开启' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <h2 class="section-title">功能开关</h2>
    <section class="panel">
      <div class="switch-list" :class="{ dim: loading }">
        <div v-for="item in FEATURE_DEFS" :key="item.key" class="switch-row">
          <div class="meta">
            <h3>{{ item.label }}</h3>
            <p>{{ item.description }}</p>
          </div>
          <div class="control">
            <span class="state" :class="{ on: features[item.key] }">
              {{ features[item.key] ? '已开启' : '已关闭' }}
            </span>
            <button
              type="button"
              class="switch"
              :class="{ on: features[item.key] }"
              :disabled="loading || saving"
              :aria-pressed="features[item.key]"
              @click="toggle(item.key)"
            >
              <span class="knob" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="saving" class="overlay" aria-live="polite" aria-busy="true">
        <div class="overlay-card">
          <span class="spinner" />
          <p>保存中，请稍候…</p>
        </div>
      </div>
    </section>

    <div v-if="modalOpen" class="modal-mask" @click.self="closeModal">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="modalTitle">
        <div class="modal-head">
          <h3>{{ modalTitle }}</h3>
          <button type="button" class="icon-close" aria-label="关闭" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <label v-if="modalMode === 'add'" class="field">
            <span>用户名</span>
            <input v-model="modalUsername" type="text" placeholder="如 ceshi123" autocomplete="off" />
          </label>
          <label class="field">
            <span>{{ modalMode === 'add' ? 'PushPlus Token' : '新 Token（留空则不修改）' }}</span>
            <input
              v-model="modalToken"
              type="text"
              autocomplete="off"
              :placeholder="modalMode === 'add' ? '用户提供的 Token' : '粘贴新 Token'"
            />
          </label>
          <p v-if="modalMode === 'edit' && modalUser?.hasToken" class="token-hint">
            当前 Token：{{ modalUser.tokenMasked }}
          </p>
          <label class="field">
            <span>推送规则</span>
            <select v-model="modalRule">
              <option value="all">全部新电报</option>
              <option value="important">仅重要（A/B 级或加红）</option>
              <option value="keywords">关键词匹配</option>
            </select>
          </label>
          <label v-if="modalRule === 'keywords'" class="field">
            <span>关键词（逗号分隔，命中任一即推送）</span>
            <input
              v-model="modalKeywords"
              type="text"
              autocomplete="off"
              placeholder="如：涨停，新能源，芯片"
            />
          </label>
          <label class="check">
            <input v-model="modalEnabled" type="checkbox" />
            开启推送
          </label>
        </div>
        <div class="modal-foot">
          <button type="button" class="ghost" :disabled="pushBusy" @click="closeModal">取消</button>
          <button type="button" class="primary" :disabled="pushBusy" @click="saveModal">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status {
  min-height: 1.4em;
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 0.9rem;
}

.status.error {
  color: var(--danger);
}

.section-title {
  margin: 8px 0 10px;
  font-size: 1.15rem;
}

.panel {
  position: relative;
  margin-bottom: 22px;
}

.push-panel {
  overflow: hidden;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 12px;
}

.primary,
.ghost,
.link {
  cursor: pointer;
}

.primary,
.ghost {
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 0.92rem;
}

.primary {
  border: 1px solid rgba(57, 166, 117, 0.8);
  background: rgba(47, 143, 102, 0.9);
  color: #fff;
}

.ghost {
  border: none;
  background: transparent;
  color: var(--muted);
  padding: 8px 4px;
}

.ghost:hover:not(:disabled) {
  color: var(--text);
}

.primary:disabled,
.ghost:disabled,
.link:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.push-table {
  width: 100%;
}

.push-table.dim,
.switch-list.dim {
  opacity: 0.55;
  pointer-events: none;
}

.user-table {
  width: 100%;
  border-collapse: collapse;
}

.user-table th,
.user-table td {
  padding: 12px 10px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  vertical-align: middle;
}

.user-table th {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
}

.user-table tbody tr:last-child td {
  border-bottom: none;
}

.name {
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.86rem;
  color: var(--muted);
}

.time,
.count,
.rule {
  font-size: 0.86rem;
  color: var(--muted);
  white-space: nowrap;
}

.rule {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ops {
  white-space: nowrap;
  text-align: right;
}

.ops .link {
  margin-left: 10px;
  border: none;
  background: none;
  color: #7ed7f2;
  padding: 0;
  font-size: 0.88rem;
}

.ops .link:first-child {
  margin-left: 0;
}

.empty {
  text-align: center;
  color: var(--muted);
  padding: 28px 14px !important;
}

.badge {
  font-size: 0.82rem;
  color: var(--muted);
  letter-spacing: 0.02em;
}

.badge.ok {
  color: #7dcea0;
}

.badge.off {
  color: #d4a84b;
}

.badge.empty {
  color: var(--muted);
}

.field {
  display: grid;
  gap: 6px;
  font-size: 0.86rem;
  color: var(--muted);
}

.field input,
.field select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(12, 18, 26, 0.85);
  color: var(--text);
  padding: 9px 12px;
}

.field select {
  appearance: none;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 0.9rem;
}

.token-hint {
  margin: -4px 0 0;
  color: var(--muted);
  font-size: 0.84rem;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(6, 10, 16, 0.72);
  backdrop-filter: blur(3px);
}

.modal {
  width: min(440px, 100%);
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #1b2430;
  box-shadow: var(--shadow);
}

.modal-head,
.modal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

.modal-head {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.modal-head h3 {
  margin: 0;
  font-size: 1rem;
}

.icon-close {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

.modal-body {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.modal-foot {
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.switch-list {
  display: grid;
  gap: 12px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(27, 36, 48, 0.72);
}

.meta h3 {
  margin: 0 0 4px;
  font-size: 1.05rem;
}

.meta p {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.state {
  color: var(--muted);
  font-size: 0.88rem;
  min-width: 3.5em;
  text-align: right;
}

.state.on {
  color: var(--accent-hover);
}

.switch {
  width: 52px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #2a3340;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  transition: 0.18s ease;
}

.switch.on {
  background: rgba(47, 143, 102, 0.85);
  border-color: rgba(57, 166, 117, 0.8);
  justify-content: flex-end;
}

.knob {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: rgba(10, 14, 20, 0.55);
  backdrop-filter: blur(2px);
}

.overlay-card {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 18px 22px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(27, 36, 48, 0.96);
  box-shadow: var(--shadow);
}

.overlay-card p {
  margin: 0;
  color: var(--text);
  font-size: 0.92rem;
}

.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.18);
  border-top-color: var(--accent-hover);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .switch-row {
    flex-direction: column;
    align-items: stretch;
  }

  .control {
    justify-content: space-between;
  }
}
</style>
