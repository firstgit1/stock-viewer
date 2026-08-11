<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login, register } from '../api/auth'

const route = useRoute()
const router = useRouter()

const mode = ref('login') // login | register
const username = ref('')
const password = ref('')
const password2 = ref('')
const loading = ref(false)
const error = ref('')

const isRegister = computed(() => mode.value === 'register')
const title = computed(() => (isRegister.value ? '注册' : '登录'))
const hint = computed(() =>
  isRegister.value ? '填写用户名和密码创建账号（用户名不可重复）' : '输入用户名和密码后继续使用看板',
)

function switchMode(next) {
  mode.value = next
  error.value = ''
  password2.value = ''
}

async function onSubmit() {
  error.value = ''
  const u = username.value.trim()
  const p = password.value
  if (!u || !p) {
    error.value = '请输入用户名和密码'
    return
  }
  if (isRegister.value) {
    if (p !== password2.value) {
      error.value = '两次输入的密码不一致'
      return
    }
  }

  loading.value = true
  try {
    if (isRegister.value) await register(u, p)
    else await login(u, p)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/ladder'
    await router.replace(redirect || '/ladder')
  } catch (e) {
    error.value = e?.message || (isRegister.value ? '注册失败' : '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <form class="login-panel" @submit.prevent="onSubmit">
      <h1>{{ title }}</h1>
      <p class="hint">{{ hint }}</p>

      <label>
        <span>用户名</span>
        <input v-model="username" type="text" autocomplete="username" autofocus />
      </label>

      <label>
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
        />
      </label>

      <label v-if="isRegister">
        <span>确认密码</span>
        <input v-model="password2" type="password" autocomplete="new-password" />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button type="submit" :disabled="loading">
        {{ loading ? (isRegister ? '注册中…' : '登录中…') : title }}
      </button>

      <p class="switch">
        <template v-if="isRegister">
          已有账号？
          <button type="button" class="link" @click="switchMode('login')">去登录</button>
        </template>
        <template v-else>
          还没有账号？
          <button type="button" class="link" @click="switchMode('register')">去注册</button>
        </template>
      </p>
    </form>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
}

.login-panel {
  width: min(100%, 380px);
  padding: 28px 24px 24px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(27, 36, 48, 0.92);
  box-shadow: var(--shadow);
  display: grid;
  gap: 14px;
}

h1 {
  margin: 0;
  font-size: 1.45rem;
  letter-spacing: 0.04em;
}

.hint {
  margin: -6px 0 4px;
  color: var(--muted);
  font-size: 0.92rem;
}

label {
  display: grid;
  gap: 6px;
}

label span {
  color: var(--muted);
  font-size: 0.88rem;
}

label input {
  width: 100%;
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
}

button[type='submit'] {
  height: 42px;
  margin-top: 4px;
}

.switch {
  margin: 2px 0 0;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}

.link {
  background: transparent;
  color: var(--accent-hover);
  padding: 0;
  height: auto;
  font-weight: 600;
}

.link:hover {
  background: transparent;
  text-decoration: underline;
}
</style>
