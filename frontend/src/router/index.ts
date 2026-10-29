import { createRouter, createWebHistory } from 'vue-router';

/** 首期固定注册平台三项默认功能，应用菜单由布局页根据后端结果动态渲染。 */
export default createRouter({ history: createWebHistory(), routes: [
  { path: '/login', component: () => import('../core/login/Login.vue') },
  { path: '/', component: () => import('../core/layout/Layout.vue'), children: [
    { path: '', redirect: '/settings' },
    { path: 'settings', component: () => import('../platform/settings/Settings.vue') },
    { path: 'store', component: () => import('../platform/store/Store.vue') },
    { path: 'ai', component: () => import('../platform/ai/Ai.vue') },
    { path: 'devices', component: () => import('../platform/store/DevicePlaceholder.vue') },
  ] },
] });
