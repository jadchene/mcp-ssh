English | [简体中文](./README_zh.md)

# 🚀 mcp-ssh

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![MCP Ready](https://img.shields.io/badge/MCP-Ready-blue)](https://modelcontextprotocol.io/)

A **production-grade** Model Context Protocol (MCP) server designed for secure, stateless SSH automation. This service empowers AI agents to manage remote infrastructure with **human-in-the-loop** safety and **semantic environment awareness**.

---

## 🌟 Key Pillars

### 🔒 Uncompromising Security
*   **Two-Step Confirmation**: High-risk operations (writes, deletes, restarts) return a `confirmationId`. Nothing happens until a human approves the specific transaction.
*   **Command Blacklist**: Real-time regex interception for catastrophic commands like `rm -rf /` or `mkfs`.
*   **Server-Level Read-Only**: Lock specific servers to a non-destructive mode at the configuration level.
*   **Restricted File Deletion**: Hardcoded prevention of accidental deletion of system-critical paths like `/etc` or `/usr`.

### 🧠 AI-Native Design
*   **Semantic Infrastructure Discovery**: AI can list servers and understand their purposes via natural language descriptions.
*   **Working Directory Aliases**: Map complex paths to simple aliases like `app-root` with descriptive metadata.
*   **Contextual Pre-checks**: Built-in tools to verify dependencies (Docker, Git) before execution.

---

## 🚀 Quick Start

### Installation

```bash
# Install globally via npm
npm install -g @jadchene/mcp-ssh-service

# Start the server with a config file
mcp-ssh-service --config ./config.json
```

### Source Setup

```bash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
```

---

## 🧩 Skill Integration (Recommended)

For AI assistants (Codex / Gemini / similar agents), this repository includes an SSH MCP skill that significantly improves execution quality and safety consistency.

- Skill path: `skills/ssh-mcp/SKILL.md`
- Benefits:
  - Enforces strict two-step confirmation for high-risk operations
  - Prefers `execute_batch` for multi-step workflows and avoids risky command chaining
  - Standardizes server discovery, dependency checks, and post-action verification
  - Reduces accidental destructive operations and context-loss mistakes

When your agent supports skills, load this skill before using SSH MCP tools for best results.

---

## ⚙️ Configuration Schema

### Global Settings
| Parameter | Type | Description |
| --- | --- | --- |
| `logDir` | string | Directory for logs. Supports env vars like `${HOME}`. |
| `commandBlacklist` | string[] | Prohibited command regex patterns (e.g., `["^rm -rf"]`). |
| `defaultTimeout` | number | Command timeout in milliseconds (default: 60000). |
| `servers` | object | Dictionary of server configs where key is the `serverAlias`. |

### Server Object
| Parameter | Type | Description |
| --- | --- | --- |
| `host` | string | Remote IP or hostname. Supports env vars. |
| `port` | number | SSH port (default: 22). |
| `username` | string | SSH login user. |
| `password` | string | SSH password. Use `${VAR}` for security. |
| `privateKeyPath` | string | Path to private key file. |
| `passphrase` | string | Passphrase for the private key. |
| `readOnly` | boolean | Disables all write/modify tools for this server. |
| `desc` | string | Server description shown in `list_servers`. |
| `strictHostKeyChecking` | boolean | Set to `false` to bypass host key verification. |
| `workingDirectories` | object | Semantic path mappings (Key: { path, desc }). |
| `proxyJump` | object | Optional jump host (recursive server config). |

---

## ⚙️ Configuration Example

```json
{
  "logDir": "./logs",
  "defaultTimeout": 60000,
  "commandBlacklist": ["^apt-get upgrade", "curl.*\\|.*sh"],
  "servers": {
    "prod-web": {
      "desc": "Primary API Cluster",
      "host": "10.0.0.5",
      "username": "deploy",
      "privateKeyPath": "~/.ssh/id_rsa",
      "passphrase": "${SSH_KEY_PWD}",
      "workingDirectories": {
        "logs": { "path": "/var/log/nginx", "desc": "Nginx access logs" }
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

## MCP Client Configuration

The following examples show how to register this MCP server in common AI clients. Replace the config path with your own local file path. To keep the setup portable, the examples below intentionally avoid absolute paths.

### Codex

`~/.codex/config.toml`

```toml
[mcp_servers.ssh]
command = "mcp-ssh-service"
args = ["--config", "./config.json"]
```

### Gemini CLI

`settings.json`

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

`.claude.json`

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

## 🛠️ Integrated Toolset (50 Tools)

### Discovery & Core (8)
* `list_servers`
* `ping_server`
* `list_working_directories`
* `check_dependencies`
* `get_system_info`
* `pwd`
* `cd`
* `execute_batch` [Auth Required if any sub-command is high-risk]

### Shell & Basic (2)
* `execute_command` [Auth Required]
* `echo`

### File Management (10)
* `upload_file` [Auth Required]
* `download_file`
* `ll`
* `cat`
* `tail`
* `grep`
* `edit_text_file` [Auth Required]
* `touch`
* `rm_safe` [Auth Required]
* `find`

### Git (2)
* `git_status`
* `git_pull` [Auth Required]

### Docker & Compose (17)
* `docker_compose_up` [Auth Required]
* `docker_compose_down` [Auth Required]
* `docker_compose_stop` [Auth Required]
* `docker_compose_logs`
* `docker_compose_restart` [Auth Required]
* `docker_ps`
* `docker_images`
* `docker_pull` [Auth Required]
* `docker_cp` [Auth Required]
* `docker_stop` [Auth Required]
* `docker_rm` [Auth Required]
* `docker_start` [Auth Required]
* `docker_rmi` [Auth Required]
* `docker_commit` [Auth Required]
* `docker_logs`
* `docker_load` [Auth Required]
* `docker_save` [Auth Required]

### Service & Network (7)
* `systemctl_status`
* `systemctl_restart` [Auth Required]
* `systemctl_start` [Auth Required]
* `systemctl_stop` [Auth Required]
* `ip_addr`
* `firewall_cmd` [Auth Required]
* `netstat`

### Stats & Process (4)
* `nvidia_smi`
* `ps`
* `df_h`
* `du_sh`

Total: 50 tools.

---

## 🔐 The Confirmation Workflow

1.  **Request**: AI calls `execute_command({ command: 'systemctl restart nginx' })`.
2.  **Intercept**: Server returns `status: "pending"` with a `confirmationId`.
3.  **Human Input**: You review the action in your chat client and approve.
4.  **Execution**: AI calls `execute_command` again with the `confirmationId` and `confirmExecution: true`.
5.  **Verify**: Server ensures parameters match exactly and executes the SSH command.

---

## 📄 License
Released under the [MIT License](./LICENSE).
