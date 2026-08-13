---
name: ssh-mcp
description: Manage and automate remote infrastructure via SSH. Use this skill for server discovery, file management, Git/Docker/Systemd operations, secure shell execution, and write operations that require interactive yes/no confirmation.
---

# SSH MCP

Operate remote servers securely using the stateless SSH MCP service.

## Workflow

1. Call `list_servers` to find the correct `serverAlias`.
2. Discover configured working-directory aliases before using semantic paths.
3. Prefer a structured tool; use `execute_command` only for one command without chaining, pipes, redirection, subshells, or multiline input. Use `execute_batch` when commands must share state.
4. Check dependencies before relying on remote binaries.
5. For writes, call once and let the user answer the elicitation prompt. Stop after rejection, cancellation, or elicitation failure; never attempt a fallback execution.

## Constraints

- Whitelisting never overrides `readOnly`.
- Use `rm_safe` only within configured allowed roots and never target system-critical directories.
- Keep structured fields free of shell syntax. In particular, pass one token per entry in `netstat.args` and `ss.args`, regex text only in `grep`, and structured action fields to `firewall_cmd`.
- Narrow potentially large output with the tool's own limits or filters.
