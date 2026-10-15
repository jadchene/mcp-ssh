# MCP SSH migration guide

Use this guide when an upgrade crosses one of these version boundaries:

| Upgrade | Required changes |
| --- | --- |
| Before **1.5.0** → **1.5.0 or later** | Configure host-key fingerprints, environment variables, and file-access roots. See [Security configuration](#security-configuration-v150). |
| Before **2.0.0** → **2.0.0 or later** | Use a client with interactive confirmation support; remove the old two-step confirmation flow. See [Write confirmation](#write-confirmation-v200). |
| Before **3.0.0** → **3.x** | Refresh tool schemas and switch remote calls to explicit sessions. See [Persistent sessions](#persistent-sessions-v300). |

Apply each section whose boundary your upgrade crosses. Existing 3.x setups and new installations using the current configuration example do not need migration.

## Security configuration (v1.5.0)

The path, read-only, and approval restrictions below apply when `dangerMode` is absent or `false`. Since v2.0.3, explicitly setting `dangerMode: true` bypasses those restrictions. It does not disable SSH host-key verification.

### Host-key fingerprints

Add a verified `hostKeySha256` to every server and configured jump host. Relative private-key paths resolve from the configuration directory:

```json
{
  "servers": {
    "prod-web": {
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "./id_rsa",
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

Omit `proxyJump` for a direct connection. Set `JUMP_PASSWORD` in the service environment when using the example above. Every referenced `${VAR}` must exist; do not assume `HOME` is defined on Windows.

Obtain fingerprints from a trusted source such as the server console or administrator. This command displays advertised fingerprints but does not authenticate the host:

```bash
ssh-keyscan example.com | ssh-keygen -lf - -E sha256
```

`hostKeySha256` also accepts an array for host-key rotation. Setting `strictHostKeyChecking: false` disables identity verification; remove any temporary bypass after migration.

### Local file transfers

Merge `allowedLocalRoots` into the top-level configuration and create the listed directories:

```json
{
  "allowedLocalRoots": ["./transfer", "./artifacts"]
}
```

Relative roots resolve from the configuration directory. Upload sources and download destinations must remain within these roots; omitting the list disables local transfers. Downloads reject symbolic-link destinations.

`download_file` is a write operation: it requires interactive confirmation and is blocked by `readOnly: true`.

### Remote deletion

Add `allowedRemoteRoots` to each server entry that needs `rm_safe`:

```json
{
  "allowedRemoteRoots": ["/srv/app/releases", "/var/www/app/cache"]
}
```

`rm_safe` requires an absolute target path and checks its remote real path against these roots before deletion. Broad system roots such as `/`, `/etc`, `/usr`, `/var`, `/home`, and `/root` are rejected. Omitting the list disables `rm_safe`.

## Write confirmation (v2.0.0)

Write operations requiring approval must use a client that supports interactive confirmation. The old `confirmationId` / `confirmExecution` retry flow is no longer accepted. Accept executes the displayed operation; decline, cancel, or unavailable confirmation leaves it unexecuted.

## Persistent sessions (v3.0.0)

Refresh the client's tool schemas after upgrading. `connect` creates the SSH connection and persistent POSIX-compatible shell; remote tools now require its `sessionId` instead of `serverAlias`:

```text
connect({ serverAlias: "prod-web" }) → sessionId = S
pwd({ sessionId: S })
disconnect({ sessionId: S })
```

`list_servers` takes no target, and `list_working_directories` still uses `serverAlias`. Calls and batches within one session share directory, variables, and functions. Run same-session operations sequentially; expired IDs require a new `connect`.

Optional top-level session settings:

```json
{
  "sessionIdleTimeoutMs": 1800000,
  "maxSessions": 32
}
```

Idle expiry pauses during execution but not while waiting for approval. Command or transfer timeout invalidates the session; verify the remote result before retrying. The session limit includes connections being established.

`servers.<alias>.enable` defaults to `true`. Disabling a server hides it and invalidates its sessions without loading its credentials or key files. Connection identity, host-key, credential, or jump-host changes invalidate sessions; permission changes apply on subsequent calls.

Back up `config.json` before upgrading. After applying the relevant sections, restart the service, refresh client schemas, and verify a read-only call through `connect` → `pwd` → `disconnect`.

See [config.example.json](../config.example.json) for a complete configuration.
