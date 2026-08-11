<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">股票数据看板</div>
      <nav>
        <RouterLink to="/ladder">涨停天梯</RouterLink>
        <RouterLink to="/telegraph">财联社电报</RouterLink>
        <RouterLink to="/search">股票搜索</RouterLink>
      </nav>
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
}
</style>
