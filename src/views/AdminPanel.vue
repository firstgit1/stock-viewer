<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FEATURE_DEFS } from '../api/feature-defs'
import { fetchFeatures, updateFeatures } from '../api/features'

const features = ref(Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])))
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const error = ref('')

let saveTimer = 0
let saveGeneration = 0

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchFeatures({ force: true })
    features.value = { ...features.value, ...data.features }
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function toggle(key) {
  features.value = {
    ...features.value,
    [key]: !features.value[key],
  }
  error.value = ''
  message.value = '保存中…'
  scheduleSave()
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  // 连续点击先只改本地，停手后再统一提交，避免并发互相覆盖
  saveTimer = window.setTimeout(() => {
    saveTimer = 0
    flushSave()
  }, 320)
}

async function flushSave() {
  const generation = ++saveGeneration
  const snapshot = { ...features.value }
  saving.value = true
  try {
    await updateFeatures(snapshot)
    if (generation !== saveGeneration) return

    const drifted = FEATURE_DEFS.some((item) => features.value[item.key] !== snapshot[item.key])
    if (drifted) {
      scheduleSave()
      return
    }

    message.value = '已保存'
  } catch (e) {
    if (generation !== saveGeneration) return
    error.value = e?.message || '保存失败'
    message.value = ''
    await load()
  } finally {
    if (generation === saveGeneration) saving.value = false
  }
}

onMounted(load)

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  saveGeneration += 1
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>管理后台</h1>
        <p class="muted">全局功能开关：关闭后，普通用户进入对应菜单将看到「功能升级中」。</p>
      </div>
    </div>

    <p class="status" :class="{ error: !!error, ok: !error && message === '已保存' }">
      <template v-if="loading">加载中…</template>
      <template v-else-if="error">{{ error }}</template>
      <template v-else-if="message">{{ message }}</template>
      <template v-else>&nbsp;</template>
    </p>

    <section class="switch-list" :class="{ dim: loading }">
      <div v-for="item in FEATURE_DEFS" :key="item.key" class="switch-row">
        <div class="meta">
          <h2>{{ item.label }}</h2>
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
            :disabled="loading"
            :aria-pressed="features[item.key]"
            @click="toggle(item.key)"
          >
            <span class="knob" />
          </button>
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

.status.ok {
  color: var(--accent-hover);
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

.meta h2 {
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
