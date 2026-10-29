# XN 设备管理后台平台

本仓库按“最小基础平台 + 应用程序扩展”落地。首期已实现管理员登录、应用商店、应用安装/启停和动态菜单闭环；默认菜单为设置、应用商店、AI。

## 启动

1. 安装 Docker Engine 和 Docker Compose。
2. 执行 `cp .env.example .env`，设置数据库密码、JWT 密钥和管理员密码。
3. 执行 `bash build/build.sh`。
4. 浏览器访问 `http://localhost`。

后端 API 前缀为 `/api`。首次启动会创建管理员和“设备管理”示例应用，默认账号取自 `.env`。

## 代码结构

- `backend/src/core`：认证、应用管理、菜单和权限核心层。
- `backend/src/entities`：用户、应用、安装记录和菜单实体。
- `frontend/src`：登录、布局、设置、应用商店和 AI 页面。
- `build/build.sh`：唯一部署/编译入口。
