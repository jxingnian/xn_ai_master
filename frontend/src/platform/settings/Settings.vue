<template>
  <div class="settings-container">
    <el-card>
      <template #header>
        <h2>设置</h2>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="账号设置" name="account">
          <AccountSettings />
        </el-tab-pane>
        <el-tab-pane label="系统状态" name="system">
          <SystemStatus />
        </el-tab-pane>
        <el-tab-pane label="审计日志" name="audit">
          <AuditLogs />
        </el-tab-pane>
        <el-tab-pane label="AI 配置" name="ai">
          <AiConfig />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AccountSettings from './AccountSettings.vue';
import SystemStatus from './SystemStatus.vue';
import AuditLogs from './AuditLogs.vue';
import AiConfig from './AiConfig.vue';

const activeTab = ref('account');
</script>

<style scoped>
.settings-container {
  padding: 20px;
}

h2 {
  margin: 0;
}
</style>

