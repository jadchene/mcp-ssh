# SSH MCP 服务

一个面向生产环境、高度安全的远程服务器管理 Model Context Protocol (MCP) 服务。具备无状态连接、懒加载机制，以及针对高风险操作的强制性两步确认流程。

## 核心特性

- **无状态与懒加载**：仅在调用工具时建立连接，并在执行完成后立即关闭。不维持持久的 SSH 隧道。
- **安全至上**：
  - 所有“写操作”（如 `rm`, `restart`, `docker_stop`）必须通过人工两步确认。
  - 命令黑名单机制（防止执行 `rm -rf /` 等危险指令）。
  - 针对关键系统目录的删除保护。
- **上下文感知**：支持通过 `list_working_directories` 获取目录别名和路径映射。
- **自动化工作流**：`execute_batch` 允许在一个会话内按顺序执行多个工具，并可在步骤间保持状态（如 `cd` 切换目录）。

## 工具列表 (共 45 个)

### 🛠️ 发现与核心 (8个)
- `list_servers`: 列出所有配置的 SSH 服务器。
- `ping_server`: 测试与特定服务器的连接性。
- `list_working_directories`: 查看路径映射/别名。
- `check_dependencies`: 验证目标服务器是否安装了必要的二进制文件（如 git, docker）。
- `get_system_info`: 获取 CPU、内存和内核详细信息。
- `pwd`: 显示当前远程路径。
- `cd`: 切换目录（仅在 `execute_batch` 批量执行中生效）。
- `execute_batch`: 在单个会话中按顺序运行一系列工具。

### 💻 Shell 与基础 (2个)
- `execute_command` (*): 执行任意 Shell 命令。
- `echo`: 打印文本或变量。

### 📂 文件管理 (5个)
- `upload_file` (*): 从本地上传文件到远程。
- `download_file`: 从远程下载文件到本地。
- `ll`: 详细的目录列表。
- `cat`: 读取文件内容。
- `edit_text_file` (*): 替换文本类文件内容（使用 Base64 安全传输）。
- `touch`: 创建空文件或更新时间戳。
- `find`: 在目录层级中搜索文件。

### 🐳 Docker 与 Compose (18个)
- `docker_compose_up` (*), `docker_compose_down` (*), `docker_compose_stop` (*), `docker_compose_restart` (*)
- `docker_compose_logs`: 查看 Compose 日志。
- `docker_ps`, `docker_images`
- `docker_pull` (*), `docker_cp` (*), `docker_stop` (*), `docker_rm` (*), `docker_start` (*), `docker_rmi` (*), `docker_commit` (*)
- `docker_logs`: 获取容器日志。
- `docker_load` (*), `docker_save` (*)

### ⚙️ 系统服务 (4个)
- `systemctl_status`: 查看服务状态。
- `systemctl_start` (*), `systemctl_stop` (*), `systemctl_restart` (*): 服务生命周期管理。

### 🌐 网络与统计 (8个)
- `ip_addr`: 显示网络接口信息。
- `firewall_cmd` (*): 管理防火墙规则。
- `netstat`: 监控端口和连接。
- `nvidia_smi`: GPU 状态监控。
- `ps`: 进程快照。
- `df_h`: 磁盘使用情况。
- `du_sh`: 目录大小估算。

> (*) 需要人工确认。

## 确认协议 (Confirmation Protocol)

对于标记为 `(*)` 的任何工具，服务遵循两步走流程：
1. **请求**：携带参数调用工具。服务器返回 `confirmationId` 和 `status: "pending"`。
2. **确认**：**再次调用同一个工具**，并传入 `confirmExecution: true` 和之前获得的 `confirmationId`。

## 配置说明

外部配置文件 `config.json` 允许定义多台服务器及其工作目录别名：

```json
{
  "servers": {
    "prod-web": {
      "host": "192.168.1.100",
      "user": "root",
      "keyPath": "~/.ssh/id_rsa",
      "workingDirectories": {
        "app": { "path": "/var/www/html", "desc": "Web 根目录" },
        "logs": { "path": "/var/log/nginx", "desc": "Nginx 日志目录" }
      }
    }
  }
}
```

## 安装与运行

```bash
npm install
npm run build
node dist/index.js
```
