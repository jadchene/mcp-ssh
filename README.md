English | [简体中文](./README_zh.md)

# mcp-ssh

mcp-ssh gives AI agents persistent SSH sessions and tools for files, Git, Docker, and system inspection.

## Features

- Persistent shell sessions with shared directory, variables, and functions.
- Password, private-key, and jump-host authentication.
- Structured tools for files, Git, Docker, services, and system inspection.
- Per-server enable/read-only settings and named working directories.
- Interactive write approval, command policies, and optional Full Access.

## Quick Start

Use Node.js 24 or later and install from npm:

```bash
npm install -g @jadchene/mcp-ssh-service
```

Save the configuration below as `config.json`, replace the host and authentication details, and verify the host-key fingerprint. Then add the service using the [MCP client configuration](#mcp-client-configuration). The client starts this stdio service; no separate background process is needed.

## MCP Client Configuration

Replace `/path/to/config.json` with an absolute config path, such as `C:/mcp/ssh/config.json` on Windows.

Codex:

```bash
codex mcp add ssh -- mcp-ssh-service --config /path/to/config.json
```

Claude Code:

```bash
claude mcp add ssh -- mcp-ssh-service --config /path/to/config.json
```

## Configuration

Select a config file with `--config <path>` or `MCP_SSH_CONFIG`. The default is `config.json` in the current working directory.

When upgrading from a version before **3.0.0** to **3.x**, read the [migration guide](docs/CONFIG_MIGRATION.md).

Configuration example:

```json
{
  "logDir": "./logs",
  "defaultTimeout": 60000,
  "sessionIdleTimeoutMs": 1800000,
  "maxSessions": 32,
  "allowedLocalRoots": ["./transfer"],
  "commandBlacklist": ["^apt-get upgrade", "curl.*\\|.*sh"],
  "commandWhitelist": ["^systemctl status\\s+nginx$", "^docker ps$"],
  "servers": {
    "prod-web": {
      "enable": true,
      "desc": "Production web server",
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "./id_rsa",
      "passphrase": "${SSH_KEY_PASSPHRASE}",
      "strictHostKeyChecking": true,
      "hostKeySha256": "SHA256:REPLACE_WITH_SERVER_FINGERPRINT",
      "readOnly": false,
      "dangerMode": false,
      "codexAutoReview": false,
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

Place the private key beside `config.json`, or set `privateKeyPath` to its actual path. Set `SSH_KEY_PASSPHRASE` in the service's environment for an encrypted key; omit `passphrase` for an unencrypted key. Referenced `${VAR}` variables must exist. Password and jump-host examples are in [config.example.json](config.example.json).

Configuration changes reload automatically; invalid updates keep the last valid configuration. Changing SSH connection identity or disabling a server invalidates its sessions; call `connect` again after correcting or re-enabling the server configuration.

Relative private-key, log, and local transfer paths resolve from the config directory. Omitting `allowedLocalRoots` disables local file transfers; `allowedRemoteRoots` restricts only deletion through `rm_safe`. Timeouts are in milliseconds, and `maxSessions` includes connections being established.

Set `hostKeySha256` to a fingerprint verified through a trusted channel. Use `ssh-keyscan <host> | ssh-keygen -lf - -E sha256` to display fingerprints; the scan itself does not authenticate the host.

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

`readOnly` blocks writes and `commandBlacklist` blocks matching commands. `commandWhitelist` can skip write confirmation but cannot override read-only mode.

Writes require interactive client approval; `codexAutoReview: true` allows compatible Codex clients to review automatically. `dangerMode: true` enables Full Access, bypassing approval, read-only, command, and path restrictions. SSH authentication and argument validation still apply.

## Recommended Workflow

1. Use `list_servers` to choose an enabled server, then call `connect(serverAlias)`.
2. Call tools sequentially with the returned `sessionId`; directory, variables, and functions persist across calls.
3. Call `disconnect(sessionId)` when finished.

Use a POSIX-compatible shell. Free-form commands allow one shell segment; use `execute_batch` for multiple steps. Commands must run in the foreground without interactive input. Relative remote paths use the current shell directory.

A session does not support concurrent operations. Reconnect after idle expiry or connection loss. Running operations do not expire from idleness; check results before retrying a timed-out or interrupted operation.

## Skill Integration

Agent instructions: [SSH MCP skill](skills/ssh-mcp/SKILL.md).

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
