[English](./README.md) | 简体中文

# MCP SSH Server (SSH MCP 服务器)

一款生产级的 Model Context Protocol (MCP) 服务器，用于无状态 SSH 命令执行、管理与自动化。

本服务器为 AI 智能体提供了安全且感知上下文的远程基础设施访问能力。它具备独特的“两步确认”机制来处理高危操作，在实现强大自动化的同时确保了操作的绝对安全性。

## 快速开始

### 通过 npm 安装:

```bash
npm install -g mcp-ssh
mcp-ssh --config ./config.json
```

### 从源码运行:

```bash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
```

## 核心特性

- **无状态与懒加载**: 仅在执行工具时建立 SSH 连接，执行完毕后立即断开。
- **两步确认机制**: 所有高危工具（写操作）会先返回一个 `confirmationId`。只有在带上 `confirmExecution: true` 进行第二次调用时才会真正执行，为 AI 自动化提供了可靠的人工介入屏障。
- **AI 原生发现机制**: 支持语义化路径映射和服务器列表，帮助 AI 智能体自主理解并导航您的基础设施。
- **高级网络支持**: 支持 **跳板机 (ProxyJump)**、带**密码的私钥 (Passphrase)** 以及可自定义的超时控制。
- **坚固的安全性**: 全局命令黑名单（基于正则）、服务器级只读模式，以及系统关键目录的硬拦截保护。
- **卓越的运维能力**: 原生集成对 Git、Docker、Docker Compose 和 Systemd 的支持。
- **配置热更新**: 对 `config.json` 的修改无需重启服务即可即刻生效。

## 配置说明

服务器默认读取 `config.json` 文件。您可以通过 `--config` 参数或 `MCP_SSH_CONFIG` 环境变量来指定路径。

```json
{
  "logDir": "./logs",
  "commandBlacklist": ["rm -rf /etc"],
  "servers": {
    "prod-server": {
      "desc": "主要生产环境 Web 服务器",
      "host": "1.2.3.4",
      "username": "deploy",
      "password": "${SERVER_PWD}",
      "workingDirectories": {
        "app": { "path": "/var/www/html", "desc": "Web 应用程序根目录" }
      }
    }
  }
}
```

## 可用工具清单

### 环境发现与上下文
- `list_servers`: 列出所有配置的主机及其描述。
- `list_working_directories`: 获取语义化的路径映射。
- `ping_server`: 测试 SSH 连接及其凭据的有效性。
- `get_system_info`: 获取 CPU、内存及系统负载。
- `check_dependencies`: 预检远程二进制依赖 (docker, git 等)。

### 文件与 Shell
- `execute_command`*, `execute_batch`*: 执行单条或批量 Shell 命令。
- `ll`, `cat`, `tail`, `grep`: 浏览和搜索远程文件。
- `upload_file`*, `download_file`: 传输文件。
- `mkdir`*, `mv`*, `cp`*, `chmod`*, `rm_safe`*, `touch`*: 文件系统管理。

### 服务与自动化
- `docker_ps`, `docker_logs`, `docker_compose_up`*, `docker_compose_restart`*: Docker 栈管理。
- `systemctl_status`, `systemctl_restart`*: 系统服务控制。
- `git_status`, `git_pull`*: 版本控制操作。
- `ip_addr`, `ping`, `netstat`: 网络诊断。

*\* 标有星号的工具需要提供 confirmationId 并设置 confirmExecution: true 后方可执行。*

## 许可证
MIT
