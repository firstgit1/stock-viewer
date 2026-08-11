import { createRouter, createWebHistory } from 'vue-router'
import { fetchMe } from '../api/auth'
import AdminPanel from '../views/AdminPanel.vue'
import LadderDay from '../views/LadderDay.vue'
import Login from '../views/Login.vue'
import StockSearch from '../views/StockSearch.vue'
import Telegraph from '../views/Telegraph.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/ladder' },
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { title: '登录', public: true },
    },
    { path: '/ladder', name: 'ladder', component: LadderDay, meta: { title: '涨停天梯' } },
    { path: '/telegraph', name: 'telegraph', component: Telegraph, meta: { title: '财联社电报' } },
    { path: '/search', name: 'search', component: StockSearch, meta: { title: '股票搜索' } },
    {
      path: '/admin',
      name: 'admin',
      component: AdminPanel,
      meta: { title: '管理后台', adminOnly: true },
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) {
    if (to.name === 'login') {
      const user = await fetchMe()
      if (user) return typeof to.query.redirect === 'string' ? to.query.redirect : '/ladder'
    }
    return true
  }

  const user = await fetchMe()
  if (!user) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  if (to.meta.adminOnly && !user.isAdmin) {
    return { path: '/ladder' }
  }

  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title || '股票数据'} · 数据看板`
})

export default router
