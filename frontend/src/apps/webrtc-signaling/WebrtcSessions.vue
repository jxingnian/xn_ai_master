<template>
  <el-card shadow="never">
    <template #header><div class="toolbar"><span>通话记录</span><el-button type="primary" @click="load">刷新</el-button></div></template>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="sessionId" label="会话编号" min-width="230" />
      <el-table-column prop="deviceId" label="设备 ID" />
      <el-table-column prop="callType" label="类型" />
      <el-table-column label="状态"><template #default="{ row }"><el-tag :type="tagType(row.status)">{{ row.status }}</el-tag></template></el-table-column>
      <el-table-column prop="startedAt" label="开始时间" min-width="180" />
      <el-table-column label="操作" width="150"><template #default="{ row }"><el-button size="small" @click="show(row)">详情</el-button><el-button v-if="active(row.status)" size="small" type="danger" @click="terminate(row)">挂断</el-button></template></el-table-column>
    </el-table>
    <el-dialog v-model="dialog" title="通话详情" width="760px"><pre class="detail">{{ detail }}</pre></el-dialog>
  </el-card>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'; import { ElMessage, ElMessageBox } from 'element-plus'; import http from '../../api/http';
const rows = ref<any[]>([]); const loading = ref(false); const dialog = ref(false); const detail = ref('');
const active = (status: string) => ['created', 'ringing', 'connecting', 'connected'].includes(status);
const tagType = (status: string) => active(status) ? 'success' : status === 'failed' ? 'danger' : 'info';
async function load() { loading.value = true; try { const { data } = await http.get('/webrtc-signaling/sessions'); rows.value = data; } finally { loading.value = false; } }
async function show(row: any) { const { data } = await http.get(`/webrtc-signaling/sessions/${row.sessionId}`); const events = await http.get(`/webrtc-signaling/sessions/${row.sessionId}/events`); detail.value = JSON.stringify({ session: data, events: events.data }, null, 2); dialog.value = true; }
async function terminate(row: any) { await ElMessageBox.confirm('确定结束当前通话吗？', '确认'); await http.post(`/webrtc-signaling/sessions/${row.sessionId}/terminate`, { reason: 'admin_hangup' }); ElMessage.success('通话已结束'); await load(); }
onMounted(load);
</script>
<style scoped>.toolbar{display:flex;justify-content:space-between;align-items:center}.detail{white-space:pre-wrap;max-height:500px;overflow:auto}</style>
