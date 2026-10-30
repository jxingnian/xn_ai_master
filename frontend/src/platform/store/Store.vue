<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import http from '../../api/http';

// Tab 切换状态
const activeTab = ref('store');

// 可安装应用列表
const apps = ref<any[]>([]);
const installingId = ref<number | null>(null);

// 已安装应用列表
const installedApps = ref<any[]>([]);
const loadingAction = ref<{ [key: number]: boolean }>({});

// 配置对话框
const configDialogVisible = ref(false);
const currentConfigApp = ref<any>(null);
const configJson = ref('');

/** 加载可安装应用，所有请求统一使用带 JWT 的 http 实例。 */
async function loadApps() {
  const { data } = await http.get('/apps/store');
  apps.value = data;
}

/** 加载已安装应用列表 */
async function loadInstalledApps() {
  try {
    const { data } = await http.get('/apps/installed');
    installedApps.value = data;
  } catch (error: any) {
    const message = error.response?.data?.message || '加载已安装应用失败';
    ElMessage.error(Array.isArray(message) ? message.join('；') : message);
  }
}

/** 展示后端返回的确定错误原因，并在成功后刷新清单。 */
async function install(app: any) {
  installingId.value = app.id;
  try {
    await http.post(`/apps/${app.id}/install`);
    ElMessage.success('安装成功，刷新菜单中...');
    await loadApps();
    await loadInstalledApps();
    // 布局页的菜单只在进入后台时加载，安装后刷新页面才能立即显示新菜单。
    window.location.reload();
  } catch (error: any) {
    const message = error.response?.data?.message || '应用安装失败';
    ElMessage.error(Array.isArray(message) ? message.join('；') : message);
  } finally {
    installingId.value = null;
  }
}

/** 切换应用启用/停用状态 */
async function toggleStatus(installedApp: any) {
  const appId = installedApp.appId;
  const newStatus = installedApp.status === 'enabled' ? 'disabled' : 'enabled';
  const actionText = newStatus === 'enabled' ? '启用' : '停用';

  loadingAction.value[appId] = true;
  try {
    await http.post(`/apps/${appId}/status`, { status: newStatus });
    ElMessage.success(`${actionText}成功`);
    await loadInstalledApps();
    // 刷新页面以更新菜单显示
    window.location.reload();
  } catch (error: any) {
    const message = error.response?.data?.message || `${actionText}失败`;
    ElMessage.error(Array.isArray(message) ? message.join('；') : message);
    await loadInstalledApps(); // 恢复状态
  } finally {
    loadingAction.value[appId] = false;
  }
}

/** 打开配置对话框 */
function openConfigDialog(installedApp: any) {
  currentConfigApp.value = installedApp;
  configJson.value = JSON.stringify(installedApp.config || {}, null, 2);
  configDialogVisible.value = true;
}

/** 保存应用配置 */
async function saveConfig() {
  if (!currentConfigApp.value) return;

  try {
    // 验证 JSON 格式
    const config = JSON.parse(configJson.value);

    await http.patch(`/apps/${currentConfigApp.value.appId}/config`, { config });
    ElMessage.success('配置保存成功');
    configDialogVisible.value = false;
    await loadInstalledApps();
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      ElMessage.error('JSON 格式错误，请检查配置内容');
    } else {
      const message = error.response?.data?.message || '保存配置失败';
      ElMessage.error(Array.isArray(message) ? message.join('；') : message);
    }
  }
}

/** 卸载应用 */
async function uninstall(installedApp: any) {
  try {
    await ElMessageBox.confirm(
      `确定要卸载"${installedApp.app.name}"吗？卸载后菜单和配置将被移除。`,
      '确认卸载',
      {
        confirmButtonText: '确定卸载',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    loadingAction.value[installedApp.appId] = true;
    try {
      await http.post(`/apps/${installedApp.appId}/uninstall`);
      ElMessage.success('卸载成功，刷新菜单中...');
      await loadApps();
      await loadInstalledApps();
      // 刷新页面以更新菜单显示
      window.location.reload();
    } catch (error: any) {
      const message = error.response?.data?.message || '卸载失败';
      ElMessage.error(Array.isArray(message) ? message.join('；') : message);
    } finally {
      loadingAction.value[installedApp.appId] = false;
    }
  } catch {
    // 用户取消操作
  }
}

/** Tab 切换时加载对应数据 */
function handleTabChange(tabName: string) {
  if (tabName === 'installed') {
    loadInstalledApps();
  }
}

onMounted(() => {
  loadApps();
  loadInstalledApps();
});
</script>

<template>
  <el-card>
    <template #header>应用商店</template>

    <!-- Tab 切换 -->
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- 可安装应用 Tab -->
      <el-tab-pane label="可安装应用" name="store">
        <el-empty v-if="!apps.length" description="暂无可安装应用" />
        <el-row v-else :gutter="16">
          <el-col v-for="app in apps" :key="app.id" :span="8" style="margin-bottom: 16px;">
            <el-card shadow="hover">
              <h3 style="margin-top: 0;">{{ app.name }}</h3>
              <p style="color: #666; min-height: 40px;">{{ app.description }}</p>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <el-tag>{{ app.version }}</el-tag>
                <el-button
                  type="primary"
                  size="small"
                  :loading="installingId === app.id"
                  @click="install(app)"
                >
                  安装
                </el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- 已安装应用 Tab -->
      <el-tab-pane label="已安装应用" name="installed">
        <el-empty v-if="!installedApps.length" description="暂无已安装应用" />
        <el-table v-else :data="installedApps" style="width: 100%">
          <el-table-column prop="app.name" label="应用名称" width="200" />
          <el-table-column prop="app.description" label="说明" />
          <el-table-column prop="version" label="版本" width="120" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'enabled' ? 'success' : 'info'">
                {{ row.status === 'enabled' ? '已启用' : '已停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="installedAt" label="安装时间" width="180">
            <template #default="{ row }">
              {{ new Date(row.installedAt).toLocaleString('zh-CN') }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button
                :type="row.status === 'enabled' ? 'warning' : 'success'"
                size="small"
                :loading="loadingAction[row.appId]"
                @click="toggleStatus(row)"
              >
                {{ row.status === 'enabled' ? '停用' : '启用' }}
              </el-button>
              <el-button
                type="primary"
                size="small"
                @click="openConfigDialog(row)"
              >
                配置
              </el-button>
              <el-button
                type="danger"
                size="small"
                :loading="loadingAction[row.appId]"
                @click="uninstall(row)"
              >
                卸载
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 配置对话框 -->
    <el-dialog
      v-model="configDialogVisible"
      :title="`配置 ${currentConfigApp?.app?.name || ''}`"
      width="600px"
    >
      <el-input
        v-model="configJson"
        type="textarea"
        :rows="12"
        placeholder="请输入 JSON 格式的配置"
      />
      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>
