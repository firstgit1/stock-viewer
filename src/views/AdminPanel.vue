<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { FEATURE_DEFS } from '../api/feature-defs'
import { fetchFeatures, updateFeatures } from '../api/features'
import { toast } from '../composables/toast'

const features = ref(Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])))
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')

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

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>管理后台</h1>
        <p class="muted">全局功能开关。微信推送请到「推送设置」由每个用户自行配置 Token。</p>
      </div>
    </div>

    <p v-if="loading || loadError" class="status" :class="{ error: !!loadError }">
      <template v-if="loadError">{{ loadError }}</template>
      <template v-else>加载中…</template>
    </p>

    <section class="notice">
      <p>
        微信推送已改为用户级配置：每个账号登录后进入
        <RouterLink to="/push-settings">推送设置</RouterLink>
        ，填写自己的 PushPlus Token。
      </p>
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

.notice {
  margin: 0 0 16px;
  padding: 14px 16px;
  border: 1px solid rgba(78, 182, 212, 0.35);
  border-radius: 12px;
  background: rgba(62, 168, 196, 0.1);
  color: #cfeef8;
  font-size: 0.92rem;
}

.notice p {
  margin: 0;
}

.notice a {
  color: #7ed7f2;
  text-decoration: underline;
}

.section-title {
  margin: 8px 0 10px;
  font-size: 1.15rem;
}

.panel {
  position: relative;
}

.switch-list {
  display: grid;
  gap: 12px;
}

.switch-list.dim {
  opacity: 0.55;
  pointer-events: none;
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
