<script setup lang="ts">
import { onMounted, ref } from 'vue'; import { useRouter } from 'vue-router'; import http from '../../api/http';
const router = useRouter(); const menus = ref<any[]>([]);
onMounted(async () => { const { data } = await http.get('/menus'); menus.value = data; });
function logout() { localStorage.removeItem('access_token'); router.push('/login'); }
</script>
<template><el-container class="shell"><el-aside width="220px"><div class="brand">XN Platform</div><el-menu router><template v-for="menu in menus" :key="menu.path"><el-sub-menu v-if="menu.children?.length" :index="menu.path"><template #title>{{ menu.name }}</template><el-menu-item v-for="child in menu.children" :key="child.path" :index="child.path">{{ child.name }}</el-menu-item></el-sub-menu><el-menu-item v-else :index="menu.path">{{ menu.name }}</el-menu-item></template></el-menu></el-aside><el-container><el-header><span>设备管理后台</span><el-button link @click="logout">退出登录</el-button></el-header><el-main><router-view /></el-main></el-container></el-container></template>
<style scoped>.shell{min-height:100vh}.brand{font-size:20px;font-weight:700;padding:20px;color:#409eff}.el-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ebeef5}.el-main{background:#f5f7fa}</style>
