<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import http from '../../api/http';

const apps = ref<any[]>([]);
const installingId = ref<number | null>(null);

/** 加载可安装应用，所有请求统一使用带 JWT 的 http 实例。 */
async function loadApps() {
  const { data } = await http.get('/apps/store');
  apps.value = data;
}

/** 展示后端返回的确定错误原因，并在成功后刷新清单。 */
async function install(app: any) {
  installingId.value = app.id;
  try {
    await http.post(`/apps/${app.id}/install`);
    ElMessage.success('安装成功，请刷新菜单');
    await loadApps();
    // 布局页的菜单只在进入后台时加载，安装后刷新页面才能立即显示新菜单。
    window.location.reload();
  } catch (error: any) {
    const message = error.response?.data?.message || '应用安装失败';
    ElMessage.error(Array.isArray(message) ? message.join('；') : message);
  } finally {
    installingId.value = null;
  }
}

onMounted(loadApps);
</script>

<template>
  <el-card>
    <template #header>应用商店</template>
    <el-empty v-if="!apps.length" description="暂无可安装应用" />
    <el-row v-else :gutter="16">
      <el-col v-for="app in apps" :key="app.id" :span="8">
        <el-card shadow="hover">
          <h3>{{ app.name }}</h3>
          <p>{{ app.description }}</p>
          <el-tag>{{ app.version }}</el-tag>
          <el-button type="primary" link :loading="installingId === app.id" @click="install(app)">安装</el-button>
        </el-card>
      </el-col>
    </el-row>
  </el-card>
</template>
