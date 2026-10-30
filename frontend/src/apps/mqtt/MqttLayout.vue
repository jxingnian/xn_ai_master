<template>
  <div class="mqtt-page">
    <el-card>
      <template #header><strong>MQTT 管理</strong></template>
      <el-container>
        <el-aside width="170px" class="doc-aside">
          <el-menu router :default-active="route.path">
            <el-menu-item index="/mqtt/connections">连接配置</el-menu-item>
            <el-menu-item index="/mqtt/subscriptions">订阅管理</el-menu-item>
            <el-menu-item index="/mqtt/publish">消息发布</el-menu-item>
            <el-menu-item index="/mqtt/status">运行状态</el-menu-item>
            <el-menu-item index="/mqtt/docs">使用文档</el-menu-item>
          </el-menu>
        </el-aside>
        <el-main><router-view /></el-main>
      </el-container>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

/** 使用路由地址保持侧边栏选中项和当前页面一致。 */
const route = useRoute();
</script>

<style scoped>
.mqtt-page { min-height: 600px; }
.doc-aside { border-right: 1px solid #ebeef5; }
.el-main { padding: 0 0 0 20px; }
</style>
