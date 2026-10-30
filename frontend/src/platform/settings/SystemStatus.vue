<template>
  <div class="system-status">
    <div class="header-bar">
      <h3>系统状态</h3>
      <el-button @click="loadStatus" :loading="loading" :icon="RefreshIcon">刷新</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom: 20px" />

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="status-card">
          <template #header>
            <span>后端服务</span>
          </template>
          <div class="status-item">
            <span class="label">状态:</span>
            <el-tag :type="status.backend?.status === 'running' ? 'success' : 'danger'">
              {{ status.backend?.status || '未知' }}
            </el-tag>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="status-card">
          <template #header>
            <span>数据库连接</span>
          </template>
          <div class="status-item">
            <span class="label">状态:</span>
            <el-tag :type="status.database?.status === 'connected' ? 'success' : 'danger'">
              {{ status.database?.status || '未知' }}
            </el-tag>
          </div>
          <div v-if="status.database?.error" class="error-msg">
            {{ status.database.error }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card class="status-card">
          <template #header>
            <span>主机信息</span>
          </template>
          <div class="info-item">
            <span class="label">主机名:</span>
            <span>{{ status.hostname || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">操作系统:</span>
            <span>{{ status.os || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">架构:</span>
            <span>{{ status.arch || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">运行时间:</span>
            <span>{{ formatUptime(status.uptime) }}</span>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="status-card">
          <template #header>
            <span>CPU</span>
          </template>
          <div class="info-item">
            <span class="label">型号:</span>
            <span>{{ status.cpu?.model || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">核心数:</span>
            <span>{{ status.cpu?.cores || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">使用率:</span>
            <span>{{ status.cpu?.usage?.toFixed(2) || 0 }}%</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card class="status-card">
          <template #header>
            <span>内存</span>
          </template>
          <div class="info-item">
            <span class="label">总量:</span>
            <span>{{ formatBytes(status.memory?.total) }}</span>
          </div>
          <div class="info-item">
            <span class="label">已用:</span>
            <span>{{ formatBytes(status.memory?.used) }}</span>
          </div>
          <div class="info-item">
            <span class="label">可用:</span>
            <span>{{ formatBytes(status.memory?.free) }}</span>
          </div>
          <div class="info-item">
            <span class="label">使用率:</span>
            <el-progress :percentage="parseFloat(status.memory?.usagePercent || '0')" />
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="status-card">
          <template #header>
            <span>磁盘</span>
          </template>
          <div class="info-item">
            <span class="label">总量:</span>
            <span>{{ formatBytes(status.disk?.total) }}</span>
          </div>
          <div class="info-item">
            <span class="label">已用:</span>
            <span>{{ formatBytes(status.disk?.used) }}</span>
          </div>
          <div class="info-item">
            <span class="label">可用:</span>
            <span>{{ formatBytes(status.disk?.free) }}</span>
          </div>
          <div class="info-item">
            <span class="label">使用率:</span>
            <el-progress :percentage="parseFloat(status.disk?.usagePercent || '0')" />
          </div>
          <div v-if="status.disk?.error" class="error-msg">
            {{ status.disk.error }}
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh as RefreshIcon } from '@element-plus/icons-vue';
import axios from 'axios';

const status = ref<any>({});
const loading = ref(false);
const error = ref('');

const loadStatus = async () => {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await axios.get('/api/settings/system/status');
    status.value = data;
  } catch (err: any) {
    error.value = err.response?.data?.message || '加载系统状态失败';
    ElMessage.error(error.value);
  } finally {
    loading.value = false;
  }
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
};

const formatUptime = (seconds?: number) => {
  if (!seconds) return '0秒';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  return parts.join(' ') || '0分钟';
};

onMounted(() => {
  loadStatus();
});
</script>

<style scoped>
.system-status {
  max-width: 1200px;
}

.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-bar h3 {
  margin: 0;
}

.status-card {
  margin-bottom: 20px;
}

.status-item,
.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.label {
  font-weight: 500;
  color: #606266;
}

.error-msg {
  color: #f56c6c;
  font-size: 12px;
  margin-top: 8px;
}
</style>
