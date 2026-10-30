# 第 3 阶段：MQTT 应用落地方案

## 1. 文档信息

- 阶段编号：03
- 阶段名称：MQTT 应用
- 文档版本：V1.0
- 制定日期：2026-10-30
- 应用编码：`mqtt`
- 应用名称：MQTT 接入应用

本阶段在现有“基础平台 + 应用扩展”架构中新增 MQTT 应用。MQTT 应用负责连接 EMQX 服务器、管理多个 MQTT 连接配置、管理订阅、接收消息、发布消息，并向后台其他应用提供统一调用接口。

MQTT 应用不直接实现具体设备业务。设备管理、告警、数据采集、OTA 等业务应用通过 MQTT 应用提供的接口完成消息接入和发送，从而避免每个业务应用重复维护 MQTT 客户端连接。

## 2. 当前 EMQX 环境

当前已经部署 EMQX，连接信息如下：

| 配置项 | 当前值 | 用途 |
|---|---|---|
| EMQX 管理地址 | `http://111.228.3.219:18083` | 浏览器登录 EMQX 管理控制台 |
| MQTT 地址 | `mqtt://111.228.3.219:1883` | 设备和后台使用的 MQTT TCP 连接 |
| WebSocket 地址 | `ws://111.228.3.219:8083/mqtt` | 浏览器或 WebSocket 客户端连接 |
| 管理员账号 | `admin` | EMQX 管理控制台账号 |
| 管理员密码 | 已由部署方提供 | 仅用于初始配置，禁止写入代码和 Git |

安全要求：

1. EMQX 管理员密码不得写入前端代码、接口响应、日志、提交记录或应用清单。
2. 后台数据库中的 MQTT 密码必须使用加密密文保存，接口只返回是否已配置，不返回明文密码。
3. 首次登录 EMQX 后必须修改初始管理员密码。
4. 生产环境优先启用 TLS，并使用 `mqtts://` 和 `wss://` 地址。
5. EMQX 管理端口 `18083` 只允许管理人员或指定管理网段访问。
6. MQTT 设备账号和 EMQX 管理员账号必须分离，设备不能使用 `admin` 账号连接 MQTT。

## 3. 建设目标

### 3.1 MQTT 应用必须实现

1. 在应用商店中作为独立应用安装、启用、停用和卸载。
2. 支持配置多个 MQTT 服务器连接。
3. 每个连接配置支持独立的客户端 ID、认证信息、TLS 参数和订阅规则。
4. 支持同一个 MQTT 服务器建立多个逻辑连接，满足不同应用使用不同订阅节点的需求。
5. 支持订阅、取消订阅和发布消息。
6. 支持 QoS、Retain、Keep Alive 和自动重连。
7. 支持连接状态、最后连接时间、最后错误信息和消息统计。
8. 向后台其他应用提供统一的发布、订阅和请求响应接口。
9. 提供应用内置帮助文档，并通过侧边栏分类展示。
10. 为设备心跳、指令应答、数据上报和 OTA 预留扩展能力。

### 3.2 明确不在 MQTT 应用中实现

1. 不在 MQTT 应用中写死某一种设备协议。
2. 不在 MQTT 应用中直接实现设备列表、设备分组和设备业务状态。
3. 不在 MQTT 应用中直接处理 OTA 固件升级业务。
4. 不允许其他应用直接创建 MQTT 客户端连接绕过 MQTT 应用。

## 4. 应用在平台中的位置

MQTT 应用属于应用程序层，依赖平台核心的以下能力：

- 应用安装、启用、停用和配置持久化。
- JWT 管理员认证。
- 权限校验。
- 审计日志。
- PostgreSQL 和 TypeORM。
- 动态菜单。

设备管理应用、告警应用和 OTA 应用依赖 MQTT 应用：

```text
设备管理应用 ─┐
告警应用     ├── 调用 MQTT 应用 ── EMQX ── ESP32设备
OTA 应用     ┘
```

## 5. 应用菜单和文档侧边栏

MQTT 应用安装并启用后，在后台侧边栏显示“MQTT 管理”。菜单结构如下：

```text
MQTT 管理
├── 连接配置
├── 订阅管理
├── 消息发布
├── 消息记录
├── 运行状态
└── 使用文档
    ├── 应用介绍
    ├── EMQX 部署
    ├── 添加连接配置
    ├── 创建订阅
    ├── 发布消息
    ├── 其他应用接入
    ├── 设备接入规范
    ├── 安全配置
    └── 常见问题
```

### 5.1 页面职责

| 页面 | 功能 |
|---|---|
| 连接配置 | 新增、编辑、测试、启用、停用和删除 MQTT 连接 |
| 订阅管理 | 按连接配置管理主题、QoS 和消息处理状态 |
| 消息发布 | 选择连接、填写主题和 Payload，发布测试消息 |
| 消息记录 | 查看接收和发布记录，支持连接和主题筛选 |
| 运行状态 | 显示每个连接的连接状态、重连次数和消息统计 |
| 使用文档 | 通过左侧文档目录切换不同说明内容 |

### 5.2 应用清单菜单

MQTT 应用清单应声明以下内容：

```json
{
  "name": "MQTT 管理",
  "code": "mqtt",
  "version": "1.0.0",
  "description": "统一管理多个 MQTT 服务器连接、订阅和消息发布",
  "permissions": [
    "mqtt:config:read",
    "mqtt:config:write",
    "mqtt:subscription:read",
    "mqtt:subscription:write",
    "mqtt:message:publish",
    "mqtt:message:read"
  ],
  "menus": [
    {
      "name": "MQTT 管理",
      "path": "/mqtt",
      "component": "MqttLayout",
      "icon": "Connection",
      "sort": 20,
      "children": [
        { "name": "连接配置", "path": "/mqtt/connections", "component": "MqttConnections" },
        { "name": "订阅管理", "path": "/mqtt/subscriptions", "component": "MqttSubscriptions" },
        { "name": "消息发布", "path": "/mqtt/publish", "component": "MqttPublish" },
        { "name": "消息记录", "path": "/mqtt/messages", "component": "MqttMessages" },
        { "name": "运行状态", "path": "/mqtt/status", "component": "MqttStatus" },
        { "name": "使用文档", "path": "/mqtt/docs", "component": "MqttDocs" }
      ]
    }
  ],
  "dependencies": [],
  "apis": ["/api/mqtt/*"]
}
```

## 6. 多 MQTT 连接配置

MQTT 应用不使用单例连接配置，必须使用 `mqtt_connections` 表保存多个连接。每个业务应用通过 `connectionCode` 指定使用哪一个连接。

### 6.1 连接配置字段

```text
id
connection_code
name
description
protocol
host
port
path
username
password_ciphertext
client_id
clean_session
keep_alive
connect_timeout
reconnect_min_delay
reconnect_max_delay
tls_enabled
ca_certificate_ciphertext
client_certificate_ciphertext
client_key_ciphertext
status
last_connected_at
last_disconnected_at
last_error
reconnect_count
created_at
updated_at
```

字段规则：

1. `connection_code` 在平台内唯一，只允许字母、数字、下划线和短横线。
2. `protocol` 支持 `mqtt`、`mqtts`、`ws`、`wss`。
3. `host` 只保存主机名或 IP，不把用户名密码拼接进 URL。
4. `path` 仅用于 WebSocket，例如 `/mqtt`。
5. `client_id` 每个实际 MQTT 连接必须唯一。
6. `status` 支持 `enabled` 和 `disabled`。
7. 密码和证书使用应用密钥加密后保存。
8. 连接配置停用后，后台立即断开对应客户端，并停止该连接的订阅。

### 6.2 当前 EMQX 初始连接配置

建议在后台新增以下配置：

```text
连接名称：当前 EMQX
连接编码：emqx-main
协议：mqtt
主机：111.228.3.219
端口：1883
用户名：使用专用 MQTT 业务账号，不使用 EMQX 管理员账号
密码：通过后台密码输入框保存
客户端 ID：xn-platform-emqx-main
Keep Alive：60
自动重连：启用
状态：启用
```

EMQX 管理控制台的 `admin` 账号只用于登录 `18083` 管理页面，不作为后台业务 MQTT 客户端账号。

## 7. 订阅管理

### 7.1 订阅字段

新增 `mqtt_subscriptions` 表：

```text
id
connection_id
subscription_code
name
topic_filter
qos
no_local
retain_as_published
retain_handling
consumer_code
status
message_count
last_message_at
created_at
updated_at
```

### 7.2 订阅规则

1. `topic_filter` 支持 MQTT 标准通配符 `+` 和 `#`。
2. 订阅必须绑定一个 `connection_id`。
3. 同一个连接的相同主题过滤器不能重复启用。
4. `consumer_code` 标识消息交给哪个后台应用处理。
5. MQTT 应用收到消息后先校验连接、主题和订阅状态，再分发给消费者。
6. 消费者处理失败时记录错误，不影响其他订阅继续收消息。
7. 需要可靠处理的消息使用 QoS 1；普通遥测消息使用 QoS 0。
8. 不使用 MQTT 共享订阅替代应用级消费者标识；需要横向扩展时再增加共享订阅配置。

### 7.3 订阅示例

设备状态订阅：

```text
连接：emqx-main
主题：xn/+/+/status
QoS：1
消费者：device-manager
```

设备数据订阅：

```text
连接：emqx-main
主题：xn/+/+/telemetry
QoS：0
消费者：device-manager
```

外部应用订阅：

```text
连接：third-party-iot
主题：customer/+/event
QoS：1
消费者：alarm
```

## 8. MQTT 应用内部服务设计

后端新增以下目录：

```text
backend/src/apps/mqtt/
├── mqtt.module.ts
├── mqtt.controller.ts
├── mqtt.service.ts
├── mqtt-connection.service.ts
├── mqtt-subscription.service.ts
├── mqtt-message.service.ts
├── mqtt-consumer.registry.ts
├── dto/
├── entities/
└── consumers/
```

### 8.1 `MqttConnectionService`

负责：

- 根据数据库配置创建 MQTT 客户端。
- 管理多个连接实例。
- 建立连接、断开连接和自动重连。
- 应用启动时加载所有启用配置。
- 配置修改后只重建被修改的连接。
- 应用停用时断开所有连接。
- 记录连接状态和错误。

### 8.2 `MqttSubscriptionService`

负责：

- 加载启用订阅。
- 执行订阅和取消订阅。
- 连接重连后恢复订阅。
- 校验主题过滤器和 QoS。
- 将消息路由给指定消费者。

### 8.3 `MqttMessageService`

负责：

- 发布消息。
- 统一处理 QoS、Retain 和消息编码。
- 记录发布结果。
- 生成消息 ID。
- 对外提供请求响应能力。

### 8.4 `MqttConsumerRegistry`

后台其他应用启动时注册消费者：

```typescript
register(
  consumerCode: string,
  handler: (message: MqttInboundMessage) => Promise<void>,
): void;
```

MQTT 应用只负责接收、校验和分发，不把设备业务代码写入 MQTT 模块。

## 9. 对外提供给其他后台应用的接口

其他应用优先调用应用服务接口，不直接操作数据库，也不直接创建 MQTT 客户端。

### 9.1 发布消息服务接口

```typescript
interface MqttPublishRequest {
  connectionCode: string;
  topic: string;
  payload: string | Record<string, unknown>;
  qos?: 0 | 1 | 2;
  retain?: boolean;
  requestId?: string;
}

interface MqttPublishResult {
  success: boolean;
  messageId: string;
  connectionCode: string;
  topic: string;
}
```

调用示例：

```typescript
await mqttService.publish({
  connectionCode: 'emqx-main',
  topic: 'xn/xn_device/ESP32AABBCCDD/command',
  payload: {
    version: 1,
    messageId: 'message-001',
    type: 'command',
    deviceId: 'ESP32AABBCCDD',
    timestamp: Date.now(),
    requestId: 'command-001',
    data: { command: 'device_ping', params: {} },
  },
  qos: 1,
  retain: false,
});
```

### 9.2 注册订阅服务接口

```typescript
interface MqttSubscribeRequest {
  connectionCode: string;
  subscriptionCode: string;
  topicFilter: string;
  qos: 0 | 1 | 2;
  consumerCode: string;
  handler: (message: MqttInboundMessage) => Promise<void>;
}
```

设备管理应用注册示例：

```typescript
await mqttService.subscribe({
  connectionCode: 'emqx-main',
  subscriptionCode: 'device-status',
  topicFilter: 'xn/+/+/status',
  qos: 1,
  consumerCode: 'device-manager',
  handler: async (message) => {
    await deviceService.handleMqttStatus(message);
  },
});
```

### 9.3 请求响应接口

用于设备指令、查询和控制场景：

```typescript
interface MqttRequestOptions {
  connectionCode: string;
  publishTopic: string;
  responseTopic: string;
  payload: string | Record<string, unknown>;
  qos?: 0 | 1 | 2;
  timeoutMs?: number;
  requestId?: string;
}

const response = await mqttService.request(options);
```

请求响应必须使用 `requestId` 关联请求和应答，超时后返回明确的超时错误，不允许无限等待。

### 9.4 HTTP 接口

MQTT 应用对后台管理前端和受授权的内部调用提供以下 REST API：

```text
GET    /api/mqtt/connections
POST   /api/mqtt/connections
GET    /api/mqtt/connections/:id
PATCH  /api/mqtt/connections/:id
POST   /api/mqtt/connections/:id/test
POST   /api/mqtt/connections/:id/reconnect
POST   /api/mqtt/connections/:id/enable
POST   /api/mqtt/connections/:id/disable
DELETE /api/mqtt/connections/:id

GET    /api/mqtt/subscriptions
POST   /api/mqtt/subscriptions
PATCH  /api/mqtt/subscriptions/:id
POST   /api/mqtt/subscriptions/:id/enable
POST   /api/mqtt/subscriptions/:id/disable
DELETE /api/mqtt/subscriptions/:id

POST   /api/mqtt/publish
GET    /api/mqtt/messages
GET    /api/mqtt/status
```

HTTP 接口必须经过现有 JWT Guard 和权限 Guard。敏感字段不能在响应中返回明文。

## 10. 设备接入规范

MQTT 应用只规定通用传输能力，设备业务协议统一使用以下主题格式：

```text
xn/{productCode}/{deviceId}/{messageType}
```

基础主题：

```text
xn/{productCode}/{deviceId}/status
xn/{productCode}/{deviceId}/telemetry
xn/{productCode}/{deviceId}/event
xn/{productCode}/{deviceId}/command
xn/{productCode}/{deviceId}/command_ack
xn/{productCode}/{deviceId}/ota
```

统一消息格式：

```json
{
  "version": 1,
  "messageId": "唯一消息编号",
  "type": "heartbeat",
  "deviceId": "ESP32AABBCCDD",
  "timestamp": 1761800000000,
  "requestId": null,
  "data": {}
}
```

MQTT 应用不修改业务 Payload，只负责传输、记录和分发。设备管理应用负责解析 `status`、`heartbeat`、`command_ack` 等业务消息。

## 11. EMQX 部署文档内容

应用内“EMQX 部署”文档必须包含以下内容。

### 11.1 访问控制台

```text
地址：http://111.228.3.219:18083
```

登录后首先修改初始管理员密码，随后创建后台业务账号和设备认证账号。

### 11.2 创建后台业务账号

建议创建专用账号：

```text
账号：xn_platform_mqtt
用途：后台 MQTT 应用连接 EMQX
权限：允许订阅和发布约定业务主题
```

### 11.3 创建设备账号

每台设备使用独立账号：

```text
账号：device_{deviceId}
用途：单台 ESP32 设备
权限：只允许访问自身主题
```

### 11.4 配置 ACL

设备 `ESP32AABBCCDD` 的权限示例：

```text
允许发布：xn/xn_device/ESP32AABBCCDD/status
允许发布：xn/xn_device/ESP32AABBCCDD/telemetry
允许发布：xn/xn_device/ESP32AABBCCDD/event
允许发布：xn/xn_device/ESP32AABBCCDD/command_ack
允许订阅：xn/xn_device/ESP32AABBCCDD/command
允许订阅：xn/xn_device/ESP32AABBCCDD/ota
拒绝访问：其他 deviceId 的所有主题
```

### 11.5 连接测试

连接配置保存后，后台执行以下检查：

1. TCP 连接成功。
2. MQTT CONNECT 认证成功。
3. 订阅主题成功。
4. 发布测试消息成功。
5. 连接状态写入数据库。
6. 错误原因写入 `last_error`，并展示给管理员。

## 12. 数据库实体

新增实体文件：

```text
backend/src/apps/mqtt/entities/mqtt-connection.entity.ts
backend/src/apps/mqtt/entities/mqtt-subscription.entity.ts
backend/src/apps/mqtt/entities/mqtt-message.entity.ts
```

### 12.1 `mqtt_connections`

保存多个 MQTT 服务器连接配置、认证参数和连接状态。

### 12.2 `mqtt_subscriptions`

保存连接对应的主题过滤器、QoS、消费者和启用状态。

### 12.3 `mqtt_messages`

保存必要的消息审计信息：

```text
id
direction
connection_code
topic
qos
retain
payload_hash
payload_preview
message_id
consumer_code
status
error_message
created_at
```

出于存储和安全要求，不默认保存所有消息完整 Payload。业务应用需要保存业务数据时，由业务应用使用自己的数据表保存。

## 13. 权限和审计

权限划分：

| 权限 | 说明 |
|---|---|
| `mqtt:config:read` | 查看连接配置，密码只显示已配置状态 |
| `mqtt:config:write` | 新增、修改和删除连接配置 |
| `mqtt:subscription:read` | 查看订阅 |
| `mqtt:subscription:write` | 新增、修改和删除订阅 |
| `mqtt:message:publish` | 手动发布消息 |
| `mqtt:message:read` | 查看消息记录 |
| `mqtt:status:read` | 查看连接运行状态 |

以下操作必须写入现有审计日志：

- 新增、修改、删除 MQTT 连接。
- 测试连接和手动重连。
- 新增、修改、启用和停用订阅。
- 后台手动发布消息。
- 连接认证失败和持续重连失败。

## 14. 可靠性要求

1. 后台启动时加载全部启用连接。
2. 单个 MQTT 连接失败不能阻塞其他连接。
3. 单个订阅处理失败不能导致 MQTT 客户端断开。
4. 连接断开后采用递增延迟自动重连。
5. 重连成功后自动恢复该连接的所有启用订阅。
6. 应用停用或卸载前先停止订阅并断开客户端。
7. 配置更新必须持久化到数据库，重启后仍然生效。
8. 不能把连接实例保存在单次 HTTP 请求中。
9. 后台发布成功只代表消息交给 MQTT 客户端，设备业务成功必须等待设备应答。
10. 连接状态、重连次数和最后错误必须可以在后台页面查看。

## 15. 开发文件规划

### 后端

```text
backend/src/apps/mqtt/mqtt.module.ts
backend/src/apps/mqtt/mqtt.controller.ts
backend/src/apps/mqtt/mqtt.service.ts
backend/src/apps/mqtt/mqtt-connection.service.ts
backend/src/apps/mqtt/mqtt-subscription.service.ts
backend/src/apps/mqtt/mqtt-message.service.ts
backend/src/apps/mqtt/mqtt-consumer.registry.ts
backend/src/apps/mqtt/entities/mqtt-connection.entity.ts
backend/src/apps/mqtt/entities/mqtt-subscription.entity.ts
backend/src/apps/mqtt/entities/mqtt-message.entity.ts
backend/src/apps/mqtt/dto/*.ts
```

### 前端

```text
frontend/src/apps/mqtt/MqttLayout.vue
frontend/src/apps/mqtt/MqttConnections.vue
frontend/src/apps/mqtt/MqttSubscriptions.vue
frontend/src/apps/mqtt/MqttPublish.vue
frontend/src/apps/mqtt/MqttMessages.vue
frontend/src/apps/mqtt/MqttStatus.vue
frontend/src/apps/mqtt/MqttDocs.vue
frontend/src/apps/mqtt/docs/*.md
```

### 依赖

后端增加 MQTT 客户端依赖，统一由 MQTT 应用封装，业务应用不得直接依赖 MQTT 客户端库：

```text
TypeScript/NestJS：mqtt
```

## 16. 开发顺序

1. 增加 MQTT 应用目录、应用清单和菜单。
2. 增加 MQTT 客户端依赖和数据库实体。
3. 实现多连接加载、连接、断开和自动重连。
4. 实现连接配置接口和连接测试接口。
5. 实现订阅管理和重连恢复订阅。
6. 实现发布消息接口和消息审计。
7. 实现消费者注册机制。
8. 实现 MQTT 管理前端页面。
9. 实现应用内置文档侧边栏和文档内容。
10. 接入设备管理应用，验证设备上线、心跳和指令应答。
11. 增加 OTA 应用对 MQTT 应用的调用。

所有部署和编译脚本继续放在项目对应的 `build` 目录中，不能把部署脚本放到临时目录或应用源码目录。

## 17. 验收标准

### 多连接

- 后台可以保存至少两个不同 MQTT 服务器配置。
- 两个配置可以同时连接且状态互不影响。
- 修改其中一个配置不会断开另一个配置。

### 订阅

- 每个连接可以配置多个订阅。
- 订阅支持 QoS 0、QoS 1 和启用/停用。
- 连接重连后自动恢复启用订阅。
- 消息可以按照 `consumerCode` 分发到指定应用。

### 发布

- 后台可以选择连接配置发布消息。
- 其他后台应用可以通过服务接口发布消息。
- 发布失败返回明确的连接、主题或认证错误。

### 安全

- MQTT 密码不出现在接口响应和日志中。
- 设备账号不能访问其他设备主题。
- EMQX 管理员账号不能作为业务 MQTT 账号使用。
- 所有配置变更和手动发布操作进入审计日志。

### 扩展

- 设备管理应用可以通过 MQTT 应用订阅设备状态。
- 设备管理应用可以通过 MQTT 应用向设备发布指令。
- OTA 应用可以复用 MQTT 应用发送 OTA 任务通知。
- 新业务应用不需要重新实现 MQTT 连接管理。

