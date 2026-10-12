[English](./README.md) | 简体中文

# mcp-ssh

mcp-ssh 是一个用于远程 SSH 操作的 Model Context Protocol（MCP）服务。它为 AI Agent 提供结构化工具，用于服务器发现、Shell 命令、文件、Git、Docker、系统服务、网络检查和进程排查。

## 功能

- 持久 Shell 会话，目录、变量和函数跨调用保持。
- 支持密码、私钥和跳板机认证。
- 提供文件、Git、Docker、服务及系统检查的结构化工具。
- 支持服务器启用/只读设置和命名工作目录。
- 支持写操作确认、命令策略及可选 Full Access。

## 快速开始

从 npm 安装：

```bash
npm install -g @jadchene/mcp-ssh-service
mcp-ssh-service --config ./config.json
```

## 配置

通过 `--config <path>` 或 `MCP_SSH_CONFIG` 指定配置文件，默认读取当前工作目录下的 `config.json`。

升级前请阅读[配置迁移指南](docs/CONFIG_MIGRATION.md)。

配置示例：

```json
{
  "logDir": "./logs",
  "defaultTimeout": 60000,
  "allowedLocalRoots": ["./transfer"],
  "commandBlacklist": ["^apt-get upgrade", "curl.*\\|.*sh"],
  "commandWhitelist": ["^systemctl status\\s+nginx$", "^docker ps$"],
  "servers": {
    "prod-web": {
      "desc": "Production web server",
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "${HOME}/.ssh/id_rsa",
      "passphrase": "${SSH_KEY_PASSPHRASE}",
      "hostKeySha256": "SHA256:REPLACE_WITH_SERVER_FINGERPRINT",
      "dangerMode": false,
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

全局配置：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `logDir` | string | 文件日志目录，相对路径以配置文件目录为基准，支持 `${VAR}` 占位。 |
| `commandBlacklist` | string[] | 被禁止的命令字符串正则。 |
| `commandWhitelist` | string[] | 可信最终命令正则，匹配后可跳过确认。 |
| `defaultTimeout` | number | 命令超时时间，单位毫秒，默认 `60000`。 |
| `sessionIdleTimeoutMs` | number | 会话空闲超时，单位毫秒，默认 `1800000`（30 分钟）。 |
| `maxSessions` | number | 会话数量上限，包含建立中的连接，默认 `32`。 |
| `allowedLocalRoots` | string[] | 允许上传/下载访问的本地根目录；相对路径以配置文件目录为基准，省略时禁止本地文件访问。 |
| `servers` | object | 以服务器别名为 key 的服务器配置。 |

服务器字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `desc` | string | 展示给 Agent 的服务器用途描述。 |
| `enable` | boolean | 默认 `true`；设为 `false` 隐藏服务器、禁止连接并关闭已有会话。 |
| `host` | string | SSH 主机名或 IP，支持环境变量。 |
| `port` | number | SSH 端口，默认 `22`。 |
| `username` | string | SSH 用户名。 |
| `password` | string | SSH 密码，建议使用 `${VAR}` 占位。 |
| `privateKeyPath` | string | 私钥文件路径。 |
| `passphrase` | string | 私钥口令，建议使用 `${VAR}` 占位。 |
| `readOnly` | boolean | 禁用该服务器的写入和修改工具。 |
| `codexAutoReview` | boolean | 可选，默认 `false`；显式设为 `true` 才启用本服务器的 Codex 自动审批元数据。 |
| `dangerMode` | boolean | 可选，默认 `false`；设为 `true` 启用本服务器的 Full Access，跳过全部操作审批并覆盖只读、命令及路径访问限制。 |
| `strictHostKeyChecking` | boolean | 只有明确接受跳过 host key 校验时才设为 `false`。 |
| `hostKeySha256` | string 或 string[] | 开启严格校验（默认）时必须配置的 SSH 主机密钥指纹。 |
| `allowedRemoteRoots` | string[] | `rm_safe` 可执行删除的可选远程路径根目录。 |
| `workingDirectories` | object | `{ path, desc }` 形式的命名路径别名。 |
| `proxyJump` | object | 可选跳板机配置。 |

请先通过可信渠道核验主机密钥指纹再写入配置。`ssh-keyscan <host> | ssh-keygen -lf - -E sha256` 可输出 SHA-256 指纹，但扫描动作本身不能证明主机身份。

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

普通模式下，`readOnly` 禁止写操作，`commandBlacklist` 拦截匹配命令；`commandWhitelist` 可跳过写操作确认，但不能覆盖只读限制。自由命令仅允许单个 Shell 片段，多步骤操作使用结构化工具或 `execute_batch`。

需要确认的写操作使用 MCP elicitation。接受后执行展示的操作；拒绝、取消或客户端不支持确认时不执行。可选的 `codexAutoReview=true` 为 Codex 客户端添加审批元数据，是否批准由客户端决定。

`dangerMode=true` 为该服务器启用 Full Access，跳过审批、命令及只读/路径策略，响应中附带警告。服务器启用状态、参数校验、SSH 认证和会话执行规则仍然有效。

## 推荐流程

1. 用 `list_servers` 选择已启用的服务器，调用 `connect(serverAlias)`。
2. 使用返回的 `sessionId` 顺序调用工具，目录、变量和函数跨调用保持。
3. 完成后调用 `disconnect(sessionId)`。

远程 Shell 须兼容 POSIX，命令须无需交互输入并在前台完成。传输的相对远程路径以 Shell 当前目录为基准。会话失效后需重新 `connect`；超时或断线后，先检查远程结果再决定是否重试。从 v2 升级时请刷新客户端工具定义。

## Skill 集成

Agent 使用指引：[SSH MCP Skill](skills/ssh-mcp/SKILL.md)。

## MCP 客户端配置

请将 `/path/to/config.json` 替换为配置文件的绝对路径。

Codex：

```toml
[mcp_servers.ssh]
command = "mcp-ssh-service"
args = ["--config", "/path/to/config.json"]
```

Claude Code / Gemini CLI：

```json
{
  "mcpServers": {
    "ssh": {
      "type": "stdio",
      "command": "mcp-ssh-service",
      "args": ["--config", "/path/to/config.json"]
    }
  }
}
```

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
