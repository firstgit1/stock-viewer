<script setup>
import { onMounted, ref } from 'vue'
import { FEATURE_DEFS } from '../api/feature-defs'
import { fetchFeatures, updateFeatures } from '../api/features'
import { fetchPushConfig, runPushNow, savePushConfig, testPush } from '../api/push'
import { toast } from '../composables/toast'

const features = ref(Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])))
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')

const pushLoading = ref(true)
const pushSaving = ref(false)
const pushBusy = ref(false)
const pushEnabled = ref(false)
const pushTokenInput = ref('')
const pushHasToken = ref(false)
const pushTokenMasked = ref('')
const pushLastRunAt = ref('')
const pushLastResult = ref(null)

async function load() {
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
    const config = await fetchPushConfig()
    pushEnabled.value = Boolean(config.enabled)
    pushHasToken.value = Boolean(config.hasToken)
    pushTokenMasked.value = config.tokenMasked || ''
    pushLastRunAt.value = config.lastRunAt || ''
    pushLastResult.value = config.lastResult || null
  } catch (e) {
    toast.error(e?.message || '推送配置加载失败')
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

async function savePush() {
  if (pushSaving.value) return
  pushSaving.value = true
  try {
    const payload = { enabled: pushEnabled.value }
    if (pushTokenInput.value.trim()) payload.token = pushTokenInput.value.trim()
    const config = await savePushConfig(payload)
    pushEnabled.value = Boolean(config.enabled)
    pushHasToken.value = Boolean(config.hasToken)
    pushTokenMasked.value = config.tokenMasked || ''
    pushTokenInput.value = ''
    pushLastRunAt.value = config.lastRunAt || ''
    pushLastResult.value = config.lastResult || null
    toast.success('推送配置已保存')
  } catch (e) {
    toast.error(e?.message || '保存失败')
  } finally {
    pushSaving.value = false
  }
}

async function onTestPush() {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    const payload = {}
    if (pushTokenInput.value.trim()) payload.token = pushTokenInput.value.trim()
    const data = await testPush(payload)
    toast.success(data.message || '测试已发送')
  } catch (e) {
    toast.error(e?.message || '测试失败')
  } finally {
    pushBusy.value = false
  }
}

async function onRunNow() {
  if (pushBusy.value) return
  pushBusy.value = true
  try {
    const data = await runPushNow()
    const result = data.result || {}
    pushLastRunAt.value = data.config?.lastRunAt || pushLastRunAt.value
    pushLastResult.value = result
    if (result.bootstrapped) toast.success(result.message || '已初始化')
    else toast.success(`检查完成：新 ${result.newCount || 0} 条，推送 ${result.pushed || 0} 条`)
  } catch (e) {
    toast.error(e?.message || '执行失败')
  } finally {
    pushBusy.value = false
  }
}

onMounted(async () => {
  await Promise.all([load(), loadPush()])
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>管理后台</h1>
        <p class="muted">功能开关与微信推送配置。</p>
      </div>
    </div>

    <p v-if="loading || loadError" class="status" :class="{ error: !!loadError }">
      <template v-if="loadError">{{ loadError }}</template>
      <template v-else>加载中…</template>
    </p>

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

    <h2 class="section-title">微信推送（PushPlus）</h2>
    <p class="section-desc">
      当前规则：每条新电报都推送。首次「立即检查」只做初始化，不会把历史消息刷屏。
    </p>

    <section class="panel push-panel" :class="{ dim: pushLoading }">
      <label class="field">
        <span>PushPlus Token</span>
        <input
          v-model="pushTokenInput"
          type="password"
          autocomplete="off"
          :placeholder="pushHasToken ? `已保存：${pushTokenMasked}（留空则不修改）` : '粘贴你的用户 Token'"
        />
      </label>

      <div class="push-row">
        <div class="meta">
          <h3>启用自动推送</h3>
          <p>开启后，定时任务会检查新电报并推送到微信。</p>
        </div>
        <div class="control">
          <span class="state" :class="{ on: pushEnabled }">
            {{ pushEnabled ? '已开启' : '已关闭' }}
          </span>
          <button
            type="button"
            class="switch"
            :class="{ on: pushEnabled }"
            :disabled="pushLoading || pushSaving"
            :aria-pressed="pushEnabled"
            @click="pushEnabled = !pushEnabled"
          >
            <span class="knob" />
          </button>
        </div>
      </div>

      <div class="actions">
        <button type="button" :disabled="pushSaving || pushBusy" @click="savePush">
          {{ pushSaving ? '保存中…' : '保存配置' }}
        </button>
        <button type="button" class="ghost" :disabled="pushBusy" @click="onTestPush">
          发送测试
        </button>
        <button type="button" class="ghost" :disabled="pushBusy" @click="onRunNow">
          立即检查
        </button>
      </div>

      <p class="push-meta">
        <template v-if="pushLastRunAt">上次检查：{{ pushLastRunAt }}</template>
        <template v-else>尚未执行过检查</template>
        <template v-if="pushLastResult">
          · 结果：推送 {{ pushLastResult.pushed ?? 0 }} 条
          <template v-if="pushLastResult.bootstrapped">（已初始化）</template>
        </template>
      </p>
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
  margin: 18px 0 8px;
  font-size: 1.15rem;
}

.section-desc {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.9rem;
}

.panel {
  position: relative;
  margin-bottom: 18px;
}

.switch-list {
  display: grid;
  gap: 12px;
}

.switch-list.dim,
.push-panel.dim {
  opacity: 0.55;
  pointer-events: none;
}

.switch-row,
.push-row {
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

.switch:disabled {
  opacity: 1;
  cursor: wait;
}

.knob {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  display: block;
}

.push-panel {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(27, 36, 48, 0.72);
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  color: var(--muted);
  font-size: 0.88rem;
}

.field input {
  width: 100%;
}

.push-row {
  padding: 14px 0 0;
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.actions .ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text);
}

.actions .ghost:hover {
  background: rgba(255, 255, 255, 0.04);
}

.push-meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
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
  .switch-row,
  .push-row {
    flex-direction: column;
    align-items: stretch;
  }

  .control {
    justify-content: space-between;
  }
}
</style>
