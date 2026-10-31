<template>
  <div class="feifei-device-overview">
    <h2>设备总览</h2>

    <!-- 统计卡片 -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-value">{{ statistics.totalCount }}</div>
        <div class="stat-label">设备总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value online">{{ statistics.onlineCount }}</div>
        <div class="stat-label">在线数量</div>
      </div>
      <div class="stat-card">
        <div class="stat-value offline">{{ statistics.offlineCount }}</div>
        <div class="stat-label">离线数量</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ statistics.unboundCount }}</div>
        <div class="stat-label">未绑定数量</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ statistics.todayOnlineCount }}</div>
        <div class="stat-label">今日上线设备</div>
      </div>
    </div>

    <!-- 刷新按钮 -->
    <div class="actions">
      <button @click="loadStatistics" :disabled="loading">
        {{ loading ? '加载中...' : '刷新数据' }}
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { feifeiDeviceApi } from './api';

const statistics = ref({
  totalCount: 0,
  onlineCount: 0,
  offlineCount: 0,
  unboundCount: 0,
  todayOnlineCount: 0,
});

const loading = ref(false);
const error = ref('');

/** 加载统计数据 */
async function loadStatistics() {
  loading.value = true;
  error.value = '';
  try {
    const data = await feifeiDeviceApi.getOverview();
    statistics.value = data;
  } catch (err: any) {
    error.value = err.response?.data?.message || '加载统计数据失败';
    console.error('加载统计数据失败:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadStatistics();
});
</script>

<style scoped>
.feifei-device-overview {
  padding: 20px;
}

h2 {
  margin-bottom: 20px;
  color: #333;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.stat-value.online {
  color: #52c41a;
}

.stat-value.offline {
  color: #ff4d4f;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

.actions {
  margin-bottom: 20px;
}

button {
  padding: 8px 16px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

button:hover:not(:disabled) {
  background: #40a9ff;
}

button:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.error-message {
  padding: 12px;
  background: #fff2e8;
  border: 1px solid #ffbb96;
  border-radius: 4px;
  color: #d4380d;
}
</style>
