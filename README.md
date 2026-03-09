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
*   **Command Whitelist**: Trusted final command strings can bypass manual confirmation by matching configured regex patterns. This applies to built-in high-risk tools and to `execute_batch` sub-commands.
*   **Single-Command Enforcement**: `execute_command` rejects shell chaining, pipes, redirection, subshells, and multiline payloads at the server layer.
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
| `commandWhitelist` | string[] | Trusted final-command regex patterns that can skip confirmation for high-risk tools and `execute_batch` sub-commands. |
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
  "commandWhitelist": ["^systemctl status\\s+nginx$", "^docker ps$"],
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

## 🛠️ Integrated Toolset (79 Tools)

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
* `execute_command` [Auth Required, single command only]
* `echo`

### File Management (17)
* `upload_file` [Auth Required]
* `download_file`
* `ll`
* `cat`
* `head`
* `tail`
* `sed`
* `grep`
* `edit_text_file` [Auth Required]
* `touch`
* `mkdir` [Auth Required]
* `mv` [Auth Required]
* `cp` [Auth Required]
* `append_text_file` [Auth Required]
* `replace_in_file` [Auth Required]
* `rm_safe` [Auth Required]
* `find`

### Git (6)
* `git_status`
* `git_fetch` [Auth Required]
* `git_pull` [Auth Required]
* `git_switch` [Auth Required]
* `git_branch`
* `git_log`

### Docker & Compose (21)
* `docker_compose_up` [Auth Required]
* `docker_compose_down` [Auth Required]
* `docker_compose_stop` [Auth Required]
* `docker_compose_logs`
* `docker_compose_restart` [Auth Required]
* `docker_ps`
* `docker_images`
* `docker_exec` [Auth Required]
* `docker_inspect`
* `docker_stats`
* `docker_pull` [Auth Required]
* `docker_cp` [Auth Required]
* `docker_stop` [Auth Required]
* `docker_rm` [Auth Required]
* `docker_start` [Auth Required]
* `docker_restart` [Auth Required]
* `docker_rmi` [Auth Required]
* `docker_commit` [Auth Required]
* `docker_logs`
* `docker_load` [Auth Required]
* `docker_save` [Auth Required]

### Service & Network (14)
* `systemctl_status`
* `systemctl_restart` [Auth Required]
* `systemctl_start` [Auth Required]
* `systemctl_stop` [Auth Required]
* `ip_addr`
* `journalctl`
* `firewall_cmd` [Auth Required, structured actions only]
* `netstat` [uses `args: string[]`]
* `ss` [uses `args: string[]`]
* `ping_host`
* `traceroute`
* `nslookup`
* `dig`
* `curl_http` [Auth Required]

### Stats & Process (13)
* `nvidia_smi`
* `ps`
* `pgrep`
* `kill_process` [Auth Required]
* `df_h`
* `du_sh`
* `chmod` [Auth Required]
* `chown` [Auth Required]
* `ln` [Auth Required]
* `tar_create` [Auth Required]
* `tar_extract` [Auth Required]
* `zip` [Auth Required]
* `unzip` [Auth Required]

Total: 81 tools.

---

## 🔐 The Confirmation Workflow

1.  **Request**: AI calls `execute_command({ command: 'systemctl restart nginx' })`.
2.  **Intercept**: Server returns `status: "pending"` with a `confirmationId`.
3.  **Human Input**: You review the action in your chat client and approve.
4.  **Execution**: AI calls `execute_command` again with the `confirmationId` and `confirmExecution: true`.
5.  **Verify**: Server ensures parameters match exactly and executes the SSH command.

If a high-risk tool's final command string matches `commandWhitelist`, the server skips the pending confirmation step and runs it directly. For `execute_batch`, only non-whitelisted high-risk sub-commands keep the batch in the confirmation flow.

`execute_command` is limited to one shell command segment. The server rejects chaining operators such as `&&`, `||`, `;`, pipes, redirection, subshell syntax, and multiline input. For built-in tools, user-provided parameters are shell-escaped before execution to reduce command injection risk.

`firewall_cmd` no longer accepts a free-form shell fragment. Use structured fields such as `action`, `port`, `zone`, `permanent`, and `listTarget`. `netstat` now accepts `args: string[]` so each option is validated as an individual token.

Use `mkdir` for directory creation instead of `execute_command "mkdir ..."`. Set `parents: true` when you need `mkdir -p` behavior.

---

## 📄 License
Released under the [MIT License](./LICENSE).
