<template>
  <div class="mqtt-config">
    <h2>MQTT 配置</h2>
    <el-alert title="凤飞飞应用将使用这里选择的 MQTT 连接收发设备消息。" type="info" show-icon />
    <el-form :model="form" label-width="150px" class="form">
      <el-form-item label="MQTT 连接">
        <el-select v-model="form.mqttConnectionId" placeholder="请选择 MQTT 应用中的连接" style="width: 360px">
          <el-option v-for="item in connections" :key="item.id" :label="`${item.name} (${item.connectionCode})`" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="连接状态"><el-tag :type="config.connectionStatus === 'connected' ? 'success' : 'danger'">{{ config.connectionStatus === 'connected' ? '已连接' : '未连接' }}</el-tag></el-form-item>
      <el-form-item label="设备订阅主题"><el-input v-model="form.deviceTopic" style="width: 360px" /></el-form-item>
      <el-form-item label="指令发布主题"><el-input v-model="form.commandTopic" style="width: 360px" /></el-form-item>
      <el-form-item label="启用设备通信"><el-switch v-model="form.enabled" /></el-form-item>
      <el-form-item><el-button type="primary" :loading="saving" @click="save">保存配置</el-button><el-button @click="load">刷新状态</el-button></el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import http from '../../api/http';

const connections = ref<any[]>([]);
const saving = ref(false);
const config = reactive<any>({ connectionStatus: 'disconnected' });
// 主题不设置产品默认值，必须由后台管理员按设备产品实际主题填写。
const form = reactive<any>({ mqttConnectionId: null, deviceTopic: '', commandTopic: '', enabled: true });

async function load() {
  const [connectionResult, configResult] = await Promise.all([http.get('/feifei-devices/mqtt-config/connections'), http.get('/feifei-devices/mqtt-config')]);
  connections.value = connectionResult.data;
  Object.assign(config, configResult.data);
  Object.assign(form, { mqttConnectionId: configResult.data.mqttConnectionId, deviceTopic: configResult.data.deviceTopic, commandTopic: configResult.data.commandTopic, enabled: configResult.data.enabled });
}

async function save() {
  if (!form.mqttConnectionId) { ElMessage.error('请选择 MQTT 连接'); return; }
  saving.value = true;
  try { const { data } = await http.put('/feifei-devices/mqtt-config', form); Object.assign(config, data); ElMessage.success('MQTT 配置已保存'); } catch (error: any) { ElMessage.error(error.response?.data?.message || '保存 MQTT 配置失败'); } finally { saving.value = false; }
}

onMounted(() => { void load(); });
</script>

<style scoped>
.mqtt-config { padding: 20px; }
.form { margin-top: 24px; max-width: 650px; }
</style>
