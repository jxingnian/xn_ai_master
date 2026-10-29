import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';

/** 前端入口挂载状态管理、路由和 Element Plus，确保页面组件共享同一套运行上下文。 */
createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app');
