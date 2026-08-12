import { createRouter, createWebHistory } from 'vue-router'
import { fetchMe } from '../api/auth'
import FeatureGate from '../components/FeatureGate.vue'
import AdminPanel from '../views/AdminPanel.vue'
import Login from '../views/Login.vue'
import PushSettings from '../views/PushSettings.vue'

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
    {
      path: '/ladder',
      name: 'ladder',
      component: FeatureGate,
      props: { feature: 'ladder' },
      meta: { title: '涨停天梯', feature: 'ladder' },
    },
    {
      path: '/telegraph',
      name: 'telegraph',
      component: FeatureGate,
      props: { feature: 'telegraph' },
      meta: { title: '财联社电报', feature: 'telegraph' },
    },
    {
      path: '/search',
      name: 'search',
      component: FeatureGate,
      props: { feature: 'search' },
      meta: { title: '搜索', feature: 'search' },
    },
    {
      path: '/severe-abnormal',
      name: 'severeAbnormal',
      component: FeatureGate,
      props: { feature: 'severeAbnormal' },
      meta: { title: '严重异动', feature: 'severeAbnormal' },
    },
    {
      path: '/push-settings',
      name: 'pushSettings',
      component: PushSettings,
      meta: { title: '推送设置' },
    },
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
  document.title = `${to.meta.title || '数据'} · 数据看板`
})

export default router
