<template>
  <el-card v-loading="loading" shadow="never">
    <template #header><span>STUN/TURN 配置</span></template>
    <el-alert title="设备信令通过 MQTT 传输，STUN/TURN 只负责 WebRTC 连接建立。未配置 TURN 时，无法直连的网络环境不能建立通话。" type="info" :closable="false" show-icon />
    <el-form :model="form" label-width="130px" class="form">
      <el-form-item label="配置名称"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="设备产品编码"><el-input v-model="form.productCode" placeholder="例如 xn_device" /></el-form-item>
      <el-form-item label="下发主题模板"><el-input v-model="form.commandTopicTemplate" placeholder="xn/{productCode}/{deviceId}/webrtc_command" /></el-form-item>
      <el-form-item label="上报主题模板"><el-input v-model="form.signalTopicTemplate" placeholder="xn/{productCode}/{deviceId}/webrtc_signal" /></el-form-item>
      <el-form-item label="STUN 地址"><el-input v-model="form.stunText" type="textarea" :rows="3" placeholder="每行一个，例如 stun:stun.l.google.com:19302" /></el-form-item>
      <el-form-item label="TURN 地址"><el-input v-model="form.turnText" type="textarea" :rows="3" placeholder="每行一个，例如 turns:turn.example.com:5349" /></el-form-item>
      <el-form-item label="TURN 用户名"><el-input v-model="form.turnUsername" autocomplete="off" /></el-form-item>
      <el-form-item label="TURN 密钥"><el-input v-model="form.turnSecret" type="password" show-password autocomplete="new-password" placeholder="留空表示不修改" /></el-form-item>
      <el-form-item label="启用配置"><el-switch v-model="form.enabled" /></el-form-item>
      <el-form-item><el-button type="primary" @click="save">保存配置</el-button></el-form-item>
    </el-form>
    <el-descriptions v-if="config" :column="2" border>
      <el-descriptions-item label="TURN 状态">{{ config.turnConfigured ? '已配置' : '未配置' }}</el-descriptions-item>
      <el-descriptions-item label="最后更新时间">{{ config.updatedAt || '-' }}</el-descriptions-item>
    </el-descriptions>
  </el-card>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import http from '../../api/http';
const loading = ref(false); const config = ref<any>(null);
const form = reactive({ name: '', productCode: 'xn_device', commandTopicTemplate: 'xn/{productCode}/{deviceId}/webrtc_command', signalTopicTemplate: 'xn/{productCode}/{deviceId}/webrtc_signal', stunText: '', turnText: '', turnUsername: '', turnSecret: '', enabled: true });
async function load() { loading.value = true; try { const { data } = await http.get('/webrtc-signaling/config'); config.value = data; Object.assign(form, { name: data.name || '', productCode: data.productCode || 'xn_device', commandTopicTemplate: data.commandTopicTemplate || 'xn/{productCode}/{deviceId}/webrtc_command', signalTopicTemplate: data.signalTopicTemplate || 'xn/{productCode}/{deviceId}/webrtc_signal', stunText: (data.stunUrls || []).join('\n'), turnText: (data.turnUrls || []).join('\n'), enabled: data.enabled !== false }); } finally { loading.value = false; } }
async function save() { try { await http.put('/webrtc-signaling/config', { name: form.name, productCode: form.productCode, commandTopicTemplate: form.commandTopicTemplate, signalTopicTemplate: form.signalTopicTemplate, stunUrls: form.stunText.split(/\r?\n/).map((v) => v.trim()).filter(Boolean), turnUrls: form.turnText.split(/\r?\n/).map((v) => v.trim()).filter(Boolean), turnUsername: form.turnUsername || undefined, turnSecret: form.turnSecret || undefined, enabled: form.enabled }); form.turnSecret = ''; ElMessage.success('配置已保存'); await load(); } catch (error: any) { ElMessage.error(error.response?.data?.message || '保存失败'); } }
onMounted(load);
</script>
<style scoped>.form{max-width:800px;margin-top:20px}.el-alert{margin-bottom:20px}</style>
