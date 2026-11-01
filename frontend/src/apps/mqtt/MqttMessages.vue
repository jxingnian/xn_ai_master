<template>
  <div class="message-monitor">
    <div class="toolbar">
      <el-input v-model="filters.topic" clearable placeholder="按主题过滤" @keyup.enter="loadMessages" />
      <el-select v-model="filters.direction" clearable placeholder="消息方向" @change="loadMessages">
        <el-option label="入站" value="inbound" />
        <el-option label="出站" value="outbound" />
      </el-select>
      <el-button type="primary" @click="loadMessages">刷新</el-button>
      <el-switch v-model="autoRefresh" active-text="实时刷新" />
    </div>

    <el-alert v-if="lastUpdated" :title="`最近更新：${lastUpdated}`" type="info" :closable="false" />
    <el-table :data="messages" border stripe height="650" empty-text="暂未收到 MQTT 消息">
      <el-table-column label="时间" width="180">
        <template #default="scope">{{ formatTime(scope.row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="direction" label="方向" width="80">
        <template #default="scope">
          <el-tag :type="scope.row.direction === 'inbound' ? 'success' : 'warning'">
            {{ scope.row.direction === 'inbound' ? '入站' : '出站' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="connectionCode" label="连接" width="140" />
      <el-table-column prop="topic" label="主题" min-width="280" show-overflow-tooltip />
      <el-table-column prop="consumerCode" label="消费者" width="140" />
      <el-table-column label="Payload" min-width="420">
        <template #default="scope"><pre class="payload">{{ formatPayload(scope.row.payloadPreview) }}</pre></template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import http from '../../api/http';

// 使用短轮询实时读取后台已记录的 MQTT 消息，不依赖额外 WebSocket 服务。
const messages = ref<any[]>([]);
const autoRefresh = ref(true);
const lastUpdated = ref('');
const filters = reactive<{ topic: string; direction: string }>({ topic: '', direction: '' });
let timer: number | undefined;

async function loadMessages() {
  const { data } = await http.get('/mqtt/messages', { params: { ...filters, limit: 200 } });
  messages.value = data;
  lastUpdated.value = new Date().toLocaleTimeString();
}

function formatTime(value: string) { return value ? new Date(value).toLocaleString() : '-'; }
function formatPayload(value: string | null) {
  if (!value) return '';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function updateTimer() {
  if (timer !== undefined) window.clearInterval(timer);
  timer = autoRefresh.value ? window.setInterval(() => void loadMessages(), 1000) : undefined;
}

watch(autoRefresh, updateTimer);
onMounted(async () => { await loadMessages(); updateTimer(); });
onUnmounted(() => { if (timer !== undefined) window.clearInterval(timer); });
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
.toolbar .el-input { width: 320px; }
.toolbar .el-select { width: 140px; }
.payload { margin: 0; max-height: 140px; overflow: auto; white-space: pre-wrap; font: 12px/1.4 Consolas, monospace; }
</style>
