---
name: ssh-mcp
description: Use SSH MCP tools for remote inspection, file management, and server operations.
---

# SSH MCP

Operate remote servers through explicit persistent SSH and POSIX shell sessions.

## Workflow

1. Call `list_servers` when the target is unknown; disabled servers are hidden. Call `connect(serverAlias)` and retain its `sessionId`, or reuse a live session already established for the target.
2. Supply `sessionId` to every remote tool. `list_working_directories` uses `serverAlias` and does not connect.
3. Wait for each call to finish before the next call on the same session. Directory changes, variables, and loaded functions persist across individual calls and batches.
4. Use `execute_batch` to reduce round trips; children inherit the parent session and cannot override its target, manage sessions, or transfer files.
5. Call `disconnect` when finished. Expired sessions require explicit `connect`; commands are never automatically retried or reconnected.

## Constraints

- Keep structured fields free of shell syntax. In particular, pass one token per entry in `netstat.args` and `ss.args`, regex text only in `grep`, and structured action fields to `firewall_cmd`.
- When `dangerMode` is off, free-form commands must be a single shell segment, and writes require elicitation unless whitelisted. Rejection, cancellation, or unavailable elicitation stops the operation; do not supply confirmation fields or retry through another tool. Whitelisting does not override read-only mode.
- Full Access (`dangerMode=true`) overrides operation approval, command restrictions, and path/read-only policy for that server. Session and foreground-execution constraints still apply.
- Commands must finish without interactive input or background terminal output. Shell exit or operation timeout invalidates the whole session; inspect remote outcomes before deciding to retry.
- Upload/download relative remote paths use the current shell directory. Session keepalive does not prevent application idle expiry.
