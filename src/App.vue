<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { clearCachedUser, fetchMe, getCachedUser, logout } from './api/auth'

const route = useRoute()
const router = useRouter()
const username = ref(getCachedUser()?.username || '')

const isLoginPage = computed(() => route.name === 'login')

watch(
  () => route.fullPath,
  async () => {
    if (isLoginPage.value) {
      username.value = ''
      return
    }
    const user = await fetchMe()
    username.value = user?.username || ''
  },
  { immediate: true },
)

async function onLogout() {
  await logout()
  clearCachedUser()
  username.value = ''
  await router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <header v-if="!isLoginPage" class="topbar">
      <div class="brand">股票数据看板</div>
      <div class="topbar-right">
        <nav>
          <RouterLink to="/ladder">涨停天梯</RouterLink>
          <RouterLink to="/telegraph">财联社电报</RouterLink>
          <RouterLink to="/search">股票搜索</RouterLink>
        </nav>
        <div class="userbox">
          <span v-if="username" class="user">{{ username }}</span>
          <button type="button" class="logout" @click="onLogout">退出</button>
        </div>
      </div>
    </header>
    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(16, 21, 28, 0.82);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 20;
}

.brand {
  font-weight: 750;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

nav {
  display: flex;
  gap: 8px;
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
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.user {
  color: var(--muted);
  font-size: 0.9rem;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 12px 12px 10px;
  }

  .brand {
    font-size: 0.98rem;
  }

  .topbar-right {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  nav {
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
    justify-content: space-between;
  }
}
</style>
