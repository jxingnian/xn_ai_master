import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/** 开发环境代理把前端请求转发到 NestJS，生产环境由 Nginx 负责同样的转发。 */
export default defineConfig({ plugins: [vue()], server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } } });
