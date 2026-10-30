<template>
  <div class="ai-config">
    <el-card>
      <template #header>
        <span>AI 服务配置</span>
      </template>

      <el-form :model="configForm" :rules="rules" ref="formRef" label-width="120px">
        <el-form-item label="服务提供商" prop="provider">
          <el-select v-model="configForm.provider" placeholder="请选择服务提供商">
            <el-option label="OpenAI" value="openai" />
            <el-option label="Azure OpenAI" value="azure" />
            <el-option label="Claude" value="anthropic" />
            <el-option label="通义千问" value="qwen" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>

        <el-form-item label="API Base URL" prop="base_url">
          <el-input v-model="configForm.base_url" placeholder="例如: https://api.openai.com/v1" />
        </el-form-item>

        <el-form-item label="API Key" prop="api_key">
          <el-input
            v-model="configForm.api_key"
            type="password"
            placeholder="请输入API Key"
            show-password
          />
          <span class="form-hint">API Key 将被加密保存</span>
        </el-form-item>

        <el-form-item label="模型" prop="model">
          <el-input v-model="configForm.model" placeholder="例如: gpt-4, claude-3-opus" />
        </el-form-item>

        <el-form-item label="Temperature" prop="temperature">
          <el-slider v-model="configForm.temperature" :min="0" :max="2" :step="0.1" show-input />
          <span class="form-hint">控制生成内容的随机性，0-2之间</span>
        </el-form-item>

        <el-form-item label="Max Tokens" prop="max_tokens">
          <el-input-number v-model="configForm.max_tokens" :min="1" :max="32000" />
          <span class="form-hint">最大生成token数量</span>
        </el-form-item>

        <el-form-item label="启用状态">
          <el-switch v-model="configForm.enabled" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="saveConfig" :loading="saveLoading">保存配置</el-button>
          <el-button @click="testConnection" :loading="testLoading">测试连接</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <span>使用统计</span>
      </template>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-statistic title="总调用次数" :value="usage.totalCalls || 0" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="成功次数" :value="usage.successCalls || 0" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="失败次数" :value="usage.failureCalls || 0" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="总Token数" :value="usage.totalTokens || 0" />
        </el-col>
      </el-row>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>调用日志</span>
          <el-button @click="loadLogs" :icon="RefreshIcon" size="small">刷新</el-button>
        </div>
      </template>

      <el-table :data="logs" border v-loading="logsLoading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="provider" label="提供商" width="120" />
        <el-table-column prop="model" label="模型" width="150" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_tokens" label="Tokens" width="100" />
        <el-table-column prop="response_time_ms" label="耗时(ms)" width="120" />
        <el-table-column prop="error_message" label="错误信息" min-width="200" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="logPagination.page"
        v-model:page-size="logPagination.limit"
        :total="logPagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="loadLogs"
        @size-change="loadLogs"
        style="margin-top: 20px; justify-content: flex-end"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Refresh as RefreshIcon } from '@element-plus/icons-vue';
import axios from 'axios';

const formRef = ref<FormInstance>();
const saveLoading = ref(false);
const testLoading = ref(false);
const logsLoading = ref(false);

const configForm = reactive({
  provider: '',
  base_url: '',
  api_key: '',
  model: '',
  temperature: 0.7,
  max_tokens: 2000,
  enabled: true,
});

const rules: FormRules = {
  provider: [{ required: true, message: '请选择服务提供商', trigger: 'change' }],
  api_key: [{ required: true, message: '请输入API Key', trigger: 'blur' }],
  model: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  temperature: [{ required: true, message: '请设置Temperature', trigger: 'blur' }],
  max_tokens: [{ required: true, message: '请设置Max Tokens', trigger: 'blur' }],
};

const usage = reactive({
  totalCalls: 0,
  successCalls: 0,
  failureCalls: 0,
  totalTokens: 0,
});

const logs = ref<any[]>([]);
const logPagination = reactive({
  page: 1,
  limit: 20,
  total: 0,
});

const loadConfig = async () => {
  try {
    const { data } = await axios.get('/api/settings/ai');
    Object.assign(configForm, data);
  } catch (error: any) {
    if (error.response?.status !== 404) {
      ElMessage.error(error.response?.data?.message || '加载配置失败');
    }
  }
};

const saveConfig = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    saveLoading.value = true;
    try {
      await axios.put('/api/settings/ai', configForm);
      ElMessage.success('保存成功');
      await loadConfig();
      await loadUsage();
    } catch (error: any) {
      ElMessage.error(error.response?.data?.message || '保存失败');
    } finally {
      saveLoading.value = false;
    }
  });
};

const testConnection = async () => {
  testLoading.value = true;
  try {
    const { data } = await axios.post('/api/settings/ai/test');
    if (data.success) {
      ElMessage.success(`连接成功，响应时间: ${data.responseTime}ms`);
    } else {
      ElMessage.error(`连接失败: ${data.error}`);
    }
    await loadLogs();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '测试失败');
  } finally {
    testLoading.value = false;
  }
};

const loadUsage = async () => {
  try {
    const { data } = await axios.get('/api/settings/ai/usage');
    Object.assign(usage, data);
  } catch (error: any) {
    console.error('加载使用统计失败', error);
  }
};

const loadLogs = async () => {
  logsLoading.value = true;
  try {
    const { data } = await axios.get('/api/settings/ai/logs', {
      params: {
        page: logPagination.page,
        limit: logPagination.limit,
      },
    });
    logs.value = data.items;
    logPagination.total = data.total;
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '加载日志失败');
  } finally {
    logsLoading.value = false;
  }
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
};

onMounted(() => {
  loadConfig();
  loadUsage();
  loadLogs();
});
</script>

<style scoped>
.ai-config {
  max-width: 1000px;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  display: block;
  margin-top: 4px;
}
</style>
