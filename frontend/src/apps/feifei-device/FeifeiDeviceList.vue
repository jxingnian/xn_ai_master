<template>
  <div class="feifei-device-list">
    <h2>设备管理</h2>

    <!-- 查询条件 -->
    <div class="query-form">
      <input
        v-model="queryParams.keyword"
        type="text"
        placeholder="搜索设备名称或设备ID"
        @keyup.enter="loadDevices"
      />
      <select v-model="queryParams.status">
        <option value="">全部状态</option>
        <option value="discovered">已发现</option>
        <option value="online">在线</option>
        <option value="offline">离线</option>
        <option value="disabled">已停用</option>
      </select>
      <select v-model="queryParams.bindingStatus">
        <option value="">全部绑定状态</option>
        <option value="bound">已绑定</option>
        <option value="unbound">未绑定</option>
      </select>
      <button @click="loadDevices">查询</button>
      <button @click="resetQuery">重置</button>
    </div>

    <!-- 设备列表 -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error-message">{{ error }}</div>
    <div v-else-if="devices.length === 0" class="empty-message">暂无设备数据</div>
    <table v-else class="device-table">
      <thead>
        <tr>
          <th>设备名称</th>
          <th>设备ID</th>
          <th>产品型号</th>
          <th>状态</th>
          <th>最后在线</th>
          <th>固件版本</th>
          <th>绑定状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="device in devices" :key="device.id">
          <td>{{ device.deviceName }}</td>
          <td>{{ device.deviceId }}</td>
          <td>{{ device.productCode }}</td>
          <td>
            <span :class="['status-badge', device.status]">
              {{ getStatusText(device.status) }}
            </span>
          </td>
          <td>{{ formatTime(device.lastSeenAt) }}</td>
          <td>{{ device.firmwareVersion || '-' }}</td>
          <td>{{ device.isBound ? '已绑定' : '未绑定' }}</td>
          <td>
            <button @click="viewDetail(device)" class="btn-small">详情</button>
            <button v-if="!device.isBound" @click="pairDevice(device)" class="btn-small">连接</button>
            <button v-if="device.isBound" @click="unbindDevice(device)" class="btn-small">解绑</button>
            <button v-if="device.enabled" @click="disableDevice(device)" class="btn-small">停用</button>
            <button v-else @click="enableDevice(device)" class="btn-small">启用</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 分页 -->
    <div v-if="total > 0" class="pagination">
      <button @click="prevPage" :disabled="queryParams.page === 1">上一页</button>
      <span>第 {{ queryParams.page }} 页 / 共 {{ totalPages }} 页</span>
      <button @click="nextPage" :disabled="queryParams.page >= totalPages">下一页</button>
      <span>共 {{ total }} 条</span>
    </div>

    <!-- 配对弹窗 -->
    <div v-if="pairingDialog.visible" class="dialog-overlay" @click.self="closePairingDialog">
      <div class="dialog">
        <h3>连接设备</h3>
        <div class="dialog-content">
          <p><strong>设备ID:</strong> {{ pairingDialog.device?.deviceId }}</p>
          <p><strong>设备名称:</strong> {{ pairingDialog.device?.deviceName }}</p>
          <p><strong>当前状态:</strong> {{ getStatusText(pairingDialog.device?.status || '') }}</p>

          <div v-if="pairingDialog.step === 'generate'" class="step">
            <p>点击"生成配对码"按钮生成配对码</p>
            <button @click="generatePairingCode" :disabled="pairingDialog.generating">
              {{ pairingDialog.generating ? '生成中...' : '生成配对码' }}
            </button>
          </div>

          <div v-if="pairingDialog.step === 'input'" class="step">
            <p><strong>配对码:</strong> <span class="pairing-code">{{ pairingDialog.pairingCode }}</span></p>
            <p><strong>有效期至:</strong> {{ formatTime(pairingDialog.expiresAt) }}</p>
            <input
              v-model="pairingDialog.inputCode"
              type="text"
              placeholder="请输入配对码"
              maxlength="6"
              @keyup.enter="submitPairingCode"
            />
            <button @click="submitPairingCode" :disabled="pairingDialog.pairing">
              {{ pairingDialog.pairing ? '配对中...' : '提交配对' }}
            </button>
          </div>

          <div v-if="pairingDialog.error" class="error-message">
            {{ pairingDialog.error }}
          </div>
        </div>
        <div class="dialog-actions">
          <button @click="closePairingDialog">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { feifeiDeviceApi, Device } from './api';

const devices = ref<Device[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');

const queryParams = ref({
  keyword: '',
  status: '',
  bindingStatus: '',
  page: 1,
  pageSize: 20,
});

const pairingDialog = ref({
  visible: false,
  device: null as Device | null,
  step: 'generate' as 'generate' | 'input',
  pairingCode: '',
  expiresAt: '',
  inputCode: '',
  generating: false,
  pairing: false,
  error: '',
});

const totalPages = computed(() => Math.ceil(total.value / queryParams.value.pageSize));

/** 加载设备列表 */
async function loadDevices() {
  loading.value = true;
  error.value = '';
  try {
    const result = await feifeiDeviceApi.getDevices(queryParams.value);
    devices.value = result.data;
    total.value = result.total;
  } catch (err: any) {
    error.value = err.response?.data?.message || '加载设备列表失败';
    console.error('加载设备列表失败:', err);
  } finally {
    loading.value = false;
  }
}

/** 重置查询 */
function resetQuery() {
  queryParams.value = {
    keyword: '',
    status: '',
    bindingStatus: '',
    page: 1,
    pageSize: 20,
  };
  loadDevices();
}

/** 上一页 */
function prevPage() {
  if (queryParams.value.page > 1) {
    queryParams.value.page--;
    loadDevices();
  }
}

/** 下一页 */
function nextPage() {
  if (queryParams.value.page < totalPages.value) {
    queryParams.value.page++;
    loadDevices();
  }
}

/** 查看详情 */
function viewDetail(device: Device) {
  alert(`查看设备详情: ${device.deviceName}`);
  // TODO: 跳转到详情页面
}

/** 连接设备（打开配对弹窗） */
function pairDevice(device: Device) {
  pairingDialog.value = {
    visible: true,
    device,
    step: 'generate',
    pairingCode: '',
    expiresAt: '',
    inputCode: '',
    generating: false,
    pairing: false,
    error: '',
  };
}

/** 生成配对码 */
async function generatePairingCode() {
  if (!pairingDialog.value.device) return;

  pairingDialog.value.generating = true;
  pairingDialog.value.error = '';
  try {
    const result = await feifeiDeviceApi.createPairingCode(pairingDialog.value.device.id);
    pairingDialog.value.pairingCode = result.pairingCode;
    pairingDialog.value.expiresAt = result.expiresAt;
    pairingDialog.value.step = 'input';
  } catch (err: any) {
    pairingDialog.value.error = err.response?.data?.message || '生成配对码失败';
  } finally {
    pairingDialog.value.generating = false;
  }
}

/** 提交配对码 */
async function submitPairingCode() {
  if (!pairingDialog.value.device || !pairingDialog.value.inputCode) return;

  pairingDialog.value.pairing = true;
  pairingDialog.value.error = '';
  try {
    await feifeiDeviceApi.pairDevice(pairingDialog.value.device.id, pairingDialog.value.inputCode);
    alert('设备配对成功！');
    closePairingDialog();
    loadDevices();
  } catch (err: any) {
    pairingDialog.value.error = err.response?.data?.message || '配对失败';
  } finally {
    pairingDialog.value.pairing = false;
  }
}

/** 关闭配对弹窗 */
function closePairingDialog() {
  pairingDialog.value.visible = false;
}

/** 解绑设备 */
async function unbindDevice(device: Device) {
  if (!confirm(`确定要解绑设备"${device.deviceName}"吗？`)) return;

  try {
    await feifeiDeviceApi.unbindDevice(device.id);
    alert('解绑成功');
    loadDevices();
  } catch (err: any) {
    alert(err.response?.data?.message || '解绑失败');
  }
}

/** 启用设备 */
async function enableDevice(device: Device) {
  try {
    await feifeiDeviceApi.enableDevice(device.id);
    alert('启用成功');
    loadDevices();
  } catch (err: any) {
    alert(err.response?.data?.message || '启用失败');
  }
}

/** 停用设备 */
async function disableDevice(device: Device) {
  if (!confirm(`确定要停用设备"${device.deviceName}"吗？`)) return;

  try {
    await feifeiDeviceApi.disableDevice(device.id);
    alert('停用成功');
    loadDevices();
  } catch (err: any) {
    alert(err.response?.data?.message || '停用失败');
  }
}

/** 获取状态文本 */
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    discovered: '已发现',
    online: '在线',
    offline: '离线',
    disabled: '已停用',
  };
  return statusMap[status] || status;
}

/** 格式化时间 */
function formatTime(time?: string): string {
  if (!time) return '-';
  return new Date(time).toLocaleString('zh-CN');
}

onMounted(() => {
  loadDevices();
});
</script>

<style scoped>
.feifei-device-list {
  padding: 20px;
}

h2 {
  margin-bottom: 20px;
  color: #333;
}

.query-form {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.query-form input,
.query-form select {
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.query-form input {
  flex: 1;
  max-width: 300px;
}

.query-form button {
  padding: 8px 16px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.query-form button:hover {
  background: #40a9ff;
}

.loading,
.empty-message {
  text-align: center;
  padding: 40px;
  color: #666;
}

.error-message {
  padding: 12px;
  background: #fff2e8;
  border: 1px solid #ffbb96;
  border-radius: 4px;
  color: #d4380d;
  margin-bottom: 20px;
}

.device-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.device-table th,
.device-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

.device-table th {
  background: #fafafa;
  font-weight: 600;
  color: #333;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-badge.online {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.status-badge.offline {
  background: #fff2e8;
  color: #fa8c16;
  border: 1px solid #ffd591;
}

.status-badge.disabled {
  background: #f5f5f5;
  color: #8c8c8c;
  border: 1px solid #d9d9d9;
}

.status-badge.discovered {
  background: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

.btn-small {
  padding: 4px 8px;
  margin-right: 4px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-small:hover {
  background: #40a9ff;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
}

.pagination button {
  padding: 8px 16px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.pagination button:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 8px;
  padding: 20px;
  min-width: 400px;
  max-width: 600px;
}

.dialog h3 {
  margin-top: 0;
  margin-bottom: 20px;
}

.dialog-content {
  margin-bottom: 20px;
}

.step {
  margin-top: 20px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 4px;
}

.pairing-code {
  font-size: 24px;
  font-weight: bold;
  color: #1890ff;
  letter-spacing: 4px;
}

.step input {
  width: 100%;
  padding: 8px;
  margin: 10px 0;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.step button {
  padding: 8px 16px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.dialog-actions {
  text-align: right;
}

.dialog-actions button {
  padding: 8px 16px;
  background: #d9d9d9;
  color: #333;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
