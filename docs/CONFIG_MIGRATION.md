# Security hardening configuration migration

This guide applies when upgrading from a configuration created before the security-hardening changes. The new defaults intentionally fail closed: SSH host identity must be verified, local file access must be explicitly scoped, and `rm_safe` must be limited to approved remote roots.

## Required changes

### 1. Configure SSH host-key fingerprints

Host-key verification is enabled by default. Add `hostKeySha256` to every server and jump host:

```json
{
  "servers": {
    "prod-web": {
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "${HOME}/.ssh/id_rsa",
      "hostKeySha256": "SHA256:REPLACE_WITH_VERIFIED_FINGERPRINT",
      "proxyJump": {
        "host": "bastion.example.com",
        "port": 22,
        "username": "jumpuser",
        "password": "${JUMP_PASSWORD}",
        "hostKeySha256": "SHA256:REPLACE_WITH_VERIFIED_BASTION_FINGERPRINT"
      }
    }
  }
}
```

Multiple fingerprints can be supplied during a controlled host-key rotation:

```json
"hostKeySha256": [
  "SHA256:CURRENT_FINGERPRINT",
  "SHA256:NEXT_FINGERPRINT"
]
```

Obtain the expected fingerprint from a trusted source such as the server console, infrastructure inventory, or administrator. The following command prints fingerprints advertised by a host, but the scan itself does not authenticate that host:

```bash
ssh-keyscan example.com | ssh-keygen -lf - -E sha256
```

Emergency compatibility escape hatch:

```json
"strictHostKeyChecking": false
```

This disables server identity verification and should only be used temporarily in an isolated environment.

### 2. Allow local upload and download paths

Local file access is disabled when `allowedLocalRoots` is absent or empty. Add the smallest directories needed by file-transfer tools:

```json
{
  "allowedLocalRoots": [
    "./transfer",
    "${HOME}/mcp-ssh-artifacts"
  ]
}
```

Relative roots are resolved from the directory containing `config.json`. Upload sources and download destinations are resolved to their real local paths and must remain inside one of these roots. Downloads refuse symbolic-link destinations and are written to a temporary file before an atomic rename.

The `download_file` tool is now treated as a write operation. It requires interactive elicitation confirmation and is rejected for servers configured with `readOnly: true`.

### 3. Restrict `rm_safe` to explicit remote roots

`rm_safe` now accepts only absolute paths within `allowedRemoteRoots`:

```json
{
  "servers": {
    "prod-web": {
      "allowedRemoteRoots": [
        "/srv/app/releases",
        "/var/www/app/cache"
      ]
    }
  }
}
```

The target is normalized locally and resolved again on the remote host with `realpath` immediately before deletion. Deletion is denied when the resolved path leaves the configured roots. Broad system roots such as `/`, `/etc`, `/usr`, `/var`, `/home`, and `/root` cannot be configured directly.

If `allowedRemoteRoots` is absent, `rm_safe` is disabled for that server.

## Behavior changes

| Area | Previous behavior | New behavior |
| --- | --- | --- |
| SSH host identity | Host keys could be accepted without verification | SHA-256 fingerprint required by default |
| Missing environment variable | Placeholder became an empty string | Configuration load fails |
| Invalid regex or range | Often failed later at execution | Configuration or tool request is rejected early |
| Local file transfer | Arbitrary process-accessible paths | Explicit `allowedLocalRoots` sandbox |
| `download_file` | No confirmation; allowed on read-only server | Confirmation required; blocked on read-only server |
| `touch` | Not classified as a write | Confirmation/read-only policy enforced |
| `rm_safe` | Small exact-path denylist | Absolute allowlisted roots plus remote real-path check |
| Unknown tool fields | Could pass through schema declarations | Rejected by runtime JSON Schema validation |
| Command output | Truncated only after full buffering | Captured with a fixed per-stream byte limit |

## Migration checklist

1. Back up the current `config.json`.
2. Add verified `hostKeySha256` values for every server and `proxyJump`.
3. Create the required local transfer directories and add minimal `allowedLocalRoots` entries.
4. Add narrow `allowedRemoteRoots` entries only on servers that need `rm_safe`.
5. Confirm every `${ENV_VAR}` used by the configuration exists in the service environment.
6. Start the service, call `list_servers`, and call `connect(serverAlias)` on an enabled server. Use the returned `sessionId` for `ping_server` and remote operations; `list_working_directories` still uses `serverAlias`.
7. Test upload, download, and deletion against non-production paths before rollout.
8. Remove any temporary `strictHostKeyChecking: false` setting.

## Version 3 persistent sessions

Remote tools require `sessionId`; sending only `serverAlias` is rejected. Refresh the client's tool schemas after upgrading. Only `connect` creates an SSH connection and persistent POSIX-compatible shell. Individual calls and batches share directory, variables, and functions. Call `disconnect` when finished; expired IDs cannot be reused or automatically reconnected.

Optional global configuration: `sessionIdleTimeoutMs` defaults to `1800000` (30 minutes), and `maxSessions` defaults to `32`, including connections being established. Idle expiry pauses while an operation executes, but approval waiting does not pause expiry. Command or transfer timeout invalidates the session.

Each `servers.<alias>.enable` defaults to `true`. Set it to `false` to retain configuration while hiding the server from discovery, blocking connections, and invalidating existing sessions. Disabled entries do not load credentials or key files until re-enabled. Changing connection identity, host keys, credentials, or jump-host configuration invalidates existing sessions; permission changes apply on subsequent calls.

See [`config.example.json`](../config.example.json) for a complete example.
