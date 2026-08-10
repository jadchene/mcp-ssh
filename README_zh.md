[English](./README.md) | 简体中文

# mcp-ssh

mcp-ssh 是一个用于远程 SSH 操作的 Model Context Protocol（MCP）服务。它为 AI Agent 提供结构化工具，用于服务器发现、Shell 命令、文件、Git、Docker、系统服务、网络检查和进程排查。

服务面向无状态 SSH 自动化，并内置明确的安全控制：服务器级只读模式、命令黑名单、可信命令白名单、交互式确认及两步回退，以及自由 Shell 命令的单命令限制。

## 功能

- 通过语义化别名和描述配置多个 SSH 服务器。
- 支持密码、私钥、私钥口令和跳板机 SSH 连接。
- 把常用远程路径映射成命名工作目录。
- 使用只读系统、文件、进程、网络、Git 和 Docker 检查工具。
- 写入操作默认需要确认，除非最终命令被显式白名单信任。
- `execute_command` 会拒绝命令串联、管道、重定向、子 Shell 和多行输入。
- 为常见操作提供内置工具，减少让 Agent 拼接高风险 Shell 片段的需求。
- 支持按服务器设置 `readOnly`，禁用写入和修改工具。
- 运行日志不写入 MCP stdout；文件日志写入 `logDir`。

## 为什么使用它

- Agent 获得稳定工具接口，而不是只有原始 SSH 命令入口。
- 服务器别名和工作目录别名让 Agent 更容易理解远程环境。
- 高风险操作在执行前会被确认流程拦截。
- 常见运维动作被封装成带参数校验的结构化工具。

## 快速开始

从 npm 安装：

```bash
npm install -g @jadchene/mcp-ssh-service
mcp-ssh-service --config ./config.json
```

从源码运行：

```bash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
```

发布后的 CLI 命令是：

```text
mcp-ssh-service
```

## 配置

通过 CLI 参数指定配置文件：

```bash
mcp-ssh-service --config ./config.json
```

或通过环境变量指定：

```bash
MCP_SSH_CONFIG=./config.json mcp-ssh-service
```

如果两者都没有提供，服务会尝试读取当前工作目录下的 `config.json`。

升级现有部署前，请先阅读[安全加固配置迁移指南](docs/CONFIG_MIGRATION.md)。

最小配置：

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
| `logDir` | string | 文件日志目录。支持 `${HOME}` 等环境变量。 |
| `commandBlacklist` | string[] | 被禁止的命令字符串正则。 |
| `commandWhitelist` | string[] | 可信最终命令正则，匹配后可跳过确认。 |
| `defaultTimeout` | number | 命令超时时间，单位毫秒，默认 `60000`。 |
| `allowedLocalRoots` | string[] | 允许上传/下载访问的本地根目录；相对路径以配置文件目录为基准，省略时禁止本地文件访问。 |
| `servers` | object | 以服务器别名为 key 的服务器配置。 |

服务器字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `desc` | string | 展示给 Agent 的服务器用途描述。 |
| `host` | string | SSH 主机名或 IP，支持环境变量。 |
| `port` | number | SSH 端口，默认 `22`。 |
| `username` | string | SSH 用户名。 |
| `password` | string | SSH 密码，建议使用 `${VAR}` 占位。 |
| `privateKeyPath` | string | 私钥文件路径。 |
| `passphrase` | string | 私钥口令，建议使用 `${VAR}` 占位。 |
| `readOnly` | boolean | 禁用该服务器的写入和修改工具。 |
| `strictHostKeyChecking` | boolean | 只有明确接受跳过 host key 校验时才设为 `false`。 |
| `hostKeySha256` | string 或 string[] | 开启严格校验（默认）时必须配置的 SSH 主机密钥指纹。 |
| `allowedRemoteRoots` | string[] | `rm_safe` 可执行删除的可选远程路径根目录。 |
| `workingDirectories` | object | `{ path, desc }` 形式的命名路径别名。 |
| `proxyJump` | object | 可选跳板机配置。 |

请先通过可信渠道核验主机密钥指纹再写入配置。`ssh-keyscan <host> | ssh-keygen -lf - -E sha256` 可输出 SHA-256 指纹，但扫描动作本身不能证明主机身份。

## MCP 工具

请使用 MCP 客户端的 `list_tools` 查看当前安装版本暴露的精确 schema。

发现与核心：

| 工具 | 用途 |
| --- | --- |
| `list_servers` | 列出已配置 SSH 服务器、主机和描述。 |
| `ping_server` | 测试某个服务器配置是否可连接。 |
| `list_working_directories` | 列出某台服务器的命名路径别名。 |
| `check_dependencies` | 检查远程服务器是否存在指定命令。 |
| `execute_batch` | 在同一个持久 SSH 会话中执行一组工具调用。 |

系统：

| 工具 | 用途 |
| --- | --- |
| `get_system_info` | 返回当前用户、运行时间、内核和内存摘要。 |
| `hostname` | 查看远程主机名。 |
| `id` | 查看当前用户和用户组身份。 |
| `uname` | 查看内核和操作系统信息。 |
| `uptime` | 查看运行时间和负载。 |
| `free` | 查看内存使用情况。 |
| `env` | 查看远程会话环境变量。 |
| `pwd` | 查看当前远程目录。 |
| `cd` | 在 `execute_batch` 会话中切换目录。 |

Shell 与文件：

| 工具 | 用途 |
| --- | --- |
| `execute_command` | 执行单个 Shell 命令片段，除非命中白名单，否则需要确认。 |
| `echo` | 输出文本或变量。 |
| `upload_file` | 上传本地文件到远程服务器。 |
| `download_file` | 下载远程文件到本机。 |
| `ll` | 以详细格式列出文件。 |
| `cat` | 读取文本文件。 |
| `head` | 读取文件开头若干行。 |
| `tail` | 读取文件或日志末尾若干行。 |
| `sed` | 读取文本文件的闭区间行范围。 |
| `grep` | 在单个文件中按正则搜索。 |
| `grep_r` | 在目录树下递归搜索。 |
| `edit_text_file` | 创建或覆盖文本文件。 |
| `touch` | 创建空文件或更新时间戳。 |
| `mkdir` | 创建目录，可选择创建父目录。 |
| `mv` | 移动或重命名文件/目录。 |
| `cp` | 复制文件或目录。 |
| `append_text_file` | 追加文本到文件，不存在时创建。 |
| `replace_in_file` | 替换文件中的字面量文本。 |
| `rm_safe` | 通过受控删除路径删除文件或目录。 |
| `find` | 按名称、类型、深度或路径模式查找文件/目录。 |

Git：

| 工具 | 用途 |
| --- | --- |
| `git_status` | 查看仓库状态。 |
| `git_fetch` | 拉取远程引用。 |
| `git_pull` | 拉取最新变更。 |
| `git_switch` | 切换或创建分支。 |
| `git_branch` | 列出本地或全部分支。 |
| `git_log` | 查看最近提交历史。 |

Docker 与 Compose：

| 工具 | 用途 |
| --- | --- |
| `docker_compose_up` | 启动或部署 compose stack。 |
| `docker_compose_down` | 停止并移除 compose stack。 |
| `docker_compose_stop` | 停止 compose 服务。 |
| `docker_compose_logs` | 查看 compose 日志。 |
| `docker_compose_restart` | 重启 compose stack。 |
| `docker_compose_pull` | 拉取 compose stack 镜像。 |
| `docker_compose_ps` | 列出 compose 服务和状态。 |
| `docker_compose_config` | 渲染完整 compose 配置。 |
| `docker_compose_exec` | 在 compose 服务容器中运行进程。 |
| `docker_ps` | 列出 Docker 容器。 |
| `docker_images` | 列出 Docker 镜像。 |
| `docker_exec` | 在容器中运行进程。 |
| `docker_inspect` | 检查容器、镜像、卷或网络。 |
| `docker_stats` | 查看容器资源使用情况。 |
| `docker_pull` | 拉取镜像。 |
| `docker_cp` | 在容器和远程文件系统之间复制文件。 |
| `docker_stop` | 停止容器。 |
| `docker_rm` | 删除容器。 |
| `docker_start` | 启动容器。 |
| `docker_restart` | 重启容器。 |
| `docker_rmi` | 删除镜像。 |
| `docker_commit` | 从容器变更创建镜像。 |
| `docker_logs` | 查看容器日志。 |
| `docker_load` | 从 tar 归档加载镜像。 |
| `docker_save` | 把镜像保存为 tar 归档。 |
| `docker_build` | 从构建上下文构建镜像。 |

服务与网络：

| 工具 | 用途 |
| --- | --- |
| `systemctl_status` | 查看 systemd 服务状态。 |
| `systemctl_restart` | 重启 systemd 服务。 |
| `systemctl_start` | 启动 systemd 服务。 |
| `systemctl_stop` | 停止 systemd 服务。 |
| `systemctl_enable` | 设置 systemd 服务开机启用。 |
| `systemctl_disable` | 设置 systemd 服务开机禁用。 |
| `ip_addr` | 查看网络接口地址。 |
| `ip_route` | 查看路由表信息。 |
| `mount` | 查看已挂载文件系统。 |
| `journalctl` | 查看 systemd journal 日志。 |
| `firewall_cmd` | 执行结构化防火墙操作。 |
| `netstat` | 检查端口和网络连接。 |
| `ss` | 检查 socket 统计信息。 |
| `ping_host` | ping 指定主机。 |
| `traceroute` | 跟踪到目标主机的网络路径。 |
| `nslookup` | 使用 `nslookup` 解析 DNS。 |
| `dig` | 使用 `dig` 解析 DNS 记录。 |
| `curl_http` | 执行结构化 HTTP 请求。 |

状态、进程和归档：

| 工具 | 用途 |
| --- | --- |
| `nvidia_smi` | 在存在 `nvidia-smi` 时查看 GPU 状态。 |
| `ps` | 查看进程快照。 |
| `pgrep` | 按模式查找进程 ID。 |
| `kill_process` | 向进程发送信号。 |
| `df_h` | 查看文件系统磁盘使用情况。 |
| `df_inode` | 查看文件系统 inode 使用情况。 |
| `du_sh` | 估算目录大小。 |
| `which` | 解析命令可执行文件路径。 |
| `lsof` | 检查打开文件、端口或进程文件关系。 |
| `file` | 识别文件类型和编码。 |
| `stat` | 查看文件元数据。 |
| `chmod` | 修改文件权限位。 |
| `chown` | 修改文件所有者或用户组。 |
| `ln` | 创建链接，通常是符号链接。 |
| `tar_create` | 创建 tar 归档。 |
| `tar_extract` | 解压 tar 归档。 |
| `zip` | 创建 zip 归档。 |
| `unzip` | 解压 zip 归档。 |

## 安全模型

写操作会在交互式 elicitation 表单中展示服务器、实际命令或操作以及风险等级。用户选择 `yes` 执行，选择 `no` 拒绝；拒绝结果会明确返回给 Agent，且不会执行任何操作。

当 MCP 客户端不支持 elicitation 时，操作会返回带 `confirmationId` 的 pending 结果。用户明确确认后，Agent 必须用相同参数再次调用同一个工具，并附带 `confirmationId` 和 `confirmExecution: true`。

服务会检查确认时的参数是否与原始请求完全一致，然后才执行。

`execute_command` 只接受单个 Shell 命令片段。它会拒绝 `&&`、`||`、`;`、管道、重定向、子 Shell 语法和多行输入。多步骤工作请使用 `execute_batch` 或内置结构化工具。

`commandBlacklist` 会阻止被禁止的最终命令字符串。`commandWhitelist` 只会对匹配配置正则的可信最终命令跳过确认。

对破坏性或修改类工作，优先使用 `mkdir`、`edit_text_file`、`replace_in_file`、`docker_compose_restart`、`systemctl_restart` 等内置工具，而不是自由 Shell 命令。

## 推荐流程

1. 调用 `list_servers`，根据别名和描述选择目标服务器。
2. 依赖连通性的任务先调用 `ping_server`。
3. 当任务涉及项目、日志或部署路径时，调用 `list_working_directories`。
4. 先使用只读工具检查现状。
5. 变更类操作使用内置结构化工具，并由确认流程控制执行。
6. 操作后用只读命令或检查工具验证结果。

## Skill 集成

仓库内包含一个 SSH MCP skill：

- Skill 路径：`skills/ssh-mcp/SKILL.md`

当你的 Agent 支持 skills 时建议加载它。它会统一服务器发现、安全命令选择、确认行为和操作后验证。

## MCP 客户端配置

Codex：

```toml
[mcp_servers.ssh]
command = "mcp-ssh-service"
args = ["--config", "./config.json"]
```

Gemini CLI：

```json
{
  "mcpServers": {
    "ssh": {
      "type": "stdio",
      "command": "mcp-ssh-service",
      "args": ["--config", "./config.json"]
    }
  }
}
```

Claude Code：

```json
{
  "mcpServers": {
    "ssh": {
      "type": "stdio",
      "command": "mcp-ssh-service",
      "args": ["--config", "./config.json"]
    }
  }
}
```

## 开发

```bash
npm install
npm run build
npm test
```

运行构建后的服务：

```bash
node dist/index.js --config ./config.json
```

## License

MIT. See [LICENSE](LICENSE).
