<template>
  <div>
    <div class="toolbar"><h3>连接配置</h3><el-button type="primary" @click="openCreate">新增连接</el-button></div>
    <el-table :data="connections" v-loading="loading" border>
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="connectionCode" label="编码" />
      <el-table-column label="地址"><template #default="{ row }">{{ row.protocol }}://{{ row.host }}:{{ row.port }}{{ row.path || '' }}</template></el-table-column>
      <el-table-column label="状态"><template #default="{ row }"><el-tag :type="row.status === 'enabled' ? 'success' : 'info'">{{ row.status === 'enabled' ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="230"><template #default="{ row }"><el-button size="small" @click="test(row)">测试</el-button><el-button size="small" @click="openEdit(row)">编辑</el-button><el-button size="small" type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
    </el-table>
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑连接' : '新增连接'" width="560px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="连接编码"><el-input v-model="form.connectionCode" :disabled="editing" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="协议"><el-select v-model="form.protocol"><el-option v-for="item in ['mqtt', 'mqtts', 'ws', 'wss']" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="主机"><el-input v-model="form.host" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="form.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="WebSocket路径"><el-input v-model="form.path" placeholder="/mqtt" /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password placeholder="留空表示不修改" /></el-form-item>
        <el-form-item label="客户端ID"><el-input v-model="form.clientId" /></el-form-item>
        <el-form-item label="Keep Alive"><el-input-number v-model="form.keepAlive" :min="1" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.statusEnabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import http from '../../api/http';

const connections = ref<any[]>([]); const loading = ref(false); const dialogVisible = ref(false); const editing = ref<any>(null);
const form = reactive<any>({ connectionCode: '', name: '', protocol: 'mqtt', host: '', port: 1883, path: '', username: '', password: '', clientId: '', keepAlive: 60, statusEnabled: false });

async function load() { loading.value = true; try { const { data } = await http.get('/mqtt/connections'); connections.value = data; } finally { loading.value = false; } }
function reset(row?: any) { Object.assign(form, { connectionCode: row?.connectionCode || '', name: row?.name || '', protocol: row?.protocol || 'mqtt', host: row?.host || '', port: row?.port || 1883, path: row?.path || '', username: row?.username || '', password: '', clientId: row?.clientId || '', keepAlive: row?.keepAlive || 60, statusEnabled: row?.status === 'enabled' }); }
function openCreate() { editing.value = null; reset(); dialogVisible.value = true; }
function openEdit(row: any) { editing.value = row; reset(row); dialogVisible.value = true; }
async function save() { const payload = { ...form, status: form.statusEnabled ? 'enabled' : 'disabled' }; delete payload.statusEnabled; if (!payload.password) delete payload.password; try { if (editing.value) await http.patch(`/mqtt/connections/${editing.value.id}`, payload); else await http.post('/mqtt/connections', payload); ElMessage.success('保存成功'); dialogVisible.value = false; await load(); } catch (error: any) { ElMessage.error(error.response?.data?.message || '保存失败'); } }
async function test(row: any) { try { const { data } = await http.post(`/mqtt/connections/${row.id}/test`); data.success ? ElMessage.success(data.message) : ElMessage.error(data.message); await load(); } catch (error: any) { ElMessage.error(error.response?.data?.message || '连接测试失败'); } }
async function remove(row: any) { await ElMessageBox.confirm(`确定删除连接“${row.name}”吗？`, '确认操作'); await http.delete(`/mqtt/connections/${row.id}`); ElMessage.success('删除成功'); await load(); }
onMounted(load);
</script>

<style scoped>.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.toolbar h3{margin:0}</style>
