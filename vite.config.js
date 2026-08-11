import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // 允许局域网访问，手机可打开
    allowedHosts: true, // 允许 tunnel 域名访问
    port: 5173,
    open: true,
  },
})
