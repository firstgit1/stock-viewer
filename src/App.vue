<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { clearCachedUser, fetchMe, getCachedUser, logout } from './api/auth'
import ToastHost from './components/ToastHost.vue'

const route = useRoute()
const router = useRouter()
const username = ref(getCachedUser()?.username || '')
const isAdmin = ref(Boolean(getCachedUser()?.isAdmin))

const isLoginPage = computed(() => route.name === 'login')
const showChrome = computed(() => !isLoginPage.value && Boolean(username.value))

watch(
  () => route.fullPath,
  async () => {
    if (isLoginPage.value) {
      username.value = ''
      isAdmin.value = false
      return
    }
    const user = await fetchMe()
    username.value = user?.username || ''
    isAdmin.value = Boolean(user?.isAdmin)
  },
  { immediate: true },
)

async function onLogout() {
  await logout()
  clearCachedUser()
  username.value = ''
  isAdmin.value = false
  await router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <header v-if="showChrome" class="topbar">
      <nav>
        <RouterLink to="/ladder">涨停天梯</RouterLink>
        <RouterLink to="/telegraph">财联社电报</RouterLink>
        <RouterLink to="/search">搜索</RouterLink>
        <RouterLink to="/severe-abnormal">严重异动</RouterLink>
      </nav>
      <div class="brand">数据看板</div>
      <div class="userbox">
        <RouterLink v-if="isAdmin" to="/admin" class="admin-link">管理后台</RouterLink>
        <span v-if="username" class="user">
          {{ username }}
          <em v-if="isAdmin" class="role">管理员</em>
        </span>
        <button type="button" class="logout" @click="onLogout">退出</button>
      </div>
    </header>
    <RouterView />
    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(16, 21, 28, 0.82);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 20;
}

.brand {
  justify-self: center;
  font-weight: 750;
  letter-spacing: 0.04em;
  white-space: nowrap;
  text-align: center;
}

nav {
  justify-self: start;
  display: flex;
  gap: 8px;
  min-width: 0;
}

nav a {
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--muted);
  transition: 0.15s ease;
  white-space: nowrap;
}

nav a:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}

nav a.router-link-active {
  color: #fff;
  background: rgba(47, 143, 102, 0.22);
}

.userbox {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.admin-link {
  padding: 7px 11px;
  border-radius: 8px;
  color: var(--warn);
  border: 1px solid rgba(212, 162, 76, 0.35);
  white-space: nowrap;
  font-size: 0.9rem;
  transition: 0.15s ease;
}

.admin-link:hover {
  background: rgba(212, 162, 76, 0.12);
  color: #e4b96a;
}

.admin-link.router-link-active {
  color: #fff;
  background: rgba(212, 162, 76, 0.22);
  border-color: rgba(212, 162, 76, 0.5);
}

.user {
  color: var(--muted);
  font-size: 0.9rem;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.role {
  font-style: normal;
  font-size: 0.75rem;
  color: var(--warn);
  border: 1px solid rgba(212, 162, 76, 0.45);
  border-radius: 6px;
  padding: 1px 6px;
}

.logout {
  height: 34px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
  font-weight: 500;
}

.logout:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

@media (max-width: 768px) {
  .topbar {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 12px 12px 10px;
  }

  .brand {
    order: -1;
    justify-self: center;
    font-size: 0.98rem;
  }

  nav {
    justify-self: stretch;
    gap: 6px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 2px;
  }

  nav::-webkit-scrollbar {
    display: none;
  }

  nav a {
    flex: 0 0 auto;
    padding: 8px 10px;
    font-size: 0.88rem;
  }

  .userbox {
    justify-self: stretch;
    justify-content: space-between;
  }
}
</style>
