import { createRouter, createWebHistory } from 'vue-router';

/** 首期固定注册平台三项默认功能，应用菜单由布局页根据后端结果动态渲染。 */
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/login', component: () => import('../core/login/Login.vue') },
  { path: '/', component: () => import('../core/layout/Layout.vue'), children: [
    { path: '', redirect: '/settings' },
    { path: 'settings', component: () => import('../platform/settings/Settings.vue') },
    { path: 'store', component: () => import('../platform/store/Store.vue') },
    { path: 'ai', component: () => import('../platform/ai/Ai.vue') },
    { path: 'devices', component: () => import('../platform/store/DevicePlaceholder.vue') },
  ] },
] });

/** 页面级登录校验，防止没有令牌时先进入后台再连续触发受保护接口的 401。 */
router.beforeEach((to) => {
  const loggedIn = Boolean(localStorage.getItem('access_token'));
  if (to.path !== '/login' && !loggedIn) return '/login';
  if (to.path === '/login' && loggedIn) return '/';
  return true;
});

export default router;
