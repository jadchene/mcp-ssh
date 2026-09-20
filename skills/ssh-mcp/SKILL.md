---
name: ssh-mcp
description: Use SSH MCP tools for remote inspection, file management, and confirmed operations.
---

# SSH MCP

Operate remote servers securely using the stateless SSH MCP service.

## Workflow

1. Reuse a `serverAlias` confirmed in the current session; call `list_servers` when it is unknown or stale.
2. Discover working-directory aliases only when the required mapping is unknown.
3. Prefer a structured tool; use `execute_command` only for one command without chaining, pipes, redirection, subshells, or multiline input. Use `execute_batch` when commands must share state.
4. Check dependencies when availability is unknown and affects tool selection, or after a missing-command error.
5. For writes, call once and let the user answer the elicitation prompt. Stop after rejection, cancellation, or elicitation failure; never attempt a fallback execution.

## Constraints

- Whitelisting never overrides `readOnly`.
- Use `rm_safe` only within configured allowed roots and never target system-critical directories.
- Keep structured fields free of shell syntax. In particular, pass one token per entry in `netstat.args` and `ss.args`, regex text only in `grep`, and structured action fields to `firewall_cmd`.
- Narrow potentially large output with the tool's own limits or filters.
