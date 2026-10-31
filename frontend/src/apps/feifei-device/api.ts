import http from '../../api/http';

// The shared HTTP client injects access_token and handles authentication failures.
const api = http;

/** 设备查询参数 */
export interface QueryDeviceParams {
  keyword?: string;
  deviceId?: string;
  productCode?: string;
  status?: string;
  bindingStatus?: string;
  page?: number;
  pageSize?: number;
}

/** 设备信息 */
export interface Device {
  id: number;
  deviceId: string;
  productCode: string;
  deviceName: string;
  firmwareVersion?: string;
  status: 'discovered' | 'online' | 'offline' | 'disabled';
  lastSeenAt?: string;
  lastStatusAt?: string;
  lastIpAddress?: string;
  signalStrength?: number;
  configJson?: Record<string, unknown>;
  enabled: boolean;
  boundUserId?: number;
  boundAt?: string;
  isBound: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 凤飞飞设备 API */
export const feifeiDeviceApi = {
  /** 获取设备总览统计 */
  async getOverview(): Promise<any> {
    const { data } = await api.get('/feifei-devices/overview');
    return data;
  },

  /** 查询设备列表 */
  async getDevices(params: QueryDeviceParams): Promise<{ data: Device[]; total: number }> {
    const { data } = await api.get('/feifei-devices', { params });
    return data;
  },

  /** 获取设备详情 */
  async getDevice(id: number): Promise<Device> {
    const { data } = await api.get(`/feifei-devices/${id}`);
    return data;
  },

  /** 创建设备 */
  async createDevice(dto: { deviceId: string; deviceName: string; productCode?: string; configJson?: Record<string, unknown> }): Promise<Device> {
    const { data } = await api.post('/feifei-devices', dto);
    return data;
  },

  /** 更新设备 */
  async updateDevice(id: number, dto: { deviceName?: string; configJson?: Record<string, unknown>; enabled?: boolean }): Promise<Device> {
    const { data } = await api.patch(`/feifei-devices/${id}`, dto);
    return data;
  },

  /** 启用设备 */
  async enableDevice(id: number): Promise<{ success: boolean }> {
    const { data } = await api.post(`/feifei-devices/${id}/enable`);
    return data;
  },

  /** 停用设备 */
  async disableDevice(id: number): Promise<{ success: boolean }> {
    const { data } = await api.post(`/feifei-devices/${id}/disable`);
    return data;
  },

  /** 删除设备 */
  async deleteDevice(id: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/feifei-devices/${id}`);
    return data;
  },

  /** 生成配对码 */
  async createPairingCode(id: number, expiresInSeconds?: number): Promise<{ pairingCode: string; expiresAt: string }> {
    const { data } = await api.post(`/feifei-devices/${id}/pairing-codes`, { expiresInSeconds });
    return data;
  },

  /** 提交配对码绑定设备 */
  async pairDevice(id: number, pairingCode: string): Promise<{ success: boolean; deviceId: string; boundAt: string }> {
    const { data } = await api.post(`/feifei-devices/${id}/pair`, { pairingCode });
    return data;
  },

  /** 解绑设备 */
  async unbindDevice(id: number): Promise<{ success: boolean }> {
    const { data } = await api.post(`/feifei-devices/${id}/unbind`);
    return data;
  },

  /** 获取配对记录 */
  async getPairingRecords(id: number): Promise<any[]> {
    const { data } = await api.get(`/feifei-devices/${id}/pairing-records`);
    return data;
  },

  /** 获取状态事件 */
  async getStatusEvents(id: number): Promise<any[]> {
    const { data } = await api.get(`/feifei-devices/${id}/status-events`);
    return data;
  },

  /** 发送设备指令 */
  async sendCommand(id: number, commandType: string, params?: Record<string, unknown>): Promise<{ success: boolean; requestId: string; topic: string }> {
    const { data } = await api.post(`/feifei-devices/${id}/commands`, { commandType, params });
    return data;
  },

  /** 获取文档 */
  async getDocument(documentCode: string): Promise<{ content: string }> {
    const { data } = await api.get(`/feifei-devices/docs/${documentCode}`);
    return data;
  },
};
