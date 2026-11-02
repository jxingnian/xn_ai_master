# XN 设备管理后台平台

本项目是“最小基础平台 + 应用程序扩展”架构，提供管理员登录、应用商店、应用安装/启停、动态菜单、MQTT 设备管理和 WebRTC 音视频信令能力。

## 部署前置条件

生产环境部署后台前，必须准备以下服务：

- PostgreSQL：保存平台、MQTT 和 WebRTC 业务数据。
- EMQX：提供设备与后台之间的 MQTT 消息通道。
- coturn：提供 WebRTC 无法直连时的 TURN 音视频中继。
- Nginx：提供前端静态文件、HTTP API 和 WebSocket 反向代理。
- Node.js 18 或更高版本：构建并运行 NestJS 后端。

后台本身不承载音视频媒体流。WebRTC 的音视频媒体由浏览器和设备通过 STUN/TURN 建立连接，MQTT 只传递设备控制消息和 WebRTC SDP/ICE 信令。

## 服务器端口

请同时开放云服务器安全组和服务器本机防火墙端口：

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 80 | TCP | 后台 HTTP 网站和 API |
| 1883 | TCP | EMQX MQTT |
| 8883 | TCP | EMQX MQTT TLS，可选 |
| 18083 | TCP | EMQX 管理控制台 |
| 3478 | TCP/UDP | coturn STUN/TURN |
| 49152-65535 | UDP | coturn WebRTC 媒体中继端口 |

## 一、部署 EMQX

以下示例使用 Docker 持久化运行 EMQX。生产环境应修改默认管理员密码，并限制 `18083` 只允许管理网访问。

```bash
docker volume create emqx-data
docker volume create emqx-etc
docker volume create emqx-log

docker run -d \
  --name emqx \
  --restart unless-stopped \
  -p 1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  -v emqx-data:/opt/emqx/data \
  -v emqx-etc:/opt/emqx/etc \
  -v emqx-log:/opt/emqx/log \
  emqx/emqx:latest
```

检查 EMQX：

```bash
docker ps --filter name=emqx
curl -I http://127.0.0.1:18083
```

打开 `http://服务器地址:18083`，登录 EMQX 控制台并完成以下配置：

1. 修改默认管理员密码。
2. 创建后台使用的 MQTT 用户，例如 `fengfeifei`。
3. 为该用户设置强密码。
4. 确认 MQTT 监听器 `1883` 已启用。
5. 设备使用同一个 EMQX 服务，并为每台设备设置唯一 `deviceId`。

后台 MQTT 连接配置填写：

```text
协议：mqtt
主机：服务器内网地址或公网地址
端口：1883
用户名：EMQX 中创建的 MQTT 用户
密码：该 MQTT 用户密码
状态：启用
```

## 二、部署 coturn

Ubuntu 22.04 示例：

```bash
apt update
apt install -y coturn
```

创建或编辑 `/etc/turnserver.conf`：

```ini
listening-port=3478
listening-ip=0.0.0.0
external-ip=服务器公网IP
realm=服务器公网IP或TURN域名
server-name=服务器公网IP或TURN域名

fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=请生成长度至少32位的随机密钥

no-multicast-peers
no-loopback-peers
min-port=49152
max-port=65535

simple-log
log-file=/var/log/turnserver/turnserver.log
```

创建日志目录并启动：

```bash
mkdir -p /var/log/turnserver
chown turnserver:turnserver /var/log/turnserver
sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn
systemctl restart coturn
systemctl status coturn --no-pager
ss -lntup | grep 3478
```

注意：云服务器通常没有把公网 IP 配置在本机网卡上，因此 coturn 必须使用 `listening-ip=0.0.0.0`，不能把公网 IP 写到 `listening-ip`。公网 IP 只填写到 `external-ip`。

## 三、部署平台后台

1. 准备环境变量：

```bash
cp .env.example .env
```

至少修改以下变量：

```dotenv
DB_PASSWORD=长度至少16位的数据库密码
JWT_SECRET=长度至少32位的随机签名密钥
ADMIN_USERNAME=admin
ADMIN_PASSWORD=强管理员密码
MQTT_SECRET_KEY=长度至少32位的随机加密密钥
```

2. 首次安装完整服务器环境：

```bash
sudo bash build/install.sh
```

`build/install.sh` 会安装 PostgreSQL、Nginx、Node.js 依赖，构建前后端，创建 `xn-platform` systemd 服务，并配置 Nginx。

3. 已安装服务器只更新代码：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build\update-to-server.ps1 `
  -Server 服务器IP `
  -User root `
  -RemoteProject /opt/xn-platform `
  -Port 22
```

不要使用 `build/deploy-to-server.ps1` 做日常更新；该脚本用于全新安装，可能清理已有安装目录和数据库。

## 四、后台应用配置

### 1. 安装 MQTT 应用

进入“应用商店”，安装并启用 MQTT 管理应用，创建一个已连接的 MQTT 连接。

### 2. 安装 WebRTC 应用

安装并启用“WebRTC 音视频通话”应用，进入：

`视频通话 → STUN/TURN 配置`

凤飞飞设备默认填写：

```text
设备产品编码：xn_device
下发主题模板：xn/{productCode}/{deviceId}/webrtc_command
上报主题模板：xn/{productCode}/{deviceId}/webrtc_signal
STUN 地址：stun:stun.l.google.com:19302
TURN 地址：turn:服务器公网IP:3478
TURN 用户名：webrtc
TURN 密钥：与 /etc/turnserver.conf 的 static-auth-secret 完全一致
```

其他设备产品只需修改 `productCode`，并确保设备端使用相同的主题模板。

### 3. 配置 Nginx WebSocket

Nginx 的 `/api/` 代理必须包含以下配置，否则 HTTP API 可用但 WebSocket 信令无法升级：

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

检查配置：

```bash
nginx -t
systemctl reload nginx
systemctl is-active xn-platform
```

## 五、部署验收

```bash
systemctl is-active postgresql
systemctl is-active nginx
systemctl is-active xn-platform
systemctl is-active coturn
docker ps --filter name=emqx
curl -I http://服务器地址/
```

登录后台后检查：

1. MQTT 连接状态为“已连接”。
2. WebRTC STUN/TURN 配置已保存。
3. 在线设备可以显示在设备列表。
4. `视频通话 → 实时通话监控` 可以正常打开。
5. 浏览器控制台没有 WebSocket 连接失败。

## 六、设备端信令协议

设备订阅后台下发主题：

```text
xn/{productCode}/{deviceId}/webrtc_command
```

设备发布信令主题：

```text
xn/{productCode}/{deviceId}/webrtc_signal
```

设备端必须支持 `call.invite`、`call.accept`、`call.reject`、`call.end`、`webrtc.offer`、`webrtc.answer`、`webrtc.ice-candidate` 和 `webrtc.ice-complete`。后台只负责信令转发和会话记录，设备端仍需实现 WebRTC PeerConnection、摄像头、麦克风、SDP 和 ICE。

## 代码结构

- `backend/src/core`：认证、应用管理、菜单和权限核心层。
- `backend/src/apps/mqtt`：MQTT 连接、订阅、发布和消息记录。
- `backend/src/apps/webrtc-signaling`：WebRTC 会话、信令、STUN/TURN 配置和通话记录。
- `backend/src/entities`：用户、应用、安装记录和菜单实体。
- `frontend/src`：登录、布局、设置、应用商店和业务页面。
- `build/install.sh`：全新服务器安装脚本。
- `build/update-to-server.ps1`：已安装服务器的构建和更新脚本。
