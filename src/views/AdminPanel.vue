<script setup>
import { onMounted, ref } from 'vue'
import { FEATURE_DEFS } from '../api/feature-defs'
import { fetchFeatures, updateFeatures } from '../api/features'

const features = ref(Object.fromEntries(FEATURE_DEFS.map((x) => [x.key, true])))
const loading = ref(true)
const savingKey = ref('')
const message = ref('')
const error = ref('')

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

async function toggle(key) {
  const next = !features.value[key]
  const prev = features.value[key]
  features.value = { ...features.value, [key]: next }
  savingKey.value = key
  message.value = ''
  error.value = ''
  try {
    const data = await updateFeatures({ [key]: next })
    features.value = { ...features.value, ...data.features }
    message.value = '已保存'
  } catch (e) {
    features.value = { ...features.value, [key]: prev }
    error.value = e?.message || '保存失败'
  } finally {
    savingKey.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>管理后台</h1>
        <p class="muted">全局功能开关：关闭后，普通用户进入对应菜单将看到「功能升级中」。</p>
      </div>
    </div>

    <p v-if="loading" class="status">加载中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>
    <p v-else-if="message" class="status ok">{{ message }}</p>

    <section v-if="!loading" class="switch-list">
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
            :disabled="savingKey === item.key"
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
