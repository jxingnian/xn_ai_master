<template>
  <div class="device-docs">
    <h3>使用文档</h3>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="应用介绍" name="intro">
        <div class="doc-content">
          <h4>凤飞飞设备管理应用</h4>
          <p>本应用提供设备接入、配对绑定、在线状态监控和设备管理功能。</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="API接入文档" name="api">
        <div class="doc-content">
          <h4>API 接入文档</h4>
          <p>待补充...</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="MQTT配置" name="mqtt">
        <div class="doc-content">
          <h4>MQTT 配置文档</h4>
          <p>待补充...</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="设备连接" name="device">
        <div class="doc-content">
          <h4>设备连接文档</h4>
          <p>待补充...</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="配对流程" name="pairing">
        <div class="doc-content">
          <h4>配对绑定流程</h4>
          <p>待补充...</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="消息格式" name="message">
        <div class="doc-content">
          <h4>消息主题和数据格式</h4>
          <p>待补充...</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="安全要求" name="security">
        <div class="doc-content">
          <h4>安全要求</h4>
          <p>待补充...</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="故障排查" name="troubleshooting">
        <div class="doc-content">
          <h4>故障排查</h4>
          <p>待补充...</p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const activeTab = ref('intro');
</script>

<style scoped>
.device-docs {
  padding: 20px;
}

.doc-content {
  padding: 20px;
  line-height: 1.8;
}

.doc-content h4 {
  margin-bottom: 15px;
  color: #333;
}

.doc-content p {
  color: #666;
}
</style>
