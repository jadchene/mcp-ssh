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

---

## 🚀 快速开始

### 安装

```bash
# 通过 npm 全局安装
npm install -g @jadchene/mcp-ssh-service

# 使用配置文件启动服务
mcp-ssh-service --config ./config.json
```

### 源码运行

```bash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
```

---

## ⚙️ 配置参数详解

### 全局设置
| 参数 | 类型 | 描述 |
| --- | --- | --- |
| `logDir` | string | 日志存储目录。支持环境变量如 `${HOME}`。 |
| `commandBlacklist` | string[] | 全局禁止执行的命令正则列表（如 `["^rm -rf"]`）。 |
| `defaultTimeout` | number | SSH 命令执行超时时间（毫秒，默认 60000）。 |
| `servers` | object | 服务器配置字典，Key 即为 `serverAlias`。 |

### 服务器配置对象
| 参数 | 类型 | 描述 |
| --- | --- | --- |
| `host` | string | 远程主机 IP 或域名。支持环境变量。 |
| `port` | number | SSH 端口（默认 22）。 |
| `username` | string | SSH 登录用户名。 |
| `password` | string | SSH 密码。建议使用 `${VAR}` 引用环境变量。 |
| `privateKeyPath` | string | 私钥文件路径。 |
| `passphrase` | string | 私钥文件的保护口令。 |
| `readOnly` | boolean | 是否设为只读模式。开启后禁用所有写操作工具。 |
| `desc` | string | 服务器语义化描述，显示在 `list_servers` 中。 |
| `strictHostKeyChecking` | boolean | 设为 `false` 以跳过 Host Key 校验。 |
| `workingDirectories` | object | 路径别名映射（Key: { path, desc }）。 |
| `proxyJump` | object | 可选的跳板机配置（结构与服务器配置一致）。 |

---

## ⚙️ 配置示例

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
