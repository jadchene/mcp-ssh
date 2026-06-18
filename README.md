English | [简体中文](./README_zh.md)

# mcp-ssh

mcp-ssh is a Model Context Protocol (MCP) server for remote SSH operations. It gives AI agents structured tools for server discovery, shell commands, files, Git, Docker, system services, network checks, and process inspection.

The service is designed for stateless SSH automation with explicit safety controls: server-level read-only mode, command blacklists, optional whitelists for trusted commands, two-step confirmation for high-risk operations, and single-command enforcement for free-form shell execution.

## Features

- Configure multiple SSH servers with semantic aliases and descriptions.
- Use password, private key, passphrase, and jump-host SSH connections.
- Map frequently used remote paths as named working directories.
- Run read-only system, file, process, network, Git, and Docker inspection tools.
- Execute controlled write operations only after confirmation unless a command is explicitly whitelisted.
- Reject shell chaining, pipes, redirection, subshells, and multiline payloads in `execute_command`.
- Use built-in tools for common operations instead of asking the agent to compose risky shell fragments.
- Support per-server `readOnly` mode to disable write and modify tools.
- Keep operational logs out of MCP stdout; file logs are written under `logDir`.

## Why Use It

- Agents get a stable tool surface instead of raw SSH access only.
- Server aliases and working directory aliases make remote infrastructure easier for agents to understand.
- High-risk actions are gated before execution.
- Common DevOps operations are represented as structured tools with validated parameters.

## Quick Start

Install from npm:

```bash
npm install -g @jadchene/mcp-ssh-service
mcp-ssh-service --config ./config.json
```

Run from source:

```bash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
```

The published CLI command is:

```text
mcp-ssh-service
```

## Configuration

Pass the config file by CLI argument:

```bash
mcp-ssh-service --config ./config.json
```

Or by environment variable:

```bash
MCP_SSH_CONFIG=./config.json mcp-ssh-service
```

If neither is provided, the service tries `config.json` in the current working directory.

Minimal config:

```json
{
  "logDir": "./logs",
  "defaultTimeout": 60000,
  "commandBlacklist": ["^apt-get upgrade", "curl.*\\|.*sh"],
  "commandWhitelist": ["^systemctl status\\s+nginx$", "^docker ps$"],
  "servers": {
    "prod-web": {
      "desc": "Production web server",
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "~/.ssh/id_rsa",
      "passphrase": "${SSH_KEY_PASSPHRASE}",
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

Global settings:

| Field | Type | Description |
| --- | --- | --- |
| `logDir` | string | Directory for file logs. Supports environment variables such as `${HOME}`. |
| `commandBlacklist` | string[] | Regex patterns for prohibited command strings. |
| `commandWhitelist` | string[] | Regex patterns for trusted final commands that can skip confirmation. |
| `defaultTimeout` | number | Command timeout in milliseconds. Defaults to `60000`. |
| `servers` | object | Server configs keyed by server alias. |

Server fields:

| Field | Type | Description |
| --- | --- | --- |
| `desc` | string | Human-readable server purpose shown to agents. |
| `host` | string | SSH hostname or IP. Supports environment variables. |
| `port` | number | SSH port. Defaults to `22`. |
| `username` | string | SSH username. |
| `password` | string | SSH password. Prefer `${VAR}` placeholders. |
| `privateKeyPath` | string | Path to a private key file. |
| `passphrase` | string | Private key passphrase. Prefer `${VAR}` placeholders. |
| `readOnly` | boolean | Disables write and modify tools for this server. |
| `strictHostKeyChecking` | boolean | Set to `false` only when you intentionally accept host key bypass. |
| `workingDirectories` | object | Named path aliases with `{ path, desc }`. |
| `proxyJump` | object | Optional jump host config. |

## MCP Tools

Use `list_tools` from your MCP client for the exact schema exposed by the installed version.

Discovery and core:

| Tool | Purpose |
| --- | --- |
| `list_servers` | List configured SSH servers, hosts, and descriptions. |
| `ping_server` | Test whether one server config is reachable. |
| `list_working_directories` | List named path aliases for one server. |
| `check_dependencies` | Check whether specific binaries exist on the remote server. |
| `execute_batch` | Run a sequence of tool calls in one persistent SSH session. |

System:

| Tool | Purpose |
| --- | --- |
| `get_system_info` | Return current user, uptime, kernel, and memory summary. |
| `hostname` | Show the remote hostname. |
| `id` | Show current user and group identity. |
| `uname` | Show kernel and operating system information. |
| `uptime` | Show uptime and load averages. |
| `free` | Show memory usage. |
| `env` | Show remote environment variables. |
| `pwd` | Show the current remote directory. |
| `cd` | Change directory inside an `execute_batch` session. |

Shell and files:

| Tool | Purpose |
| --- | --- |
| `execute_command` | Run exactly one shell command segment with confirmation unless whitelisted. |
| `echo` | Print text or variables. |
| `upload_file` | Upload a local file to the remote server. |
| `download_file` | Download a remote file to the local machine. |
| `ll` | List files with detailed information. |
| `cat` | Read a text file. |
| `head` | Read the first lines of a file. |
| `tail` | Read the last lines of a file or log. |
| `sed` | Read an inclusive line range from a text file. |
| `grep` | Search for a regex pattern in one file. |
| `grep_r` | Search recursively under a directory tree. |
| `edit_text_file` | Create or overwrite a text file. |
| `touch` | Create an empty file or update timestamps. |
| `mkdir` | Create a directory, with optional parent creation. |
| `mv` | Move or rename a file or directory. |
| `cp` | Copy a file or directory. |
| `append_text_file` | Append text to a file, creating it if needed. |
| `replace_in_file` | Replace literal text in a file. |
| `rm_safe` | Remove a file or directory through the guarded delete path. |
| `find` | Find files or directories by name, type, depth, or path pattern. |

Git:

| Tool | Purpose |
| --- | --- |
| `git_status` | Show repository status. |
| `git_fetch` | Fetch remote refs. |
| `git_pull` | Pull latest changes. |
| `git_switch` | Switch or create a branch. |
| `git_branch` | List local or all branches. |
| `git_log` | Show recent commit history. |

Docker and Compose:

| Tool | Purpose |
| --- | --- |
| `docker_compose_up` | Start or deploy a compose stack. |
| `docker_compose_down` | Stop and remove a compose stack. |
| `docker_compose_stop` | Stop compose services. |
| `docker_compose_logs` | Read compose logs. |
| `docker_compose_restart` | Restart a compose stack. |
| `docker_compose_pull` | Pull images for a compose stack. |
| `docker_compose_ps` | List compose services and state. |
| `docker_compose_config` | Render the resolved compose configuration. |
| `docker_compose_exec` | Run a process inside a compose service container. |
| `docker_ps` | List Docker containers. |
| `docker_images` | List Docker images. |
| `docker_exec` | Run a process inside a container. |
| `docker_inspect` | Inspect a container, image, volume, or network. |
| `docker_stats` | Show container resource usage. |
| `docker_pull` | Pull an image. |
| `docker_cp` | Copy files between container and remote filesystem. |
| `docker_stop` | Stop containers. |
| `docker_rm` | Remove containers. |
| `docker_start` | Start containers. |
| `docker_restart` | Restart containers. |
| `docker_rmi` | Remove images. |
| `docker_commit` | Create an image from container changes. |
| `docker_logs` | Read container logs. |
| `docker_load` | Load an image from a tar archive. |
| `docker_save` | Save an image to a tar archive. |
| `docker_build` | Build an image from a build context. |

Services and network:

| Tool | Purpose |
| --- | --- |
| `systemctl_status` | Check systemd service status. |
| `systemctl_restart` | Restart a systemd service. |
| `systemctl_start` | Start a systemd service. |
| `systemctl_stop` | Stop a systemd service. |
| `systemctl_enable` | Enable a systemd service at boot. |
| `systemctl_disable` | Disable a systemd service at boot. |
| `ip_addr` | Show network interface addresses. |
| `ip_route` | Show routing table information. |
| `mount` | Show mounted filesystems. |
| `journalctl` | Read systemd journal logs. |
| `firewall_cmd` | Run structured firewall operations. |
| `netstat` | Inspect ports and network connections. |
| `ss` | Inspect socket statistics. |
| `ping_host` | Ping a host. |
| `traceroute` | Trace the network path to a host. |
| `nslookup` | Resolve DNS with `nslookup`. |
| `dig` | Resolve DNS records with `dig`. |
| `curl_http` | Perform a structured HTTP request. |

Stats, process, and archive tools:

| Tool | Purpose |
| --- | --- |
| `nvidia_smi` | Show GPU status when `nvidia-smi` exists. |
| `ps` | Show a process snapshot. |
| `pgrep` | Find process IDs by pattern. |
| `kill_process` | Send a signal to a process. |
| `df_h` | Show filesystem disk usage. |
| `df_inode` | Show filesystem inode usage. |
| `du_sh` | Estimate directory size. |
| `which` | Resolve an executable path. |
| `lsof` | Inspect open files, ports, or process-file relationships. |
| `file` | Detect file type and encoding. |
| `stat` | Show file metadata. |
| `chmod` | Change file mode bits. |
| `chown` | Change file owner or group. |
| `ln` | Create a link, usually a symlink. |
| `tar_create` | Create a tar archive. |
| `tar_extract` | Extract a tar archive. |
| `zip` | Create a zip archive. |
| `unzip` | Extract a zip archive. |

## Safety Model

High-risk operations return a pending result with a `confirmationId`. The agent must call the same tool again with the same parameters plus `confirmationId` and `confirmExecution: true` after the user approves the operation.

The server checks that the confirmed parameters match the original request before executing.

`execute_command` accepts only one shell command segment. It rejects chaining operators such as `&&`, `||`, `;`, pipes, redirection, subshell syntax, and multiline input. Use `execute_batch` or built-in structured tools for multi-step workflows.

`commandBlacklist` blocks prohibited final command strings. `commandWhitelist` can skip confirmation only for trusted final command strings that match configured regex patterns.

For destructive or modifying work, prefer built-in tools such as `mkdir`, `edit_text_file`, `replace_in_file`, `docker_compose_restart`, or `systemctl_restart` over free-form shell commands.

## Recommended Workflow

1. Call `list_servers` and choose the target by alias and description.
2. Call `ping_server` before work that depends on connectivity.
3. Call `list_working_directories` when a task refers to a project, logs, or deployment path.
4. Use read-only tools first to inspect state.
5. For changes, use built-in structured tools and let the confirmation flow gate execution.
6. Verify the result with a read-only follow-up command or inspection tool.

## Skill Integration

This repository includes an SSH MCP skill for agents:

- Skill path: `skills/ssh-mcp/SKILL.md`

Use it when your agent supports skills. It standardizes server discovery, safe command selection, confirmation behavior, and post-action verification.

## MCP Client Configuration

Codex:

```toml
[mcp_servers.ssh]
command = "mcp-ssh-service"
args = ["--config", "./config.json"]
```

Gemini CLI:

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

Claude Code:

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

## Development

```bash
npm install
npm run build
npm test
```

Run the built server:

```bash
node dist/index.js --config ./config.json
```

## License

MIT. See [LICENSE](LICENSE).
