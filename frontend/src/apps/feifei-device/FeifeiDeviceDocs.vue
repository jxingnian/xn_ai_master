<template>
  <div class="device-docs">
    <div class="docs-header">
      <div>
        <h2>凤飞飞设备接入文档</h2>
        <p>设备通过 MQTT 与后台通信，管理端通过带 JWT 的 REST API 管理设备。</p>
      </div>
      <el-button type="primary" @click="copyFullDocument">复制全文</el-button>
    </div>

    <el-tabs v-model="activeTab" class="docs-tabs">
      <el-tab-pane label="API 接入文档" name="api">
        <section v-for="item in apiSections" :key="item.key" class="doc-section">
          <div class="section-title">
            <h3>{{ item.title }}</h3>
            <el-button size="small" @click="copySection(item.key)">复制本节</el-button>
          </div>
          <p v-if="item.description">{{ item.description }}</p>
          <pre><code>{{ item.content }}</code></pre>
        </section>
      </el-tab-pane>

      <el-tab-pane label="MQTT 配置说明" name="mqtt">
        <section class="doc-section">
          <h3>平台配置步骤</h3>
          <ol>
            <li>在 MQTT 应用中创建并启用 MQTT 连接。</li>
            <li>进入“凤飞飞应用 → MQTT 配置”。</li>
            <li>选择 MQTT 应用中已有的连接。</li>
            <li>确认设备订阅主题为 <code>xn/xn_device/#</code>。</li>
            <li>确认指令发布主题为 <code>xn/xn_device/{deviceId}/command</code>。</li>
            <li>保存配置后，查看连接状态为“已连接”。</li>
          </ol>
        </section>
      </el-tab-pane>

      <el-tab-pane label="配对绑定说明" name="pairing">
        <section class="doc-section">
          <h3>设备绑定流程</h3>
          <ol>
            <li>设备先通过 MQTT 上报有效 status 消息，后台自动创建设备记录。</li>
            <li>在设备详情中生成 6 位数字配对码。</li>
            <li>在设备端或管理端提交配对码完成绑定。</li>
            <li>绑定后，普通用户只能查看自己绑定的设备。</li>
          </ol>
          <p class="notice">配对码默认有效期为 600 秒，可配置范围为 60 至 3600 秒。</p>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

const activeTab = ref('api');

/** 文档中的代码片段集中维护，保证展示内容与一键复制内容完全一致。 */
const sections = reactive({
  connection: `设备连接链路：
设备 -> MQTT Broker -> 平台 MQTT 应用 -> 凤飞飞设备应用

设备端需要准备：
1. MQTT Broker 地址、端口、用户名和密码。
2. 固定的 deviceId。
3. MQTT 客户端连接成功后，向设备主题发布 JSON 消息。
4. 设备保持心跳或周期性上报 status/telemetry 消息。

注意：凤飞飞应用的 MQTT 连接在“MQTT 应用”中维护，凤飞飞页面只选择已有连接，不保存另一套 Broker 配置。`,
  topics: `上报状态：xn/xn_device/{deviceId}/status
上报遥测：xn/xn_device/{deviceId}/telemetry
上报事件：xn/xn_device/{deviceId}/event
上报指令应答：xn/xn_device/{deviceId}/command_ack
接收后台指令：xn/xn_device/{deviceId}/command

默认订阅过滤器：xn/xn_device/#
默认指令主题：xn/xn_device/{deviceId}/command
QoS：1

主题中的 {deviceId} 必须替换为真实设备 ID，不能保留大括号。`,
  statusMessage: `{
  "version": 1,
  "messageId": "msg-device-001-0001",
  "type": "status",
  "deviceId": "device-001",
  "timestamp": 1730000000000,
  "data": {
    "firmwareVersion": "1.0.0",
    "ipAddress": "192.168.1.10",
    "signal": 85
  }
}

必填字段：version=1、messageId、type、deviceId。
timestamp 使用毫秒时间戳；payload 最大约 100 KB。
messageId 必须唯一，重复消息会被后台忽略。`,
  eventMessage: `事件主题：xn/xn_device/{deviceId}/event
应答主题：xn/xn_device/{deviceId}/command_ack

{
  "version": 1,
  "messageId": "event-device-001-0001",
  "type": "event",
  "deviceId": "device-001",
  "timestamp": 1730000000000,
  "data": {
    "eventCode": "temperature_high"
  }
}

command_ack 至少应包含 requestId，用于关联后台发布的指令。`,
  apis: `基础地址：/api/feifei-devices
认证请求头：Authorization: Bearer <JWT>

GET    /overview                         设备统计
GET    /                                  查询设备列表
GET    /:id                               查询设备详情
POST   /                                  创建设备
PATCH  /:id                               修改设备
POST   /:id/enable                        启用设备
POST   /:id/disable                       停用设备
DELETE /:id                               删除设备
POST   /:id/pairing-codes                 生成配对码
POST   /:id/pair                          绑定设备
POST   /:id/unbind                        解绑设备
GET    /:id/pairing-records                查询配对记录
GET    /:id/status-events                  查询状态事件
POST   /:id/commands                       发送设备指令
GET    /mqtt-config/connections            查询可选 MQTT 连接
GET    /mqtt-config                       查询凤飞飞 MQTT 配置
PUT    /mqtt-config                       保存凤飞飞 MQTT 配置`,
  command: `请求：POST /api/feifei-devices/{id}/commands
请求头：Authorization: Bearer <JWT>
请求体：
{
  "commandType": "reboot",
  "params": {
    "delay": 5
  }
}

后台发布到：xn/xn_device/{deviceId}/command
消息体：
{
  "version": 1,
  "messageId": "cmd-1730000000000-abc123",
  "type": "command",
  "deviceId": "device-001",
  "timestamp": 1730000000000,
  "requestId": "cmd-1730000000000-abc123",
  "data": {
    "commandType": "reboot",
    "params": {
      "delay": 5
    }
  }
}

成功响应：
{
  "success": true,
  "requestId": "cmd-1730000000000-abc123",
  "topic": "xn/xn_device/device-001/command"
}`,
  rules: `状态规则：
1. 第一次收到有效 status/telemetry 消息，后台自动创建设备，初始状态为 discovered。
2. 设备继续上报有效消息后，状态更新为 online。
3. 超过 180 秒没有有效消息，状态更新为 offline。
4. disabled 设备收到消息也不会恢复为 online。
5. 设备 ID、messageId 和主题必须匹配，否则消息不会进入设备状态处理。

接入检查：
1. MQTT 应用中的连接状态为已连接。
2. 凤飞飞 MQTT 配置已选择该连接并启用设备通信。
3. 设备发布主题符合 xn/xn_device/{deviceId}/{messageType}。
4. JSON 中 version=1，且 deviceId 与主题一致。
5. 凤飞飞设备列表中出现设备并显示 online。`,
});

const apiSections = [
  { key: 'connection', title: '一、接入方式', description: '设备不直接调用凤飞飞 HTTP 接口，设备需要连接 MQTT Broker，并通过 MQTT 上报状态和接收指令。', content: sections.connection },
  { key: 'topics', title: '二、MQTT 主题', description: '设备 ID 必须保持一致：主题中的 deviceId 必须等于消息 JSON 中的 deviceId。', content: sections.topics },
  { key: 'statusMessage', title: '三、设备上报消息', description: '设备上线、心跳和遥测都可以使用 status 或 telemetry 类型。后台收到有效消息后会更新设备在线状态。', content: sections.statusMessage },
  { key: 'eventMessage', title: '四、设备事件和指令应答', description: '事件和指令应答使用相同的基础消息结构。当前后台会接收并记录消息，指令应答的业务结果关联功能待后续扩展。', content: sections.eventMessage },
  { key: 'apis', title: '五、后台 REST API', description: '接口基础地址为 /api/feifei-devices，所有接口都需要登录后的 JWT。', content: sections.apis },
  { key: 'command', title: '六、发送设备指令', description: 'REST API 返回成功只代表后台已将消息交给 MQTT 客户端发布，设备执行结果通过 command_ack 主题上报。', content: sections.command },
  { key: 'rules', title: '七、状态规则和接入检查', description: '', content: sections.rules },
];

/** 复制指定文档片段，便于直接发送给设备开发人员。 */
async function copySection(section: string): Promise<void> {
  const sectionKey = section as keyof typeof sections;
  await copyText(sections[sectionKey]);
}

/** 复制整篇接入文档，内容包含设备协议和后台 REST API。 */
async function copyFullDocument(): Promise<void> {
  const fullDocument = apiSections.map((item) => `【${item.title}】\n${item.content}`).join('\n\n');
  await copyText(fullDocument);
}

/** 使用浏览器剪贴板 API 复制文本，并给出明确的成功或失败提示。 */
async function copyText(content: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(content);
    ElMessage.success('文档内容已复制');
  } catch {
    ElMessage.error('复制失败，请检查浏览器剪贴板权限');
  }
}
</script>

<style scoped>
.device-docs { padding: 20px; }
.docs-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.docs-header h2 { margin: 0 0 8px; color: #1f2937; }
.docs-header p { margin: 0; color: #606266; }
.docs-tabs { background: #fff; }
.doc-section { padding: 18px 4px; border-bottom: 1px solid #ebeef5; }
.doc-section:last-child { border-bottom: 0; }
.section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.doc-section h3 { margin: 0 0 12px; color: #303133; }
.doc-section p, .doc-section li { color: #606266; line-height: 1.8; }
.doc-section ol { padding-left: 24px; }
.doc-section code { padding: 2px 5px; border-radius: 3px; background: #f4f4f5; color: #c03639; }
.doc-section pre { overflow-x: auto; margin: 12px 0 0; padding: 16px; border-radius: 6px; background: #1f2937; color: #e5e7eb; line-height: 1.6; white-space: pre-wrap; }
.doc-section pre code { padding: 0; background: transparent; color: inherit; }
.notice { padding: 10px 12px; border-left: 3px solid #409eff; background: #ecf5ff; }
</style>
