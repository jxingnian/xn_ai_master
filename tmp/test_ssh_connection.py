#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SSH连接测试脚本
"""

import paramiko
import sys
import os
from datetime import datetime

def test_ssh_connection(host, username, password, port=22):
    """
    测试SSH连接

    Args:
        host: 服务器地址
        username: 用户名
        password: 密码
        port: SSH端口，默认22
    """
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 开始连接SSH服务器...")
    print(f"服务器: {host}:{port}")
    print(f"用户名: {username}")
    print("-" * 50)

    ssh_client = None

    try:
        # 创建SSH客户端
        ssh_client = paramiko.SSHClient()

        # 自动添加主机密钥
        ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        # 连接服务器
        print("正在建立连接...")
        ssh_client.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            timeout=10,
            allow_agent=False,
            look_for_keys=False
        )

        print("[成功] SSH连接成功！")
        print("-" * 50)

        # 执行测试命令
        test_commands = [
            "whoami",
            "hostname",
            "uname -a",
            "pwd",
            "df -h | head -5"
        ]

        for cmd in test_commands:
            print(f"\n执行命令: {cmd}")
            stdin, stdout, stderr = ssh_client.exec_command(cmd)

            output = stdout.read().decode('utf-8', errors='ignore').strip()
            error = stderr.read().decode('utf-8', errors='ignore').strip()

            if output:
                print(f"输出:\n{output}")
            if error:
                print(f"错误:\n{error}")

        print("\n" + "=" * 50)
        print("SSH连接测试完成 - 所有功能正常")
        print("=" * 50)
        return True

    except paramiko.AuthenticationException:
        print("[失败] 认证失败: 用户名或密码错误")
        return False

    except paramiko.SSHException as e:
        print(f"[失败] SSH错误: {str(e)}")
        return False

    except Exception as e:
        print(f"[失败] 连接失败: {str(e)}")
        return False

    finally:
        if ssh_client:
            ssh_client.close()
            print("\nSSH连接已关闭")


if __name__ == "__main__":
    import json

    # 从配置文件读取服务器信息
    config_file = os.path.join(os.path.dirname(__file__), 'ssh_config.json')

    if not os.path.exists(config_file):
        print(f"错误: 配置文件不存在: {config_file}")
        print("请创建配置文件，格式:")
        print('{')
        print('  "host": "111.228.3.219",')
        print('  "username": "root",')
        print('  "password": "your_password",')
        print('  "port": 22')
        print('}')
        sys.exit(1)

    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)

        HOST = config.get('host')
        USERNAME = config.get('username')
        PASSWORD = config.get('password')
        PORT = config.get('port', 22)

        if not all([HOST, USERNAME, PASSWORD]):
            print("错误: 配置文件缺少必要字段 (host, username, password)")
            sys.exit(1)

        # 测试连接
        success = test_ssh_connection(HOST, USERNAME, PASSWORD, PORT)

        # 自动清理配置文件
        try:
            os.remove(config_file)
            print(f"\n已清理临时配置文件: {config_file}")
        except Exception as e:
            print(f"\n警告: 无法删除配置文件 {config_file}: {e}")

        # 返回退出码
        sys.exit(0 if success else 1)

    except json.JSONDecodeError as e:
        print(f"错误: 配置文件格式错误: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"错误: 读取配置文件失败: {e}")
        sys.exit(1)
