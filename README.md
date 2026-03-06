# SSH MCP Service

A production-ready, highly secure Model Context Protocol (MCP) server for remote server management. It features stateless connections, lazy loading, and a mandatory two-step confirmation flow for high-risk operations.

## Core Features

- **Stateless & Lazy Loading**: Connections are only established when a tool is called and closed immediately after execution. No persistent SSH tunnels.
- **Security First**: 
  - Mandatory manual confirmation for all "Write Actions" (e.g., `rm`, `restart`, `docker_stop`).
  - Command blacklist (prevents `rm -rf /`, etc.).
  - Restricted directory protection for safe deletions.
- **Context Aware**: Supports directory aliases and path mapping via `list_working_directories`.
- **Workflow Automation**: `execute_batch` allows running multiple commands in a single session with state (like `cd`) preserved between steps.

## Tool List (45 Total)

### 🛠️ Discovery & Core (8)
- `list_servers`: List all configured SSH servers.
- `ping_server`: Test connectivity to a specific server.
- `list_working_directories`: View path mappings/aliases.
- `check_dependencies`: Verify if required binaries (git, docker, etc.) are installed.
- `get_system_info`: Get CPU, memory, and kernel details.
- `pwd`: Show current remote path.
- `cd`: Change directory (effective within `execute_batch`).
- `execute_batch`: Run a sequence of tools in one session.

### 💻 Shell & Basic (2)
- `execute_command` (*): Run any arbitrary shell command.
- `echo`: Print text or variables.

### 📂 File Management (5)
- `upload_file` (*): Transfer file from local to remote.
- `download_file`: Transfer file from remote to local.
- `ll`: Detailed directory listing.
- `cat`: Read file content.
- `edit_text_file` (*): Replace file content (Safe Base64 transfer).
- `touch`: Create empty file or update timestamp.
- `find`: Search for files in a directory hierarchy.

### 🐳 Docker & Compose (18)
- `docker_compose_up` (*), `docker_compose_down` (*), `docker_compose_stop` (*), `docker_compose_restart` (*)
- `docker_compose_logs`: View compose logs.
- `docker_ps`, `docker_images`
- `docker_pull` (*), `docker_cp` (*), `docker_stop` (*), `docker_rm` (*), `docker_start` (*), `docker_rmi` (*), `docker_commit` (*)
- `docker_logs`: Get container logs.
- `docker_load` (*), `docker_save` (*)

### ⚙️ System Services (4)
- `systemctl_status`
- `systemctl_start` (*), `systemctl_stop` (*), `systemctl_restart` (*)

### 🌐 Network & Stats (8)
- `ip_addr`: Show network interfaces.
- `firewall_cmd` (*): Manage firewall rules.
- `netstat`: Monitor ports and connections.
- `nvidia_smi`: GPU status.
- `ps`: Process snapshot.
- `df_h`: Disk usage.
- `du_sh`: Directory size estimation.

> (*) Requires manual confirmation.

## Confirmation Protocol

For any tool marked with `(*)`, the service follows a two-step flow:
1. **Request**: Call the tool with parameters. The server returns a `confirmationId` and `status: "pending"`.
2. **Confirm**: Call the **same tool again** with `confirmExecution: true` and the provided `confirmationId`.

## Configuration

External configuration `config.json` allows defining multiple servers and their working directory aliases:

```json
{
  "servers": {
    "prod-web": {
      "host": "192.168.1.100",
      "user": "root",
      "keyPath": "~/.ssh/id_rsa",
      "workingDirectories": {
        "app": { "path": "/var/www/html", "desc": "Web Root" },
        "logs": { "path": "/var/log/nginx", "desc": "Nginx Logs" }
      }
    }
  }
}
```

## Installation

```bash
npm install
npm run build
node dist/index.js
```
