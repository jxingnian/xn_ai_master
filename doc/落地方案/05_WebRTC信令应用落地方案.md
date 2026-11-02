# 第 5 阶段：WebRTC 信令应用

## 1. 文档信息

- 阶段编号：05
- 阶段名称：WebRTC 信令应用
- 文档版本：V1.0
- 制定日期：2026-11-01
- 应用编码：`webrtc-signaling`
- 应用名称：WebRTC 音视频通话
- 应用分类：通信服务
- 前置应用：MQTT 应用
- 集成应用：凤飞飞设备应用及未来其他设备应用

本阶段建设一个可从应用商店安装的独立应用。应用负责 WebRTC 通话会话、信令交换、STUN/TURN 配置、通话记录、实时监控和 MQTT 通话消息消费；不负责音视频媒体转发。音视频媒体由浏览器和设备端 WebRTC 实现直接建立连接，STUN/TURN 只负责连接建立过程中的地址发现和中继。

## 2. 建设目标和边界

### 2.1 必须实现

1. 应用商店可安装、启用、停用和卸载，并声明对 MQTT 应用的依赖。
2. 安装后显示“视频通话”菜单，包含 STUN/TURN 配置、通话记录和实时通话监控页面。
3. 提供前端连接用的 WebSocket 接口：`/api/webrtc-signaling/ws`。
4. 提供创建会话、查询记录、配置管理、结束会话和监控查询 HTTP 接口。
5. 支持浏览器与设备之间的 `offer`、`answer`、`ice-candidate`、挂断和错误信令交换。
6. 通过 MQTT 应用注册消费者，接收设备上报的通话信令消息，并通过 MQTT 应用发布下行信令。
7. 持久化会话、配置和事件日志；服务重启后历史记录可查询，进行中的会话按明确规则恢复或结束。
8. 对会话参与者、设备归属、权限、会话状态和消息序列执行服务端校验。

### 2.2 明确不实现

1. 不在本应用中创建独立 MQTT 客户端，所有设备消息通过 MQTT 应用收发。
2. 不将 WebRTC 的音视频 RTP/RTCP 媒体流转发到本应用。
3. 不通过自定义 TCP/UDP 端口给设备提供通话接口；设备信令使用 MQTT，前端信令使用现有后台 HTTP 服务下的 WebSocket 路径。
4. 不把 STUN/TURN 密钥明文返回前端；前端只接收短期有效的 ICE Server 配置。
5. 不把设备密码、MQTT 密码、TURN 长期密钥或完整敏感 Payload 写入普通日志。

## 3. 平台位置和依赖关系

```text
后台前端浏览器
    │ HTTP / WebSocket
    ▼
WebRTC 信令应用 ── PostgreSQL
    │ 服务调用
    ▼
MQTT 应用 ── EMQX ── 凤飞飞设备
    │
    └── STUN/TURN 配置提供给浏览器和设备 WebRTC 客户端
```

### 3.1 依赖条件

安装前由核心应用管理器检查：

1. MQTT 应用已安装并处于启用状态。
2. 当前管理员具有应用安装权限。
3. 数据库迁移可以执行。
4. 平台已经提供 JWT 认证、权限校验、动态菜单、审计日志和 WebSocket 基础能力。

MQTT 应用停用时，WebRTC 信令应用必须停止新会话创建和设备信令下发，并将原因记录为“MQTT 应用不可用”。MQTT 应用卸载前必须先阻止 WebRTC 信令应用继续使用消费者注册接口。

## 4. 应用清单、菜单和权限

### 4.1 应用清单

应用商店清单至少包含以下内容：

```json
{
  "name": "WebRTC音视频通话",
  "code": "webrtc-signaling",
  "version": "1.0.0",
  "category": "communication",
  "description": "提供设备音视频通话的WebRTC信令、STUN/TURN配置和通话记录",
  "dependencies": ["mqtt"],
  "permissions": [
    "webrtc:config:read",
    "webrtc:config:write",
    "webrtc:session:create",
    "webrtc:session:read",
    "webrtc:session:terminate",
    "webrtc:monitor:read"
  ],
  "apis": [
    "/api/webrtc-signaling/*"
  ]
}
```

### 4.2 侧边栏菜单

安装并启用后显示：

```text
视频通话
├── STUN/TURN配置       /webrtc-signaling/config
├── 通话记录             /webrtc-signaling/sessions
└── 实时通话监控         /webrtc-signaling/monitor
```

菜单只由应用安装记录驱动。应用停用或卸载后，核心菜单服务必须隐藏入口；停用不会删除数据，卸载是否删除历史记录由卸载向导确认。

### 4.3 权限规则

| 权限 | 作用 |
|---|---|
| `webrtc:config:read` | 查看 STUN/TURN 地址、启用状态和脱敏配置 |
| `webrtc:config:write` | 新增、修改、启用和停用 STUN/TURN 配置 |
| `webrtc:session:create` | 创建通话会话和发起呼叫 |
| `webrtc:session:read` | 查询本人有权限访问的会话和事件 |
| `webrtc:session:terminate` | 结束本人有权限访问的会话 |
| `webrtc:monitor:read` | 查看全部实时通话状态和异常事件 |

服务端每次创建会话、加入会话、发送信令和结束会话都重新校验用户与设备的授权关系，不能使用前端传入的设备名称或页面状态作为授权依据。

## 5. 通话模型和状态机

### 5.1 会话参与者

一个会话包含两个角色：

- `caller`：后台用户或其他授权业务应用发起方。
- `callee`：凤飞飞设备或未来接入的摄像头、可视门铃等设备。

当前版本固定为一对一通话，不允许一个会话同时加入多个设备或多个后台用户。后续多人通话必须新增会话类型和权限规则，不能复用一对一会话的隐含逻辑。

### 5.2 会话状态

```text
created     已创建，等待设备响应
ringing     已向设备发送呼叫，等待接听
connecting  已交换部分 WebRTC 信令，正在建立媒体连接
connected   已建立 WebRTC 连接
ended       正常结束
rejected    设备拒绝
cancelled   发起方取消
timeout     超时未接听或未完成连接
failed      信令或连接失败
```

合法状态迁移固定为：

```text
created -> ringing -> connecting -> connected -> ended
created -> cancelled
created -> timeout
ringing -> rejected / cancelled / timeout / connecting
connecting -> connected / failed / cancelled / timeout
connected -> ended / failed
```

终态包括 `ended`、`rejected`、`cancelled`、`timeout` 和 `failed`。进入终态后拒绝新的 SDP、ICE、接听和拒绝消息，重复结束消息只记录去重事件，不重复修改结束时间。

### 5.3 固定超时规则

1. `created` 状态 30 秒内没有成功发送呼叫，进入 `failed`。
2. `ringing` 状态默认 60 秒未收到接听或拒绝，进入 `timeout`。
3. `connecting` 状态默认 30 秒未进入 `connected`，进入 `timeout`。
4. `connected` 状态通过 WebSocket 心跳和设备状态维持；连续 3 个心跳周期未收到有效消息，进入 `failed`，默认心跳周期为 15 秒。
5. 所有超时由服务端定时任务执行，不能只依赖前端定时器。

## 6. 信令协议

### 6.1 WebSocket 连接

前端使用已登录用户的 JWT 建立连接：

```text
GET /api/webrtc-signaling/ws
Authorization: Bearer <JWT>
```

如果浏览器环境不允许在 WebSocket 握手中发送 Authorization，允许使用一次性短期 `wsToken`，该令牌只能绑定当前用户、有效期不超过 60 秒、只能使用一次，不能把长期 JWT 放进 URL 查询参数。

连接建立后服务端返回：

```json
{
  "type": "connected",
  "connectionId": "ws-01J...",
  "serverTime": "2026-11-01T10:00:00.000Z",
  "heartbeatIntervalMs": 15000
}
```

### 6.2 通用消息格式

所有 WebSocket 消息使用统一结构：

```json
{
  "messageId": "01JWEBRTC0001",
  "sessionId": "01JSESSION0001",
  "type": "webrtc.offer",
  "sequence": 1,
  "timestamp": "2026-11-01T10:00:01.000Z",
  "payload": {}
}
```

服务端负责生成和校验 `messageId`、`sessionId`、`sequence`、消息方向和会话参与者。`sequence` 必须递增；重复 `messageId` 只返回已处理结果，不重复转发。

### 6.3 消息类型

| 类型 | 方向 | 说明 |
|---|---|---|
| `call.invite` | 前端 -> 服务端 -> MQTT | 发起呼叫，服务端自动生成会话 |
| `call.accept` | 设备 -> 服务端 -> 前端 | 设备接听 |
| `call.reject` | 设备 -> 服务端 -> 前端 | 设备拒绝 |
| `call.cancel` | 任一参与方 -> 服务端 | 取消呼叫 |
| `call.end` | 任一参与方 -> 服务端 | 结束通话 |
| `webrtc.offer` | 发起方 -> 服务端 -> 对端 | SDP Offer |
| `webrtc.answer` | 接听方 -> 服务端 -> 对端 | SDP Answer |
| `webrtc.ice-candidate` | 任一参与方 -> 服务端 -> 对端 | ICE Candidate |
| `webrtc.ice-complete` | 任一参与方 -> 服务端 -> 对端 | ICE 收集完成 |
| `ping` / `pong` | 双向 | 连接保活 |
| `error` | 服务端 -> 客户端 | 明确错误码和处理结果 |

信令 Payload 只允许 SDP、ICE 和通话控制字段，单条消息限制为 64 KB。服务端必须校验 SDP 类型、ICE candidate 字段、会话状态和发送方身份，禁止将任意对象直接转发给对端。

### 6.4 设备 MQTT 主题

设备通话消息必须使用 MQTT 应用提供的业务主题：

```text
设备上报：xn/xn_device/{deviceId}/webrtc_signal
后台下发：xn/xn_device/{deviceId}/webrtc_command
```

消息使用 MQTT 应用统一消息格式，业务数据示例：

```json
{
  "version": 1,
  "messageId": "01JWEBRTC0002",
  "type": "webrtc.offer",
  "deviceId": "ESP32AABBCCDD",
  "timestamp": 1761981601000,
  "requestId": "01JSESSION0001",
  "data": {
    "sessionId": "01JSESSION0001",
    "sequence": 2,
    "sdp": "v=0..."
  }
}
```

设备应用只能发布自身 `deviceId` 的上报主题和订阅自身的下发主题。WebRTC 信令应用通过 MQTT 消费者 `webrtc-signaling` 接收消息，不能绕过 MQTT 应用直接连接 EMQX。

## 7. 会话流程

```text
用户打开凤飞飞设备详情
  -> 点击“视频通话”
  -> 设备应用调用 POST /api/webrtc-signaling/sessions
  -> 信令应用校验用户、设备和在线状态
  -> 创建 webrtc_session，状态 created
  -> 通过 MQTT 应用发送 call.invite
  -> 状态变为 ringing
  -> 设备通过 MQTT 返回 accept/reject
  -> accept 后交换 offer/answer/ICE
  -> 服务端记录每条事件并转发到 WebSocket
  -> WebRTC 连接成功，状态 connected
  -> 任一方结束或超时，写入终态和结束原因
```

### 7.1 创建会话

```http
POST /api/webrtc-signaling/sessions
```

请求：

```json
{
  "deviceId": "ESP32AABBCCDD",
  "callType": "audio_video"
}
```

服务端必须按顺序校验：应用已启用、MQTT 应用可用、用户拥有设备访问权限、设备已启用、设备在线、设备没有其他进行中的会话。校验通过后在事务中创建会话和第一条事件，再发布呼叫消息；MQTT 发布失败必须将会话置为 `failed` 并记录明确错误。

响应：

```json
{
  "sessionId": "01JSESSION0001",
  "status": "ringing",
  "deviceId": "ESP32AABBCCDD",
  "callType": "audio_video",
  "iceServers": [
    { "urls": ["stun:stun.l.google.com:19302"] }
  ],
  "expiresAt": "2026-11-01T10:01:00.000Z"
}
```

`iceServers` 中的 TURN 用户名和凭据必须是短期凭据，返回时按当前会话生成，不能返回数据库中的长期密钥。

### 7.2 WebRTC 交换

浏览器收到会话响应后建立 `RTCPeerConnection`，通过 WebSocket 发送 `webrtc.offer` 和 `webrtc.ice-candidate`。设备返回 `call.accept` 后发送 `webrtc.answer` 和 ICE Candidate。服务端对每条消息执行会话状态、方向、序列号和 Payload 校验，再分别写入事件日志和转发目标端。

### 7.3 结束会话

```http
POST /api/webrtc-signaling/sessions/{sessionId}/terminate
```

请求：

```json
{
  "reason": "user_hangup"
}
```

结束操作必须幂等。首次结束写入终态、结束时间和原因，并通过 MQTT 或 WebSocket 通知另一方；重复请求返回当前终态，不新增重复结束事件。

## 8. HTTP API

```text
POST   /api/webrtc-signaling/sessions
GET    /api/webrtc-signaling/sessions
GET    /api/webrtc-signaling/sessions/:id
POST   /api/webrtc-signaling/sessions/:id/terminate
GET    /api/webrtc-signaling/sessions/:id/events

GET    /api/webrtc-signaling/config
PUT    /api/webrtc-signaling/config
POST   /api/webrtc-signaling/config/test
POST   /api/webrtc-signaling/config/enable
POST   /api/webrtc-signaling/config/disable

GET    /api/webrtc-signaling/monitor/active
GET    /api/webrtc-signaling/monitor/summary
GET    /api/webrtc-signaling/ws-token
```

所有 HTTP 接口必须使用现有 JWT Guard 和权限 Guard。列表接口必须分页，支持设备、用户、状态、通话类型、开始时间和结束时间筛选；事件接口默认只返回脱敏摘要，管理员需要查看 SDP/ICE 原文时必须拥有单独审计权限。

## 9. 数据库设计

### 9.1 `webrtc_session` 通话会话表

```text
id
session_id                 全局唯一会话编号
device_id                  设备业务 ID
caller_user_id             发起用户 ID
call_type                  audio/video/audio_video
status                     会话状态
current_sequence           当前已处理序列号
started_at                 首次创建时间
ringing_at                 发送呼叫时间
connected_at               建立媒体连接时间
ended_at                   结束时间
end_reason                 结束原因
last_error_code            最后错误码
created_at
updated_at
```

约束：`session_id` 唯一；进行中的会话按 `device_id + status` 建立唯一部分索引；`current_sequence` 不允许回退；设备、用户和应用删除使用外键或业务删除策略保持历史记录可追溯。

### 9.2 `webrtc_config` STUN/TURN 配置表

```text
id
name
stun_urls_json             STUN 地址数组
turn_urls_json             TURN 地址数组
turn_username_ciphertext   TURN 用户名密文
turn_secret_ciphertext     TURN 长期密钥密文
turn_credential_mode       static/temporary
enabled
is_default
created_at
updated_at
```

同一时间只允许一个启用的默认配置。STUN/TURN 地址只允许 `stun:`、`stuns:`、`turn:`、`turns:` 协议；禁止把用户名密码拼进 URL。配置读取接口只返回地址、是否配置和状态，不返回密文。

### 9.3 `webrtc_event_log` 通话事件日志表

```text
id
session_id
event_id                   事件唯一编号
message_id                 原始消息编号
direction                  frontend/device/server
event_type                 事件类型
sequence
payload_hash               Payload 哈希
payload_preview            脱敏摘要
error_code
created_at
```

`session_id + message_id` 和 `session_id + sequence + direction` 建立唯一约束，确保消息重试不会重复推进状态。默认不保存 SDP、ICE 完整内容；如确需诊断，按配置保存加密内容并设置自动过期时间。

## 10. STUN/TURN 初始化和配置

首次安装后跳转到配置页面，默认填写：

```text
STUN：stun:stun.l.google.com:19302
TURN：未配置
TURN 用户名：未配置
TURN 密钥：未配置
```

管理员可以保存一个或多个 STUN/TURN 地址。保存前执行格式校验、连通性检查和配置唯一性校验；测试结果只记录成功、失败原因和耗时，不记录 TURN 密钥。

配置策略：

1. 只配置 STUN 时，浏览器尝试 P2P 直连；无法直连时通话建立失败，并返回明确的 `TURN_NOT_CONFIGURED`。
2. 配置 TURN 后，服务端为每个会话生成临时凭据或使用受保护的短期凭据，并设置过期时间不超过会话有效期。
3. 生产环境使用 `stuns:`/`turns:` 和证书校验；不把公共 STUN 作为生产可用性保证。
4. 连接测试必须由后端执行，测试结果写入审计日志；管理员页面显示最后测试时间和结果。

## 11. MQTT 消费者和服务接口

### 11.1 消费者注册

WebRTC 信令应用启动时向 MQTT 应用注册：

```typescript
register({
  connectionCode: 'emqx-main',
  subscriptionCode: 'webrtc-signaling',
  topicFilter: 'xn/xn_device/+/webrtc_signal',
  qos: 1,
  consumerCode: 'webrtc-signaling',
  handler: async (message) => webrtcSignalingService.handleDeviceSignal(message),
});
```

处理器必须校验主题设备 ID、Payload `deviceId`、会话设备 ID、消息类型、`requestId`、序列号和设备授权关系。失败消息写入事件日志和 MQTT 消息错误，不更新会话状态。

### 11.2 对其他应用提供的服务

凤飞飞设备应用不直接操作 WebRTC 数据表，使用以下服务接口：

```typescript
interface WebrtcSessionService {
  createSession(request: {
    deviceId: string;
    callerUserId: string;
    callType: 'audio' | 'video' | 'audio_video';
  }): Promise<{ sessionId: string; status: string; iceServers: unknown[] }>;

  terminateSession(sessionId: string, reason: string): Promise<void>;

  getSession(sessionId: string, requesterId: string): Promise<unknown>;
}
```

应用之间通过模块服务或平台应用 SDK 调用，不能直接写入 `webrtc_session`、直接发布 MQTT 消息或绕过权限检查。

## 12. 后端和前端文件规划

### 12.1 后端

```text
backend/src/apps/webrtc-signaling/
├── webrtc-signaling.module.ts
├── webrtc-signaling.controller.ts
├── webrtc-signaling.websocket.gateway.ts
├── webrtc-signaling.service.ts
├── webrtc-session.service.ts
├── webrtc-config.service.ts
├── webrtc-event-log.service.ts
├── webrtc-mqtt.consumer.ts
├── webrtc-timeout.service.ts
├── dto/
├── entities/
│   ├── webrtc-session.entity.ts
│   ├── webrtc-config.entity.ts
│   └── webrtc-event-log.entity.ts
└── migrations/
```

后端代码必须使用完整中文注释，重点说明状态机、事务边界、消息去重、权限校验、TURN 凭据保护和 MQTT 消费者生命周期。

### 12.2 前端

```text
frontend/src/apps/webrtc-signaling/
├── WebrtcSignalingLayout.vue
├── WebrtcConfig.vue
├── WebrtcSessions.vue
├── WebrtcSessionDetail.vue
├── WebrtcMonitor.vue
├── WebrtcCallWindow.vue
├── services/webrtc-signaling.service.ts
└── components/
    ├── IceServerForm.vue
    ├── SessionStatusTag.vue
    └── SignalingEventList.vue
```

通话窗口负责申请摄像头/麦克风权限、创建 `RTCPeerConnection`、显示本地和远端媒体、发送 WebSocket 信令、处理重连和结束通话。前端不保存 TURN 长期密钥，不绕过后端直接连接 MQTT。

## 13. 安装、启用和卸载流程

### 13.1 安装

1. 用户在应用商店打开“WebRTC 音视频通话”。
2. 核心平台显示依赖：必须先安装并启用 MQTT 应用。
3. 用户点击安装，核心平台锁定安装任务，避免并发重复安装。
4. 执行数据库迁移，创建三张业务表和索引。
5. 注册 `webrtc-signaling` MQTT 消费者。
6. 注册 WebSocket Gateway、HTTP 路由、权限和侧边栏菜单。
7. 创建默认 STUN 配置（Google 公共 STUN），不创建 TURN 密钥。
8. 安装成功后跳转 `/webrtc-signaling/config`。

任一步失败都必须执行已完成步骤的回滚或补偿清理，并保留安装失败原因；不得出现应用已显示安装成功但消费者未注册的状态。

### 13.2 停用

停用时禁止创建新会话，通知进行中的会话进入 `failed`，关闭 WebSocket 新连接，注销 MQTT 消费者，隐藏菜单但保留数据库记录。重新启用后重新注册消费者和路由，历史会话仍可查询。

### 13.3 卸载

卸载向导提供两个明确选项：

- 保留通话记录：删除配置、注销消费者、关闭服务并保留 `webrtc_session` 和 `webrtc_event_log`。
- 删除通话记录：在二次确认后删除三张表中的全部数据。

卸载顺序固定为：停止新请求 -> 结束进行中会话 -> 注销 MQTT 消费者 -> 关闭 WebSocket Gateway -> 移除菜单和权限 -> 按选择删除数据 -> 删除应用安装记录。卸载完成后不能继续访问应用 API。

## 14. 凤飞飞设备应用集成

设备详情页增加“视频通话”按钮。点击后：

1. 凤飞飞设备应用调用 `WebrtcSessionService.createSession` 或对应 HTTP API。
2. 服务端校验当前用户对设备的查看和通话权限。
3. 返回 `sessionId`、临时 `iceServers` 和过期时间。
4. 前端打开 `WebrtcCallWindow`，连接 `/api/webrtc-signaling/ws`。
5. 通话窗口按会话状态展示“呼叫中、连接中、通话中、已结束和失败原因”。
6. 用户点击挂断调用结束接口并关闭媒体轨道。

未来监控摄像头、可视门铃应用只需实现相同的设备信令主题和服务接口，不得复制 WebRTC 会话表、MQTT 连接管理或 STUN/TURN 密钥管理逻辑。

## 15. 安全、审计和可靠性要求

1. WebSocket 握手必须通过 JWT 或一次性 `wsToken`，未认证连接立即关闭。
2. 会话创建、查询、信令发送和结束都必须检查用户、设备和应用权限。
3. SDP、ICE、设备 ID 和会话 ID 必须校验长度、格式和大小；拒绝未知字段和超限消息。
4. 服务端使用消息 ID、序列号和数据库唯一约束实现幂等，不能依靠内存去重。
5. TURN 密钥加密保存，接口、前端状态、普通日志和审计日志均不得出现明文。
6. 所有配置变更、会话创建、结束、拒绝、认证失败、无效信令、MQTT 发布失败和超时都写入审计日志。
7. WebSocket 连接设置最大连接数、单用户连接数、消息速率和单条消息大小限制，超限后返回明确错误并关闭连接。
8. MQTT 断开时停止设备信令下发并提示“MQTT 服务不可用”；重连后由 MQTT 应用恢复订阅，WebRTC 应用恢复消费者。
9. 服务重启后数据库中的 `created`、`ringing`、`connecting` 会话由启动恢复任务按超时规则处理；`connected` 会话直接结束并记录 `SERVICE_RESTART`。
10. 通话记录默认只保存必要元数据和脱敏事件摘要；完整信令内容按显式诊断配置加密保存并自动清理。

## 16. 测试和验收标准

### 16.1 安装和依赖

- MQTT 应用未安装或未启用时，安装按钮明确阻止并展示依赖原因。
- 安装完成后三张表、菜单、权限、HTTP 路由、WebSocket 服务和 MQTT 消费者全部可用。
- 停用、重新启用和卸载不会留下可继续接收消息的消费者。

### 16.2 信令流程

- 已授权用户可以创建会话并收到有效 `sessionId` 和临时 ICE 配置。
- 设备 `accept`、`reject`、`offer`、`answer` 和 ICE 消息可以按顺序转发。
- 未授权用户、错误设备 ID、错误会话状态、重复消息和过期序列号均被拒绝并记录原因。
- 用户挂断、设备拒绝、等待超时、连接超时和服务重启都会进入正确终态。

### 16.3 WebRTC 连接

- 配置 STUN 时可以完成可直连网络下的 P2P 建连。
- 配置 TURN 时可以返回临时凭据，并在中继网络下完成建连。
- 未配置 TURN 且网络无法直连时返回 `TURN_NOT_CONFIGURED`，页面显示明确处理建议。
- 摄像头/麦克风权限拒绝、设备不在线、MQTT 断线和 WebSocket 重连均有明确错误状态。

### 16.4 数据和安全

- 三张表的会话、配置和事件数据可以按权限查询，分页和筛选结果正确。
- TURN 密钥、MQTT 密码、设备密钥和完整敏感信令不出现在接口响应和普通日志。
- 重复 `messageId` 不重复推进状态；并发结束只产生一个终态。
- 所有配置、会话和异常操作均可由审计日志追溯。

### 16.5 应用集成

- 凤飞飞设备详情页显示“视频通话”按钮，并能打开通话窗口。
- 设备应用不直接连接 MQTT、不直接写 WebRTC 数据表。
- 新设备应用按统一服务接口和主题规范接入，不需要复制信令核心代码。

## 17. 开发顺序和部署要求

1. 增加应用清单、依赖、权限和动态菜单。
2. 增加三张实体表、迁移、索引和配置加密能力。
3. 实现配置管理、默认 STUN 配置和 TURN 临时凭据。
4. 实现会话状态机、创建/查询/结束 API 和事件日志。
5. 实现 MQTT 消费者、下行信令服务和消息幂等处理。
6. 实现 WebSocket Gateway、认证、限流、心跳和信令转发。
7. 实现前端配置、记录、监控和通话窗口。
8. 在凤飞飞设备详情页接入“视频通话”按钮。
9. 完成本地数据库迁移、单元测试、集成测试和 WebRTC 信令测试。
10. 仅在本地验证通过后执行部署；部署和编译 PowerShell 脚本必须放在项目对应的 `build` 目录，不能放在临时目录或应用源码目录。

部署脚本必须使用环境变量或脚本参数传入数据库、MQTT、STUN/TURN 和目标服务器配置，不得写死当前客户服务器地址、密码或 TURN 密钥。
