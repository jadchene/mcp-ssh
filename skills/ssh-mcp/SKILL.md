---
name: ssh-mcp
description: Manage and automate remote infrastructure via SSH. Use this skill for server discovery, file management, Git/Docker/Systemd operations, and secure shell execution. Handles the mandatory two-step confirmation flow for all high-risk write operations.
---

# SSH MCP

Operate remote servers securely using the stateless SSH MCP service.

## Core Mandates

- **Stateless Operation**: Every command is a fresh connection. Use `execute_batch` only when you need shared state such as `cd`.
- **Single-Command Enforcement**: `execute_command` is server-enforced single-command only. Do not send chaining, pipes, redirection, subshell syntax, or multiline payloads.
- **Confirmation Safety**: High-risk write tools require the two-step `confirmationId` flow unless the final command is whitelisted. Whitelist bypass never overrides `readOnly`.
- **Discovery First**: Never guess a server key or semantic path. Verify with discovery tools.
- **Compression Recovery Gate**: After any context compression event, re-read `core/AGENTS.md` and this `SKILL.md` before continuing. Do not execute pending step-2 write calls until that is done.

## Required Workflow

1. Call `list_servers` to find the correct `serverAlias`.
2. Call `list_working_directories` for that alias before using semantic paths.
3. Use `check_dependencies` before tasks that rely on `docker`, `git`, `tar`, `zip`, or similar binaries.
4. Use the most specific built-in tool available before falling back to `execute_command`.
5. For write actions, run step 1, show the action preview, ask for explicit approval, then run step 2 with the same arguments.

## Tool Selection

- Prefer built-in tools for file and archive work: `mkdir`, `mv`, `cp`, `append_text_file`, `replace_in_file`, `chmod`, `chown`, `ln`, `tar_create`, `tar_extract`, `zip`, `unzip`.
- Prefer built-in tools for repo and container work: `git_fetch`, `git_switch`, `git_branch`, `git_log`, `docker_exec`, `docker_inspect`, `docker_stats`, `docker_restart`.
- Prefer built-in tools for diagnostics and networking: `journalctl`, `docker_logs`, `tail`, `ss`, `netstat`, `ping_host`, `traceroute`, `nslookup`, `dig`, `curl_http`, `firewall_cmd`.
- Use `firewall_cmd` only with structured fields such as `action`, `port`, `zone`, `permanent`, and `listTarget`.
- Use `netstat` and `ss` with `args: string[]`, one option token per entry.

## Token-Efficient Inspection

- Start narrow. Prefer targeted built-in tools over generic shell inspection.
- For logs, default to `tail`, `journalctl`, `docker_logs`, or `docker_compose_logs` with a small `lines` value first; expand only if needed.
- Use `grep` parameters to filter output early, but treat them as regex text only and never put shell syntax inside `grep`.
- Prefer aliases and focused paths over broad directory reads.
- If output may be large, first fetch the newest, smallest, or most specific slice that can answer the question.

## Common Patterns

- `execute_command({ serverAlias, command: "docker ps" })`
- `execute_batch({ serverAlias, cwd: "app-root", commands: [...] })`
- `mkdir({ serverAlias, path: "/data/releases", parents: true })`
- `firewall_cmd({ serverAlias, action: "list", listTarget: "ports", permanent: true })`
- `docker_logs({ serverAlias, container: "api", lines: 100, grep: "ERROR|WARN" })`

## Prohibited Actions

- **Never** attempt to bypass the confirmation flow.
- **Never** send free-form shell fragments to `firewall_cmd`, multi-word entries inside `netstat.args` or `ss.args`, or shell syntax inside `grep`.
- **Never** assume whitelist bypass applies on `readOnly` servers.
- **Never** try to delete system-critical directories using `rm_safe`.

## Efficiency Notes

- Large outputs are truncated automatically. Use `lines`, `grep`, `tail`, `journalctl`, or more specific inspection tools before retrying.
- Prefer working-directory aliases such as `cwd: "app-root"` over hard-coded absolute paths.
