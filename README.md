# MCP SSH Server

A production-grade Model Context Protocol (MCP) server for stateless SSH command execution, management, and automation.

## Core Features

- **Stateless & Lazy**: Establishes SSH connections only when needed and closes them immediately.
- **AI-Native Discovery**: Tools like `list_servers` and `list_working_directories` help AI agents navigate your infrastructure autonomously.
- **Robust Security**:
  - **Human-in-the-loop**: High-risk tools require explicit confirmation.
  - **Command Blacklist**: Built-in protection against `rm -rf /` and customizable regex filters.
  - **Read-Only Mode**: Lock down sensitive servers at the config level.
  - **Restricted RM**: Hardcoded protection for system-critical directories.
- **Advanced Networking**: Supports **ProxyJump (Jump Hosts)**, private keys with **Passphrases**, and custom ports.
- **DevOps Ready**: Integrated tools for Git, Docker, Docker Compose, and Systemd.
- **Hot Reload**: Configuration changes applied instantly without restarting the server.
- **Env Var Support**: Use `${VAR}` in config files to keep credentials secure.

## Installation

```bash
npm install -g mcp-ssh
```

## Configuration

Create a `config.json` file. The server looks for it in the CWD or the path specified by `MCP_SSH_CONFIG`.

```json
{
  "servers": {
    "my-server": {
      "desc": "Main Web Server",
      "host": "1.2.3.4",
      "username": "root",
      "password": "${SERVER_PWD}",
      "workingDirectories": {
        "app": { "path": "/opt/app", "desc": "Application source code" }
      }
    }
  }
}
```

## Available Tools

### 1. Discovery & Context
- `list_servers`: Discovery available hosts.
- `list_working_directories`: Get semantic path mappings.
- `get_system_info`: CPU, Memory, Uptime.
- `check_dependencies`: Verify remote environment.

### 2. File & Shell
- `execute_command`*, `execute_batch`*: Run shell commands.
- `ll`, `cat`, `tail`, `grep`: Read and search files.
- `upload_file`*, `download_file`: Transfer files.
- `mkdir`, `mv`*, `chmod`*, `rm_safe`*: File system management.

### 3. Services & Automation
- `docker_ps`, `docker_logs`, `docker_compose_up`*: Docker stack management.
- `systemctl_status`, `systemctl_restart`*: Service control.
- `git_status`, `git_pull`*: Version control.
- `ip_addr`, `ping`, `netstat`: Network diagnostics.

*\* Tools marked with an asterisk require manual confirmation.*

## Development

```bash
npm run build   # Compile TS
npm run watch   # Real-time compilation
```

## License
MIT
