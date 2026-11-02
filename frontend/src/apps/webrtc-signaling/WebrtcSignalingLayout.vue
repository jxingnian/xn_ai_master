<template>
  <div class="webrtc-layout">
    <el-tabs :model-value="$route.path" @tab-change="go">
      <el-tab-pane label="STUN/TURN配置" name="/webrtc-signaling/config" />
      <el-tab-pane label="通话记录" name="/webrtc-signaling/sessions" />
      <el-tab-pane label="实时通话监控" name="/webrtc-signaling/monitor" />
    </el-tabs>
    <router-view />
  </div>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
function go(path: string) { router.push(path); }
</script>
<style scoped>.webrtc-layout{width:100%}</style>
