English | [简体中文](./README_zh.md)

# mcp-ssh

mcp-ssh is a Model Context Protocol (MCP) server for remote SSH operations. It gives AI agents structured tools for server discovery, shell commands, files, Git, Docker, system services, network checks, and process inspection.

## Features

- Persistent shell sessions with shared directory, variables, and functions.
- Password, private-key, and jump-host authentication.
- Structured tools for files, Git, Docker, services, and system inspection.
- Per-server enable/read-only settings and named working directories.
- Interactive write approval, command policies, and optional Full Access.

## Quick Start

Install from npm:

```bash
npm install -g @jadchene/mcp-ssh-service
mcp-ssh-service --config ./config.json
```

## Configuration

Select a config file with `--config <path>` or `MCP_SSH_CONFIG`. The default is `config.json` in the current working directory.

Upgrading? Read the [configuration migration guide](docs/CONFIG_MIGRATION.md).

Configuration example:

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

Global settings:

| Field | Type | Description |
| --- | --- | --- |
| `logDir` | string | File log directory, relative to the config file. Supports `${VAR}` placeholders. |
| `commandBlacklist` | string[] | Regex patterns for prohibited command strings. |
| `commandWhitelist` | string[] | Regex patterns for trusted final commands that can skip confirmation. |
| `defaultTimeout` | number | Command timeout in milliseconds. Defaults to `60000`. |
| `sessionIdleTimeoutMs` | number | Session idle timeout in milliseconds. Defaults to `1800000` (30 minutes). |
| `maxSessions` | number | Session limit, including connections being established. Defaults to `32`. |
| `allowedLocalRoots` | string[] | Local roots available to upload/download. Relative paths resolve from the config directory; omitted means local file access is disabled. |
| `servers` | object | Server configs keyed by server alias. |

Server fields:

| Field | Type | Description |
| --- | --- | --- |
| `desc` | string | Human-readable server purpose shown to agents. |
| `enable` | boolean | Defaults to `true`. Set `false` to hide the server, block connections, and close its sessions. |
| `host` | string | SSH hostname or IP. Supports environment variables. |
| `port` | number | SSH port. Defaults to `22`. |
| `username` | string | SSH username. |
| `password` | string | SSH password. Prefer `${VAR}` placeholders. |
| `privateKeyPath` | string | Path to a private key file. |
| `passphrase` | string | Private key passphrase. Prefer `${VAR}` placeholders. |
| `readOnly` | boolean | Disables write and modify tools for this server. |
| `codexAutoReview` | boolean | Optional, defaults to `false`. Set `true` to enable Codex automatic-review metadata for this server. |
| `dangerMode` | boolean | Optional, defaults to `false`. Set `true` for Full Access on this server: skip all operation approval and override read-only, command, and path access restrictions. |
| `strictHostKeyChecking` | boolean | Set to `false` only when you intentionally accept host key bypass. |
| `hostKeySha256` | string or string[] | Required SSH host-key fingerprint(s) when strict checking is enabled (the default). |
| `allowedRemoteRoots` | string[] | Optional path roots within which `rm_safe` may delete. |
| `workingDirectories` | object | Named path aliases with `{ path, desc }`. |
| `proxyJump` | object | Optional jump host config. |

Obtain and verify a host-key fingerprint through a trusted channel before adding it. For example, `ssh-keyscan <host> | ssh-keygen -lf - -E sha256` prints SHA-256 fingerprints, but the scan itself does not authenticate the host.

## MCP Tools

Remote tools require `sessionId`; `connect` and `list_working_directories` use `serverAlias`. Use your MCP client's `list_tools` for exact parameters.

| Group | Tools |
| --- | --- |
| Sessions and discovery | `list_servers`, `connect`, `disconnect`, `ping_server`, `list_working_directories`, `check_dependencies` |
| Shell | `execute_command`, `execute_batch`, `cd`, `pwd`, `env`, `echo` (literal text) |
| Files | List, read, search, edit, transfer, permissions, and guarded deletion with `rm_safe` |
| Git | Status, branches, log, fetch, pull, and switch |
| Docker / Compose | Containers, images, builds, logs, and stack operations |
| Services | `systemctl_*`, `firewall_cmd` |
| Network | Addresses, routes, sockets, ping, DNS, tracing, and `curl_http` |
| System and processes | Identity, uptime, memory, disk, GPU, open files, process lookup, and signals |
| Archives | `tar_create`, `tar_extract`, `zip`, `unzip` |

## Safety Model

In normal mode, `readOnly` blocks writes and `commandBlacklist` blocks matching commands. `commandWhitelist` may skip write approval but cannot override read-only mode. Free-form commands must be a single shell segment; use structured tools or `execute_batch` for multiple steps.

Writes requiring approval use MCP elicitation. Accept executes the displayed operation; decline, cancel, or unavailable elicitation leaves it unexecuted. Optional `codexAutoReview=true` adds approval metadata for Codex clients; the client decides whether to approve.

`dangerMode=true` enables Full Access for that server: approval, command restrictions, and read-only/path policies are bypassed, and responses include a warning. Server enable state, argument validation, SSH authentication, and session execution rules still apply.

## Recommended Workflow

1. Use `list_servers` to choose an enabled server, then call `connect(serverAlias)`.
2. Call tools sequentially with the returned `sessionId`; directory, variables, and functions persist across calls.
3. Call `disconnect(sessionId)` when finished.

Use a POSIX-compatible shell and non-interactive foreground commands. Relative remote transfer paths use the current shell directory. Expired sessions require a new `connect`; after a timeout or connection loss, inspect remote results before retrying. Refresh client tool schemas when upgrading from v2.

## Skill Integration

Agent instructions: [SSH MCP skill](skills/ssh-mcp/SKILL.md).

## MCP Client Configuration

Replace `/path/to/config.json` with an absolute config path.

Codex:

```toml
[mcp_servers.ssh]
command = "mcp-ssh-service"
args = ["--config", "/path/to/config.json"]
```

Claude Code / Gemini CLI:

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

## Development

```bash
npm install
npm test
```

Tests use a local SSH server and Bash. On Windows, Git Bash is detected automatically; use `MCP_SSH_TEST_SHELL` to override its path.

Run the built server:

```bash
node dist/index.js --config ./config.json
```

## License

MIT. See [LICENSE](LICENSE).
