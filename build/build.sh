#!/usr/bin/env bash
set -euo pipefail

# 该脚本是项目唯一的部署/编译入口，统一在仓库根目录执行 Docker Compose 构建。
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未检测到 Docker，请先安装 Docker Engine 和 Docker Compose 插件。" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已生成 .env，请修改管理员密码和数据库密码后重新执行。"
  exit 0
fi

docker compose build
docker compose up -d
echo "平台已启动：前端 http://localhost，后端 http://localhost:3000"
