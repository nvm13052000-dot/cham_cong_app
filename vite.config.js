import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/cham_cong_app/', // QUAN TRỌNG: Phải trùng tên với Repository bạn vừa tạo ở Bước 2
})