[English](./README.md) | 简体中文

# mcp-ssh

mcp-ssh 为 AI Agent 提供持久 SSH 会话，以及文件管理、Git、Docker 和系统检查工具。

## 功能

- 持久 Shell 会话，目录、变量和函数跨调用保持。
- 支持密码、私钥和跳板机认证。
- 提供文件、Git、Docker、服务及系统检查的结构化工具。
- 支持服务器启用/只读设置和命名工作目录。
- 支持写操作确认、命令策略及可选 Full Access。

## 快速开始

准备 Node.js 24 或更高版本，从 npm 安装：

```bash
npm install -g @jadchene/mcp-ssh-service
```

将下方配置保存为 `config.json`，修改主机和认证信息，并核验主机密钥指纹，再按 [MCP 客户端配置](#mcp-客户端配置)接入。客户端会启动这个 stdio 服务，无需单独运行后台进程。

## MCP 客户端配置

请将 `/path/to/config.json` 替换为配置文件的绝对路径，Windows 可使用 `C:/mcp/ssh/config.json`。

Codex：

```bash
codex mcp add ssh -- mcp-ssh-service --config /path/to/config.json
```

Claude Code：

```bash
claude mcp add ssh -- mcp-ssh-service --config /path/to/config.json
```

## 配置

通过 `--config <path>` 或 `MCP_SSH_CONFIG` 指定配置文件，默认读取当前工作目录下的 `config.json`。

从低于 **3.0.0** 的版本升级到 **3.x** 时，请阅读[迁移指南](docs/CONFIG_MIGRATION.md)。

配置示例：

```json
{
  "logDir": "./logs",
  "defaultTimeout": 60000,
  "sessionIdleTimeoutMs": 1800000,
  "maxSessions": 32,
  "allowedLocalRoots": ["./transfer"],
  "commandBlacklist": ["^apt-get upgrade", "curl.*\\|.*sh"],
  "commandWhitelist": ["^systemctl status\\s+nginx$", "^docker ps$"],
  "servers": {
    "prod-web": {
      "enable": true,
      "desc": "Production web server",
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "./id_rsa",
      "passphrase": "${SSH_KEY_PASSPHRASE}",
      "strictHostKeyChecking": true,
      "hostKeySha256": "SHA256:REPLACE_WITH_SERVER_FINGERPRINT",
      "readOnly": false,
      "dangerMode": false,
      "codexAutoReview": false,
      "allowedRemoteRoots": ["/srv/app"],
      "workingDirectories": {
        "app": {
          "path": "/srv/app",
          "desc": "Application root"
        },
        "logs": {
          "path": "/var/log/nginx",
          "desc": "Nginx logs"
        }
      }
    }
  }
}
```

将私钥放在 `config.json` 旁边，或将 `privateKeyPath` 改为实际路径。加密私钥需在服务的运行环境中设置 `SSH_KEY_PASSPHRASE`；未加密私钥可省略 `passphrase`。配置引用的 `${VAR}` 环境变量必须存在。密码和跳板机示例见 [config.example.json](config.example.json)。

配置修改后自动重载，无效更新会保留上一份有效配置。修改 SSH 连接身份或禁用服务器会使对应会话失效；修正配置或重新启用服务器后，需再次调用 `connect`。

本地私钥、日志和传输目录的相对路径均以配置目录为基准；省略 `allowedLocalRoots` 会禁止本地文件传输。`allowedRemoteRoots` 只限制 `rm_safe` 的删除范围。超时字段单位为毫秒，`maxSessions` 包含建立中的连接。

`hostKeySha256` 须填写经可信渠道核验的指纹。可用 `ssh-keyscan <host> | ssh-keygen -lf - -E sha256` 查看指纹，但扫描本身不能证明主机身份。

## MCP 工具

远程工具必填 `sessionId`；`connect` 和 `list_working_directories` 使用 `serverAlias`。精确参数请通过 MCP 客户端的 `list_tools` 查看。

| 分类 | 工具 |
| --- | --- |
| 会话与发现 | `list_servers`、`connect`、`disconnect`、`ping_server`、`list_working_directories`、`check_dependencies` |
| Shell | `execute_command`、`execute_batch`、`cd`、`pwd`、`env`、`echo`（字面量文本） |
| 文件 | 列出、读取、搜索、编辑、传输、权限设置，以及受控删除 `rm_safe` |
| Git | 状态、分支、日志、fetch、pull、switch |
| Docker / Compose | 容器、镜像、构建、日志及服务栈操作 |
| 服务 | `systemctl_*`、`firewall_cmd` |
| 网络 | 地址、路由、端口、ping、DNS、路由跟踪及 `curl_http` |
| 系统与进程 | 身份、运行时间、内存、磁盘、GPU、打开文件、进程查找及信号 |
| 归档 | `tar_create`、`tar_extract`、`zip`、`unzip` |

## 安全模型

`readOnly` 禁止写入，`commandBlacklist` 拦截匹配命令；`commandWhitelist` 可免除写入确认，但不能覆盖只读限制。

写入需客户端交互确认；`codexAutoReview: true` 允许兼容的 Codex 客户端自动审查。`dangerMode: true` 启用 Full Access，跳过审批并覆盖只读、命令和路径限制；SSH 认证和参数校验仍然生效。

## 推荐流程

1. 用 `list_servers` 选择已启用的服务器，调用 `connect(serverAlias)`。
2. 使用返回的 `sessionId` 顺序调用工具，目录、变量和函数跨调用保持。
3. 完成后调用 `disconnect(sessionId)`。

远程 Shell 须兼容 POSIX。自由命令只允许单个 Shell 片段，多步骤使用 `execute_batch`；命令需无需交互输入并在前台完成。相对远程路径以当前 Shell 目录为基准。

同一会话不支持并发；空闲过期或断线后需重新 `connect`。执行中的操作不会因空闲过期而中断；超时或断线后，先核实结果再重试。

## Skill 集成

Agent 使用指引：[SSH MCP Skill](skills/ssh-mcp/SKILL.md)。

## 开发

```bash
npm install
npm test
```

测试使用本机 SSH 服务和 Bash；Windows 自动查找 Git Bash，也可通过 `MCP_SSH_TEST_SHELL` 指定路径。

运行构建后的服务：

```bash
node dist/index.js --config ./config.json
```

## License

MIT. See [LICENSE](LICENSE).
