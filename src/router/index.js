import { createRouter, createWebHistory } from 'vue-router'
import LadderDay from '../views/LadderDay.vue'
import StockSearch from '../views/StockSearch.vue'
import Telegraph from '../views/Telegraph.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/ladder' },
    { path: '/ladder', name: 'ladder', component: LadderDay, meta: { title: '涨停天梯' } },
    { path: '/telegraph', name: 'telegraph', component: Telegraph, meta: { title: '财联社电报' } },
    { path: '/search', name: 'search', component: StockSearch, meta: { title: '股票搜索' } },
  ],
})

router.afterEach((to) => {
  document.title = `${to.meta.title || '股票数据'} · 股票数据看板`
})

export default router
