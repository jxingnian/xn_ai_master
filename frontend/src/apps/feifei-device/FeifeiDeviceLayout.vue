<template>
  <div class="feifei-device-page">
    <el-card>
      <template #header>
        <strong>凤飞飞设备</strong>
      </template>
      <el-container>
        <el-aside width="170px" class="doc-aside">
          <el-menu router :default-active="route.path">
            <el-menu-item index="/feifei-device/overview">设备总览</el-menu-item>
            <el-menu-item index="/feifei-device/list">设备管理</el-menu-item>
            <el-menu-item index="/feifei-device/pairing">配对记录</el-menu-item>
            <el-menu-item index="/feifei-device/docs">使用文档</el-menu-item>
            <el-menu-item index="/feifei-device/mqtt-config">MQTT 配置</el-menu-item>
          </el-menu>
        </el-aside>
        <el-main>
          <router-view />
        </el-main>
      </el-container>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

/** 使用当前路由保持凤飞飞应用侧边栏选中项与页面地址一致。 */
const route = useRoute();
</script>

<style scoped>
.feifei-device-page {
  min-height: 600px;
}

.doc-aside {
  border-right: 1px solid #ebeef5;
}

.el-main {
  padding: 0 0 0 20px;
}
</style>

