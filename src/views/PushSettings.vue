<script setup>
import { onMounted, ref } from 'vue'
import { fetchPushConfig, runPushNow, savePushConfig, testPush } from '../api/push'
import { toast } from '../composables/toast'

const loading = ref(true)
const saving = ref(false)
const busy = ref(false)
const enabled = ref(false)
const tokenInput = ref('')
const hasToken = ref(false)
const tokenMasked = ref('')
const lastRunAt = ref('')
const lastResult = ref(null)

async function load() {
  loading.value = true
  try {
    const config = await fetchPushConfig()
    enabled.value = Boolean(config.enabled)
    hasToken.value = Boolean(config.hasToken)
    tokenMasked.value = config.tokenMasked || ''
    lastRunAt.value = config.lastRunAt || ''
    lastResult.value = config.lastResult || null
  } catch (e) {
    toast.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const payload = { enabled: enabled.value }
    if (tokenInput.value.trim()) payload.token = tokenInput.value.trim()
    const config = await savePushConfig(payload)
    enabled.value = Boolean(config.enabled)
    hasToken.value = Boolean(config.hasToken)
    tokenMasked.value = config.tokenMasked || ''
    tokenInput.value = ''
    lastRunAt.value = config.lastRunAt || ''
    lastResult.value = config.lastResult || null
    toast.success('推送设置已保存')
  } catch (e) {
    toast.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onTest() {
  if (busy.value) return
  busy.value = true
  try {
    const payload = {}
    if (tokenInput.value.trim()) payload.token = tokenInput.value.trim()
    const data = await testPush(payload)
    toast.success(data.message || '测试已发送')
  } catch (e) {
    toast.error(e?.message || '测试失败')
  } finally {
    busy.value = false
  }
}

async function onRun() {
  if (busy.value) return
  busy.value = true
  try {
    const data = await runPushNow()
    const result = data.result || {}
    lastRunAt.value = data.config?.lastRunAt || lastRunAt.value
    lastResult.value = data.config?.lastResult || result
    if (result.bootstrapped) toast.success(result.message || '已初始化')
    else if (result.skipped) toast.info(result.reason || '已跳过')
    else toast.success(`检查完成：新 ${result.newCount || 0} 条，推送 ${result.pushed || 0} 条`)
  } catch (e) {
    toast.error(e?.message || '执行失败')
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>推送设置</h1>
        <p class="muted">填写你自己的 PushPlus Token，开启后可接收财联社电报微信提醒。</p>
      </div>
    </div>

    <section class="panel" :class="{ dim: loading }">
      <ol class="steps">
        <li>打开 <a href="https://www.pushplus.plus" target="_blank" rel="noreferrer">pushplus.plus</a>，微信扫码登录并完成实名</li>
        <li>复制「用户 Token」</li>
        <li>粘贴到下方，打开开关并保存</li>
        <li>先点「发送测试」，确认微信能收到</li>
      </ol>

      <label class="field">
        <span>PushPlus Token</span>
        <input
          v-model="tokenInput"
          type="password"
          autocomplete="off"
          :placeholder="hasToken ? `已保存：${tokenMasked}（留空则不修改）` : '粘贴你的用户 Token'"
        />
      </label>

      <div class="push-row">
        <div class="meta">
          <h2>启用推送</h2>
          <p>开启后，系统检查到新电报会推送到你的微信（当前规则：每条都推）。</p>
        </div>
        <div class="control">
          <span class="state" :class="{ on: enabled }">{{ enabled ? '已开启' : '已关闭' }}</span>
          <button
            type="button"
            class="switch"
            :class="{ on: enabled }"
            :disabled="loading || saving"
            :aria-pressed="enabled"
            @click="enabled = !enabled"
          >
            <span class="knob" />
          </button>
        </div>
      </div>

      <div class="actions">
        <button type="button" :disabled="saving || busy" @click="save">
          {{ saving ? '保存中…' : '保存设置' }}
        </button>
        <button type="button" class="ghost" :disabled="busy" @click="onTest">发送测试</button>
        <button type="button" class="ghost" :disabled="busy" @click="onRun">立即检查</button>
      </div>

      <p class="hint">
        <template v-if="lastRunAt">上次检查：{{ lastRunAt }}</template>
        <template v-else>尚未执行过检查</template>
        <template v-if="lastResult">
          · 推送 {{ lastResult.pushed ?? 0 }} 条
          <template v-if="lastResult.bootstrapped">（已初始化）</template>
        </template>
      </p>
    </section>
  </div>
</template>

<style scoped>
.panel {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(27, 36, 48, 0.72);
  display: grid;
  gap: 14px;
}

.panel.dim {
  opacity: 0.55;
  pointer-events: none;
}

.steps {
  margin: 0;
  padding-left: 1.2em;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.7;
}

.steps a {
  color: #7ed7f2;
  text-decoration: underline;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
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

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
}

@media (max-width: 640px) {
  .push-row {
    flex-direction: column;
    align-items: stretch;
  }

  .control {
    justify-content: space-between;
  }
}
</style>
