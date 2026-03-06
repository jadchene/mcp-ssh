[English](./README.md) | 简体中文

# 🚀 mcp-ssh

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![MCP Ready](https://img.shields.io/badge/MCP-Ready-blue)](https://modelcontextprotocol.io/)

一款**生产级**的 Model Context Protocol (MCP) 服务器，专为安全、无状态的 SSH 自动化设计。本服务赋予 AI 智能体管理远程基础设施的能力，同时提供**人工介入（Human-in-the-loop）**的安全保障和**语义化环境感知**。

---

## 🌟 核心支柱

### 🔒 极致的安全防护
*   **两步确认机制**: 所有高危操作（写入、删除、重启）都会返回一个 `confirmationId`。在人类明确批准该笔交易前，服务器不会执行任何实际指令。
*   **命令黑名单**: 实时正则拦截毁灭性命令，如 `rm -rf /` 或 `mkfs`。
*   **服务器级只读模式**: 支持在配置层面将特定服务器锁定为非破坏性模式。
*   **关键目录保护**: 代码级硬拦截对 `/etc`、`/usr` 等系统核心路径的误删操作。

### 🧠 AI 原生设计
*   **语义化基础设施发现**: AI 可以列出所有服务器，并通过自然语言描述理解其用途。
*   **工作目录别名**: 将复杂的路径（如 `/var/www/my-app/v1/prod`）映射为简单的别名（如 `app-root`），并附带语义描述。
*   **环境预检**: 内置工具支持在执行前验证远程依赖（如 Docker、Git）是否存在。

### 🛠️ 企业级 DevOps 集成
*   **无状态连接**: 采用懒加载 SSH 会话，用完即关，不留任何冗余的后台进程。
*   **高级网络支持**: 原生支持 **跳板机 (ProxyJump)** 以及带密码保护的私钥。
*   **丰富的工具集**: 集成 45+ 实用工具，涵盖 Git、Docker、Docker Compose、Systemd 和网络诊断。

---

## 🚀 快速开始

### 安装

```bash
# 通过 npm 全局安装
npm install -g @jadchene/mcp-ssh-service

# 使用配置文件启动服务
mcp-ssh-service --config ./config.json
```

### 源码运行 (开发环境)

```bash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
```

---

## ⚙️ 进阶配置

本服务使用外部 `config.json` 文件，支持**环境变量替换**和**配置热重载**。

```json
{
  "logDir": "./logs",
  "defaultTimeout": 60000,
  "commandBlacklist": ["^apt-get upgrade", "curl.*\\|.*sh"],
  "servers": {
    "prod-web": {
      "desc": "核心 API 集群",
      "host": "10.0.0.5",
      "username": "deploy",
      "privateKeyPath": "~/.ssh/id_rsa",
      "passphrase": "${SSH_KEY_PWD}",
      "workingDirectories": {
        "logs": { "path": "/var/log/nginx", "desc": "Nginx 访问日志目录" }
      },
      "proxyJump": {
        "host": "bastion.example.com",
        "username": "jumpuser"
      }
    }
  }
}
```

---

## 🛠️ 集成工具集 (45 个工具)

### 📂 环境发现与上下文
*   `list_servers`: 列出所有配置的主机及其描述。
*   `ping_server`: 测试 SSH 连接及其凭据的有效性。
*   `list_working_directories`: 获取语义化的路径映射。
*   `get_system_info`: 获取 CPU、内存及系统负载。
*   `check_dependencies`: 预检远程二进制依赖 (docker, git 等)。

### 💻 文件与 Shell
*   `execute_command`*, `execute_batch`*: 执行单条或批量 Shell 命令。
*   `ll`, `cat`, `tail`, `grep`, `pwd`, `cd`: 浏览和搜索远程文件。
*   `upload_file`*, `download_file`: 传输文件。
*   `mkdir`*, `mv`*, `cp`*, `chmod`*, `rm_safe`*, `touch`*: 文件系统管理。

### 🐳 服务与自动化
*   `docker_ps`, `docker_logs`, `docker_compose_up`*, `docker_compose_restart`*: 容器编排管理。
*   `systemctl_status`, `systemctl_restart`*: 系统服务控制。
*   `git_status`, `git_pull`*: 版本控制操作。
*   `ip_addr`, `ping`, `netstat`, `df_h`, `nvidia_smi`: 监控与诊断。

*\* 高危操作: 需要提供 confirmationId 并设置 confirmExecution: true 后方可执行。*

---

## 🔐 确认机制工作流

1.  **发起请求**: AI 调用 `rm_safe({ path: "/tmp/old" })`。
2.  **拦截指令**: 服务器返回 `status: "pending"` 及一个唯一的 `confirmationId`。
3.  **人工审核**: 您在聊天客户端中预览并批准该操作。
4.  **最终执行**: AI 携带 `confirmationId` 和 `confirmExecution: true` 再次发起调用。
5.  **校验放行**: 服务器确认参数完全匹配且 ID 有效，正式下发 SSH 命令。

---

## 📄 许可证
本项目采用 [MIT 许可证](./LICENSE)。
