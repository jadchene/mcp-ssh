# MCP SSH Server (SSH MCP 服务器)

基于 Model Context Protocol (MCP) 的生产级无状态 SSH 命令执行、管理与自动化服务器。

## 核心特性

- **无状态与懒加载**: 仅在需要时建立 SSH 连接，执行完毕后立即断开。
- **AI 原生发现机制**: 提供 `list_servers` 和 `list_working_directories` 工具，帮助 AI 智能体自主识别环境。
- **坚固的安全性**:
  - **人机交互**: 所有的写操作或高危工具在调用前必须经过人工确认。
  - **命令黑名单**: 内置针对 `rm -rf /` 等危险操作的保护，并支持自定义正则过滤。
  - **只读模式**: 支持在配置层面锁定特定服务器为只读。
  - **受限删除**: 代码级拦截对根目录或系统关键目录的破坏性操作。
- **高级网络支持**: 支持 **跳板机 (ProxyJump)**、带**密码的私钥 (Passphrase)** 以及自定义端口。
- **运维利器**: 集成了对 Git、Docker、Docker Compose 和 Systemd 的原生工具支持。
- **热更新**: 修改 `config.json` 后配置即刻生效，无需重启服务。
- **环境变量支持**: 支持在配置文件中使用 `${VAR}` 占位符，保护敏感凭据。

## 运行要求
- **远程服务器**: 建议安装 `base64`（用于文本编辑）和常见的运维工具。

## 安装

```bash
npm install -g mcp-ssh
```

## 配置

创建一个 `config.json` 鏂囦欢。服务器会在当前工作目录或 `MCP_SSH_CONFIG` 环境变量指定的路径查找该文件。

```json
{
  "servers": {
    "my-server": {
      "desc": "主 Web 服务器",
      "host": "1.2.3.4",
      "username": "root",
      "password": "${SERVER_PWD}",
      "workingDirectories": {
        "app": { "path": "/opt/app", "desc": "应用程序源码目录" }
      }
    }
  }
}
```

## 可用工具清单

### 1. 环境发现与上下文
- `list_servers`: 列出所有可用的主机及其描述。
- `list_working_directories`: 获取语义化的路径映射。
- `get_system_info`: 获取 CPU、内存、负载等系统信息。
- `check_dependencies`: 预检远程服务器环境（如是否安装了 docker）。

### 2. 文件与 Shell
- `execute_command`*, `execute_batch`*: 执行单条或批量 Shell 命令。
- `ll`, `cat`, `tail`, `grep`: 浏览和搜索远程文件。
- `upload_file`*, `download_file`: 传输文件。
- `mkdir`, `mv`*, `chmod`*, `rm_safe`*: 文件系统管理与维护。

### 3. 服务与自动化
- `docker_ps`, `docker_logs`, `docker_compose_up`*: Docker 容器管理。
- `systemctl_status`, `systemctl_restart`*: 系统服务控制。
- `git_status`, `git_pull`*: 版本控制操作。
- `ip_addr`, `ping`, `netstat`: 网络诊断。

*\* 标有星号的工具需要人工显式确认后方可执行。*

## 许可证
MIT
