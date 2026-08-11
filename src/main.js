import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(router)

// 等首轮路由守卫（含登录校验）完成后再挂载，避免先闪一下业务页
router.isReady().then(() => {
  app.mount('#app')
})
