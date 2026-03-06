English | [简体中文](./README_zh.md)

# MCP SSH Server

A production-grade Model Context Protocol (MCP) server for stateless SSH command execution, management, and automation.

This server provides AI agents with secure, context-aware access to remote infrastructures using SSH. It features a unique two-step confirmation mechanism for high-risk operations, ensuring safety while enabling powerful automation.

## Quick Start

### Install from npm:

```bash
npm install -g mcp-ssh
mcp-ssh --config ./config.json
```

### Run from source:

```bash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
```

## Core Features

- **Stateless & Lazy**: SSH connections are established only during tool execution and closed immediately after.
- **Two-Step Confirmation**: High-risk tools (write operations) return a `confirmationId`. Execution only proceeds after a second call with `confirmExecution: true`, providing a robust human-in-the-loop safety net.
- **AI-Native Discovery**: Semantic path mappings and server listing help AI agents understand and navigate your environment.
- **Advanced Networking**: Supports **ProxyJump (Jump Hosts)**, private keys with **Passphrases**, and customizable timeouts.
- **Robust Security**: Global command blacklists (regex-based), read-only modes, and protection for system-critical directories.
- **Operational Excellence**: Integrated support for Git, Docker, Docker Compose, and Systemd.
- **Configuration Hot-Reload**: Changes to `config.json` are applied instantly without server restarts.

## Configuration

The server expects a `config.json` file. You can specify the path via the `--config` flag or the `MCP_SSH_CONFIG` environment variable.

```json
{
  "logDir": "./logs",
  "commandBlacklist": ["rm -rf /etc"],
  "servers": {
    "prod-server": {
      "desc": "Primary Production Web Server",
      "host": "1.2.3.4",
      "username": "deploy",
      "password": "${SERVER_PWD}",
      "workingDirectories": {
        "app": { "path": "/var/www/html", "desc": "Web application root" }
      }
    }
  }
}
```

## Available Tools

### Discovery & Context
- `list_servers`: Discovery all configured hosts.
- `list_working_directories`: Get semantic path mappings.
- `ping_server`: Test SSH connection and credentials.
- `get_system_info`: CPU, Memory, and System Uptime.
- `check_dependencies`: Verify remote binaries (docker, git, etc.).

### Shell & Files
- `execute_command`*, `execute_batch`*: Run single or multiple shell commands.
- `ll`, `cat`, `tail`, `grep`: Browse and search remote files.
- `upload_file`*, `download_file`: Transfer files.
- `mkdir`*, `mv`*, `cp`*, `chmod`*, `rm_safe`*, `touch`*: File system management.

### Services & Automation
- `docker_ps`, `docker_logs`, `docker_compose_up`*, `docker_compose_restart`*: Docker stack management.
- `systemctl_status`, `systemctl_restart`*: Service control.
- `git_status`, `git_pull`*: Version control.
- `ip_addr`, `ping`, `netstat`: Network diagnostics.

*\* Tools requiring confirmationId and confirmExecution: true.*

## License
MIT
