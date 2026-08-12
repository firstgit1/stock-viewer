<script setup>
import { onMounted, ref } from 'vue'
import { FEATURE_DEFS } from '../api/feature-defs'
import { fetchFeatures, updateFeatures } from '../api/features'
import { fetchPushUsers, runPushNow, saveUserPush, testUserPush } from '../api/push'
import { toast } from '../composables/toast'

const features = ref(Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])))
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')

const pushUsers = ref([])
const pushLoading = ref(true)
const pushBusy = ref(false)
const draftTokens = ref({})
const newUsername = ref('')
const newToken = ref('')

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
    const drafts = {}
    for (const u of pushUsers.value) drafts[u.username] = ''
    draftTokens.value = drafts
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

async function saveRow(user) {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    const payload = {
      username: user.username,
      enabled: user.enabled,
    }
    const token = String(draftTokens.value[user.username] || '').trim()
    if (token) payload.token = token
    const saved = await saveUserPush(payload)
    upsertLocalUser(saved)
    draftTokens.value[user.username] = ''
    toast.success(`已保存 ${user.username}`)
  } catch (e) {
    toast.error(e?.message || '保存失败')
  } finally {
    pushBusy.value = false
  }
}

async function addUser() {
  const username = newUsername.value.trim()
  const token = newToken.value.trim()
  if (!username) {
    toast.error('请填写用户名')
    return
  }
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    const saved = await saveUserPush({
      username,
      token: token || undefined,
      enabled: Boolean(token),
    })
    upsertLocalUser(saved)
    draftTokens.value[saved.username] = ''
    newUsername.value = ''
    newToken.value = ''
    toast.success(`已添加 ${saved.username}`)
  } catch (e) {
    toast.error(e?.message || '添加失败')
  } finally {
    pushBusy.value = false
  }
}

async function onTest(user) {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    const payload = { username: user.username }
    const token = String(draftTokens.value[user.username] || '').trim()
    if (token) payload.token = token
    const data = await testUserPush(payload)
    toast.success(data.message || '测试已发送')
  } catch (e) {
    toast.error(e?.message || '测试失败')
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
    <section class="panel push-panel">
      <p class="hint">
        让用户在
        <a href="https://www.pushplus.plus" target="_blank" rel="noreferrer">pushplus.plus</a>
        注册并拿到 Token，由你填写到下方。开启后点「立即推送」会把新电报发给所有已开启用户；以后可再改成自动推送。
      </p>

      <div class="push-actions">
        <button type="button" class="primary" :disabled="pushBusy || pushLoading" @click="onPushAll">
          立即推送
        </button>
        <button type="button" class="ghost" :disabled="pushBusy || pushLoading" @click="loadPush">
          刷新列表
        </button>
      </div>

      <p v-if="pushLoading" class="status">推送用户加载中…</p>

      <div v-else class="user-list" :class="{ dim: pushBusy }">
        <div v-for="user in pushUsers" :key="user.username" class="user-row">
          <div class="user-main">
            <strong>{{ user.username }}</strong>
            <span class="badge" :class="{ on: user.enabled && user.hasToken }">
              {{ user.enabled && user.hasToken ? '可推送' : user.hasToken ? '已关' : '未配置' }}
            </span>
          </div>
          <p class="token-meta">
            Token：{{ user.hasToken ? user.tokenMasked : '尚未填写' }}
            <template v-if="user.lastRunAt"> · 上次 {{ user.lastRunAt.slice(0, 19).replace('T', ' ') }}</template>
          </p>
          <label class="field">
            <span>更新 Token</span>
            <input
              v-model="draftTokens[user.username]"
              type="text"
              autocomplete="off"
              placeholder="留空表示不改"
            />
          </label>
          <div class="row-actions">
            <label class="check">
              <input v-model="user.enabled" type="checkbox" />
              开启推送
            </label>
            <button type="button" class="ghost" :disabled="pushBusy" @click="saveRow(user)">保存</button>
            <button type="button" class="ghost" :disabled="pushBusy" @click="onTest(user)">测试</button>
          </div>
        </div>

        <div class="user-row add-row">
          <strong>添加用户推送</strong>
          <div class="add-grid">
            <label class="field">
              <span>用户名</span>
              <input v-model="newUsername" type="text" placeholder="如 ceshi123" autocomplete="off" />
            </label>
            <label class="field">
              <span>PushPlus Token</span>
              <input v-model="newToken" type="text" placeholder="用户提供的 Token" autocomplete="off" />
            </label>
          </div>
          <div class="row-actions">
            <button type="button" class="primary" :disabled="pushBusy" @click="addUser">添加并保存</button>
          </div>
        </div>
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

.hint {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.55;
}

.hint a {
  color: #7ed7f2;
}

.push-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.primary,
.ghost {
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 0.92rem;
  cursor: pointer;
}

.primary {
  border: 1px solid rgba(57, 166, 117, 0.8);
  background: rgba(47, 143, 102, 0.9);
  color: #fff;
}

.ghost {
  border: 1px solid var(--line);
  background: rgba(27, 36, 48, 0.72);
  color: var(--text);
}

.primary:disabled,
.ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.user-list {
  display: grid;
  gap: 12px;
}

.user-list.dim,
.switch-list.dim {
  opacity: 0.55;
  pointer-events: none;
}

.user-row {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(27, 36, 48, 0.72);
}

.user-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge {
  font-size: 0.78rem;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--muted);
}

.badge.on {
  color: #9be7c0;
  border-color: rgba(57, 166, 117, 0.65);
  background: rgba(47, 143, 102, 0.18);
}

.token-meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 0.86rem;
  color: var(--muted);
}

.field input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(12, 18, 26, 0.85);
  color: var(--text);
  padding: 9px 12px;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 0.9rem;
}

.add-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr 1.4fr;
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

  .add-grid {
    grid-template-columns: 1fr;
  }
}
</style>
