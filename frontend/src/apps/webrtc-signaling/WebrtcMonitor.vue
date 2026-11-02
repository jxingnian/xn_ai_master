<template>
  <el-card v-loading="loading" shadow="never">
    <template #header><div class="toolbar"><span>实时通话监控</span><el-button @click="load">刷新</el-button></div></template>
    <el-statistic title="进行中会话" :value="summary.active || 0" />
    <el-divider />
    <el-table :data="summary.totals || []" border><el-table-column prop="status" label="状态" /><el-table-column prop="count" label="数量" /></el-table>
  </el-card>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'; import http from '../../api/http';
const loading = ref(false); const summary = ref<any>({}); let timer: number | undefined;
async function load() { loading.value = true; try { const { data } = await http.get('/webrtc-signaling/monitor/summary'); summary.value = data; } finally { loading.value = false; } }
onMounted(() => { load(); timer = window.setInterval(load, 10000); }); onUnmounted(() => { if (timer) window.clearInterval(timer); });
</script>
<style scoped>.toolbar{display:flex;justify-content:space-between;align-items:center}</style>
