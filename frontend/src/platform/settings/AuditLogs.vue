<template>
  <div class="audit-logs">
    <el-card>
      <template #header>
        <span>审计日志</span>
      </template>

      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="模块">
          <el-select v-model="filters.module" placeholder="全部模块" clearable style="width: 150px">
            <el-option label="认证" value="auth" />
            <el-option label="应用管理" value="app-manager" />
            <el-option label="设置" value="settings" />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="filters.result" placeholder="全部结果" clearable style="width: 120px">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failure" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadLogs">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="logs" border style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="user_id" label="用户ID" width="100" />
        <el-table-column prop="module" label="模块" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.module }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" width="150" />
        <el-table-column prop="resource" label="资源" width="120" />
        <el-table-column prop="resource_id" label="资源ID" width="100" />
        <el-table-column prop="result" label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="row.result === 'success' ? 'success' : 'danger'" size="small">
              {{ row.result }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="request_ip" label="IP地址" width="140" />
        <el-table-column prop="error_message" label="错误信息" min-width="200" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="loadLogs"
        @size-change="loadLogs"
        style="margin-top: 20px; justify-content: flex-end"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';

const logs = ref<any[]>([]);
const loading = ref(false);

const filters = reactive({
  module: '',
  result: '',
  dateRange: [] as string[],
});

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0,
});

const loadLogs = async () => {
  loading.value = true;
  try {
    const params: any = {
      page: pagination.page,
      limit: pagination.limit,
    };

    if (filters.module) params.module = filters.module;
    if (filters.result) params.result = filters.result;
    if (filters.dateRange && filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }

    const { data } = await axios.get('/api/settings/audit-logs', { params });
    logs.value = data.items;
    pagination.total = data.total;
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '加载审计日志失败');
  } finally {
    loading.value = false;
  }
};

const resetFilters = () => {
  filters.module = '';
  filters.result = '';
  filters.dateRange = [];
  pagination.page = 1;
  loadLogs();
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
};

onMounted(() => {
  loadLogs();
});
</script>

<style scoped>
.audit-logs {
  max-width: 100%;
}

.filter-form {
  margin-bottom: 20px;
}
</style>
