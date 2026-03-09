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
*   **命令白名单**: 命中配置的可信最终命令字符串可直接放行，内置高危 tool 与 `execute_batch` 子命令同样适用。
*   **单命令强制约束**: `execute_command` 在服务端拒绝 shell 串联、管道、重定向、子 shell 和多行输入。
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

## 🧩 Skill 集成（推荐）

对于 Codex、Gemini 等 AI 助手，仓库内已提供 `ssh-mcp` skill，配合使用可显著提升执行稳定性与安全一致性。

- Skill 路径：`skills/ssh-mcp/SKILL.md`
- 主要收益：
  - 对高风险操作强制执行两步确认
  - 多步骤任务优先使用 `execute_batch`，避免高风险命令串联
  - 统一服务器发现、依赖预检、执行后校验流程
  - 减少误操作与上下文压缩导致的执行偏差

若你的 AI 客户端支持 Skills，建议在调用 SSH MCP 工具前先加载该 skill。

---

## ⚙️ 配置参数详解

### 全局设置
| 参数 | 类型 | 描述 |
| --- | --- | --- |
| `logDir` | string | 日志存储目录。支持环境变量如 `${HOME}`。 |
| `commandBlacklist` | string[] | 全局禁止执行的命令正则列表（如 `["^rm -rf"]`）。 |
| `commandWhitelist` | string[] | 可信最终命令正则列表，命中后可让高危 tool 及 `execute_batch` 内对应子命令跳过二次确认。 |
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
  "commandWhitelist": ["^systemctl status\\s+nginx$", "^docker ps$"],
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

## MCP 客户端配置

下面的示例展示了如何在常见 AI 客户端中注册本 MCP 服务。请将配置文件路径替换为你自己的本地路径。为了保持配置可移植，以下示例刻意避免使用绝对路径。

### Codex

`~/.codex/config.toml`

```toml
[mcp_servers.ssh]
command = "mcp-ssh-service"
args = ["--config", "./config.json"]
```

### Gemini CLI

`~/.gemini/settings.json`

```json
{
  "mcpServers": {
    "ssh": {
      "type": "stdio",
      "command": "mcp-ssh-service",
      "args": [
        "--config",
        "./config.json"
      ]
    }
  }
}
```

### Claude Code

`~/.claude.json`

```json
{
  "mcpServers": {
    "ssh": {
      "type": "stdio",
      "command": "mcp-ssh-service",
      "args": [
        "--config",
        "./config.json"
      ]
    }
  }
}
```

---

## 🛠️ 集成工具集 (79 个工具)

### 发现与核心 (8)
* `list_servers`
* `ping_server`
* `list_working_directories`
* `check_dependencies`
* `get_system_info`
* `pwd`
* `cd`
* `execute_batch` [若子命令含高风险操作则需确认]

### Shell 与基础 (2)
* `execute_command` [需确认，仅允许单条命令]
* `echo`

### 文件管理 (17)
* `upload_file` [需确认]
* `download_file`
* `ll`
* `cat`
* `head`
* `tail`
* `sed`
* `grep`
* `edit_text_file` [需确认]
* `touch`
* `mkdir` [需确认]
* `mv` [需确认]
* `cp` [需确认]
* `append_text_file` [需确认]
* `replace_in_file` [需确认]
* `rm_safe` [需确认]
* `find`

### Git (6)
* `git_status`
* `git_fetch` [需确认]
* `git_pull` [需确认]
* `git_switch` [需确认]
* `git_branch`
* `git_log`

### Docker 与 Compose (21)
* `docker_compose_up` [需确认]
* `docker_compose_down` [需确认]
* `docker_compose_stop` [需确认]
* `docker_compose_logs`
* `docker_compose_restart` [需确认]
* `docker_ps`
* `docker_images`
* `docker_exec` [需确认]
* `docker_inspect`
* `docker_stats`
* `docker_pull` [需确认]
* `docker_cp` [需确认]
* `docker_stop` [需确认]
* `docker_rm` [需确认]
* `docker_start` [需确认]
* `docker_restart` [需确认]
* `docker_rmi` [需确认]
* `docker_commit` [需确认]
* `docker_logs`
* `docker_load` [需确认]
* `docker_save` [需确认]

### 系统服务与网络 (14)
* `systemctl_status`
* `systemctl_restart` [需确认]
* `systemctl_start` [需确认]
* `systemctl_stop` [需确认]
* `ip_addr`
* `journalctl`
* `firewall_cmd` [需确认，仅支持结构化常用动作]
* `netstat` [使用 `args: string[]`]
* `ss` [使用 `args: string[]`]
* `ping_host`
* `traceroute`
* `nslookup`
* `dig`
* `curl_http` [需确认]

### 统计与进程 (13)
* `nvidia_smi`
* `ps`
* `pgrep`
* `kill_process` [需确认]
* `df_h`
* `du_sh`
* `chmod` [需确认]
* `chown` [需确认]
* `ln` [需确认]
* `tar_create` [需确认]
* `tar_extract` [需确认]
* `zip` [需确认]
* `unzip` [需确认]

总计：81 个工具。

---

## 🔐 确认机制工作流

1.  **发起请求**: AI 调用 `execute_command({ command: "systemctl restart nginx" })`。
2.  **拦截指令**: 服务器返回 `status: "pending"` 及一个唯一的 `confirmationId`。
3.  **人工审核**: 您在聊天客户端中预览并批准该操作。
4.  **最终执行**: AI 携带 `confirmationId` 和 `confirmExecution: true` 再次调用 `execute_command`。
5.  **校验放行**: 服务器确认参数完全匹配且 ID 有效，正式下发 SSH 命令。

如果某个高危 tool 生成的最终命令命中了 `commandWhitelist`，服务器会跳过 `pending` 阶段直接执行。对于 `execute_batch`，只有包含未命中白名单的高危子命令时，整批任务才会进入二次确认流程。

`execute_command` 仅允许一个 shell 命令段。服务器会拒绝 `&&`、`||`、`;`、管道、重定向、子 shell 语法以及多行输入。对于内置 tool，所有用户传入参数会在执行前做 shell 转义，以降低命令注入风险。

`firewall_cmd` 不再接受自由拼接的 shell 参数片段，改为使用 `action`、`port`、`zone`、`permanent`、`listTarget` 这些结构化字段。`netstat` 则改为 `args: string[]`，服务端会按独立参数逐项校验。

创建目录请优先使用 `mkdir`，不要再用 `execute_command "mkdir ..."`。需要 `mkdir -p` 行为时，传 `parents: true`。

---

## 📄 许可证
本项目采用 [MIT 许可证](./LICENSE)。
