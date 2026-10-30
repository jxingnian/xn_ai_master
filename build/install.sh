#!/usr/bin/env bash
set -euo pipefail

# 原生部署入口：自动准备运行环境、构建应用并注册 systemd 与 Nginx 服务。
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_ROOT="/opt/xn-platform"
SERVICE_USER="xnplatform"
NODE_MAJOR_REQUIRED=18

if [ "$(id -u)" -ne 0 ]; then
  echo "错误：请使用 root 用户执行此脚本。" >&2
  exit 1
fi

if [ ! -f /etc/os-release ]; then
  echo "错误：无法识别当前 Linux 系统。" >&2
  exit 1
fi
. /etc/os-release

echo "检测系统：${PRETTY_NAME:-$ID}"

# 根据发行版安装系统依赖；脚本只使用发行版包管理器，不依赖容器环境。
install_packages() {
  case "${ID:-}" in
    ubuntu|debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y ca-certificates curl gnupg nginx postgresql postgresql-contrib build-essential python3
      ;;
    centos|rhel|rocky|almalinux)
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y ca-certificates curl nginx postgresql-server postgresql-contrib gcc-c++ make python3
      else
        yum install -y ca-certificates curl nginx postgresql-server postgresql-contrib gcc-c++ make python3
      fi
      ;;
    *)
      echo "错误：暂不支持发行版 ${ID:-unknown}。" >&2
      exit 1
      ;;
  esac
}

if ! command -v nginx >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  echo "安装缺失的系统环境..."
  install_packages
fi

# Node.js 版本不足时使用 NodeSource 安装当前 LTS 主版本。
NODE_VERSION=0
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -p "process.versions.node.split('.')[0]")"
fi
if [ "$NODE_VERSION" -lt "$NODE_MAJOR_REQUIRED" ]; then
  echo "安装 Node.js ${NODE_MAJOR_REQUIRED}..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "错误：Node.js 或 npm 安装失败。" >&2
  exit 1
fi

systemctl enable --now nginx
systemctl enable --now postgresql

# 创建固定的应用运行用户，禁止后端进程以 root 身份运行。
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$INSTALL_ROOT" /var/www/xn-platform
cp -a "$PROJECT_ROOT/backend" "$INSTALL_ROOT/"
cp -a "$PROJECT_ROOT/frontend" "$INSTALL_ROOT/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT"

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

# 首次部署自动生成配置，已有配置不覆盖，保证重复执行不会重置密码。
if [ ! -f "$INSTALL_ROOT/.env" ]; then
  DB_PASSWORD="$(random_hex 24)"
  cat > "$INSTALL_ROOT/.env" <<EOF
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$(random_hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(random_hex 12)
PORT=3000
DATABASE_URL=postgres://xn_platform:$DB_PASSWORD@127.0.0.1:5432/xn_platform
EOF
  echo "已生成 $INSTALL_ROOT/.env，请部署完成后查看管理员初始密码。"
fi

# 使用国内 npm 镜像，减少服务器安装依赖的等待时间。
cd "$INSTALL_ROOT/backend"
npm install --registry=https://registry.npmmirror.com
npm run build

cd "$INSTALL_ROOT/frontend"
npm install --registry=https://registry.npmmirror.com
npm run build
rm -rf /var/www/xn-platform/*
cp -a dist/. /var/www/xn-platform/

# 创建数据库和管理员数据库用户；已存在时保持现有数据不变。
DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$INSTALL_ROOT/.env")"
if [ "${#DB_PASSWORD}" -lt 16 ]; then
  echo "错误：$INSTALL_ROOT/.env 中的 DB_PASSWORD 为空或长度不足 16 位。" >&2
  echo "请先设置有效数据库密码后重新执行部署。" >&2
  exit 1
fi
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='xn_platform'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER xn_platform WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='xn_platform'" | grep -q 1 || sudo -u postgres createdb -O xn_platform xn_platform

cat > /etc/systemd/system/xn-platform.service <<EOF
[Unit]
Description=XN Platform Backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_ROOT/backend
EnvironmentFile=$INSTALL_ROOT/.env
Environment=DATABASE_URL=postgres://xn_platform:$DB_PASSWORD@127.0.0.1:5432/xn_platform
ExecStart=/usr/bin/node $INSTALL_ROOT/backend/dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Ubuntu 当前服务器的 nginx.conf 只加载 /etc/nginx/conf.d/*.conf，
# 因此生产站点配置必须写入 conf.d，写入 sites-enabled 不会生效。
cat > /etc/nginx/conf.d/xn-platform.conf <<EOF
server {
    listen 80 default_server;
    server_name _;
    root /var/www/xn-platform;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        # 显式转发 JWT 请求头，避免反向代理后端收到请求时误判为未登录。
        proxy_set_header Authorization \$http_authorization;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# 清理旧的同名 sites-enabled 配置，避免后续系统改为加载该目录时出现重复监听。
rm -f /etc/nginx/sites-enabled/xn-platform /etc/nginx/sites-enabled/default
nginx -t
systemctl daemon-reload
systemctl enable --now xn-platform
systemctl restart xn-platform
systemctl reload nginx

echo "原生部署完成。"
echo "访问地址：http://$(hostname -I | awk '{print $1}')"
echo "查看后端日志：journalctl -u xn-platform -f"
