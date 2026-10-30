# SSH密钥配置说明

## 测试服务器信息

- **服务器地址**: 111.228.3.219
- **用户名**: root
- **密码**: bELc5EB2chMDhb0igomG

## SSH密钥位置

本地SSH密钥已配置在：
- **私钥**: `~/.ssh/id_rsa`
- **公钥**: `~/.ssh/id_rsa.pub`

公钥已上传到服务器 `~/.ssh/authorized_keys`，可以无密码登录。

## 使用方法

### 直接SSH登录（无需密码）

```bash
ssh root@111.228.3.219
```

### 使用部署脚本

```bash
cd tmp
python3 deploy.py
```

部署脚本会自动使用SSH密钥认证，无需输入密码。

## 密钥丢失时的恢复方法

如果本地密钥丢失，需要重新配置：

### 方法1：生成新密钥并上传

```bash
# 1. 生成新密钥
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" -C "xn-platform-deploy"

# 2. 上传公钥到服务器
ssh-copy-id root@111.228.3.219
# 输入密码: bELc5EB2chMDhb0igomG

# 3. 测试连接
ssh root@111.228.3.219
```

### 方法2：使用Python脚本自动配置

```bash
cd tmp
export SERVER_PASSWORD='bELc5EB2chMDhb0igomG'
python3 setup_ssh_key.py
```

## 注意事项

1. **保护私钥安全** - 不要将 `~/.ssh/id_rsa` 提交到Git仓库
2. **备份私钥** - 建议将私钥备份到安全位置
3. **多机器使用** - 如果在多台电脑上部署，每台都需要配置SSH密钥
4. **权限设置** - 确保 `~/.ssh` 目录权限为 700，私钥文件权限为 600

## 服务器部署路径

- **应用安装路径**: `/opt/xn-platform`
- **前端静态文件**: `/var/www/xn-platform`
- **服务配置**: `/etc/systemd/system/xn-platform.service`
- **Nginx配置**: `/etc/nginx/conf.d/xn-platform.conf`
- **环境配置**: `/opt/xn-platform/.env`

## 部署后检查

```bash
# 检查服务状态
ssh root@111.228.3.219 "systemctl status xn-platform"

# 查看服务日志
ssh root@111.228.3.219 "journalctl -u xn-platform -f"

# 访问地址
http://111.228.3.219
```
