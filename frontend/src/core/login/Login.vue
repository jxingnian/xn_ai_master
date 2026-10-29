<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import http from '../../api/http';
const router = useRouter(); const loading = ref(false); const form = reactive({ username: 'admin', password: '' });
async function login() { loading.value = true; try { const { data } = await http.post('/auth/login', form); localStorage.setItem('access_token', data.accessToken); await router.push('/'); } catch { ElMessage.error('登录失败，请检查账号和密码'); } finally { loading.value = false; } }
</script>
<template><main class="login"><el-card class="box"><h1>设备管理后台</h1><p>最小基础平台 · 应用程序扩展</p><el-form @submit.prevent="login"><el-form-item><el-input v-model="form.username" placeholder="管理员账号" /></el-form-item><el-form-item><el-input v-model="form.password" type="password" show-password placeholder="管理员密码" /></el-form-item><el-button type="primary" native-type="submit" :loading="loading" style="width:100%">登录</el-button></el-form></el-card></main></template>
<style scoped>.login{min-height:100vh;display:grid;place-items:center;background:#f3f6fb}.box{width:360px}h1{margin-bottom:8px}p{color:#86909c;margin-top:0}</style>
