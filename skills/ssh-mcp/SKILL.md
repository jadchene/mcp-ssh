---
name: ssh-mcp
description: Manage and automate remote infrastructure via SSH. Use this skill for server discovery, file management, Git/Docker/Systemd operations, and secure shell execution. Handles the mandatory two-step confirmation flow for all high-risk write operations.
---

# SSH MCP

Operate remote servers securely using the stateless SSH MCP service.

## Core Mandates

- **Stateless Operation**: Every command is a fresh connection. Use `execute_batch` when you need to maintain state (like `cd`) across multiple commands.
- **Single-Command Enforcement**: `execute_command` is server-enforced single-command only. Do not send shell chaining, pipes, redirection, subshell syntax, or multiline payloads. For sequential or multi-step operations, use `execute_batch` by default.
- **Confirmation Safety**: All write operations (including but not limited to `rm`, `git_pull`, `docker_restart`, `chmod`, `mkdir`, archive creation/extraction, and file mutation tools) require a two-step confirmation via `confirmationId` unless the final command is whitelisted.
- **Whitelist Awareness**: Confirmation bypass is based on the final executable command string, not only on the tool name. This applies to built-in high-risk tools and to `execute_batch` sub-commands as well, but it never overrides `readOnly` server restrictions.
- **Discovery First**: Never guess a server key or path. Always use discovery tools to verify your environment.
- **No Implicit Authorization**: Never treat one user confirmation as authorization for later write actions. Every high-risk step needs its own fresh user confirmation.
- **Compression Recovery Gate**: After any context compression event, re-read `core/AGENTS.md` and this `SKILL.md` before continuing. Do not execute pending high-risk step-2 calls until this re-read is done.

## Required Workflow

1. **Target Discovery**: Call `list_servers` to find the correct `serverAlias`.
2. **Path Mapping**: Call `list_working_directories` for that alias to find predefined semantic paths (for example `app-root`, `log-dir`).
3. **Environment Pre-check**: Use `check_dependencies` to ensure required binaries (for example `docker`, `git`, `tar`, `zip`) are installed before complex tasks.
4. **Health Check**: Call `get_system_info` if the task involves performance or capacity issues.
5. **Execution**:
   - Use specific tools (`docker_ps`, `git_status`, `mkdir`, `mv`, `cp`, `journalctl`, `docker_inspect`, `curl_http`) instead of generic `execute_command` whenever possible.
   - Do not attempt to pack multiple commands into `execute_command`; the server rejects chaining, pipes, redirection, subshell syntax, and multiline input.
   - Use `grep` parameters inside tools to filter large outputs and save context, but treat them as regex text only. Do not place shell syntax inside `grep`.
   - Use `mkdir` for directory creation instead of `execute_command "mkdir ..."`. Set `parents: true` when you need `mkdir -p` behavior.
   - Use `mv`, `cp`, `append_text_file`, and `replace_in_file` for file mutation instead of ad hoc shell editing.
   - Use `chmod`, `chown`, and `ln` for permission, ownership, and link management instead of generic shell execution.
   - Use `tar_create`, `tar_extract`, `zip`, and `unzip` for archive workflows instead of generic shell execution.
   - Use `git_fetch`, `git_switch`, `git_branch`, and `git_log` for repository workflows before falling back to shell.
   - Use `docker_exec`, `docker_inspect`, `docker_stats`, and `docker_restart` for common container workflows instead of generic shell execution.
   - Use `firewall_cmd` with structured fields such as `action`, `port`, `zone`, `permanent`, and `listTarget`. Do not assume a free-form `args` string exists.
   - Use `netstat` and `ss` with `args: string[]` where each entry is a single option token (for example `["-t", "-u", "-l", "-n"]`).
   - Use `ping_host`, `traceroute`, `nslookup`, `dig`, and `curl_http` for network diagnostics instead of ad hoc shell commands.

## Common Calling Patterns

- **Single command**:
  - `execute_command({ serverAlias, command: "docker ps" })`
- **Batch with directory state**:
  - Use `execute_batch` with `cd` followed by tool calls instead of chaining shell commands.
- **Directory creation**:
  - `mkdir({ serverAlias, path: "/data/releases", parents: true })`
- **Structured firewall list**:
  - `firewall_cmd({ serverAlias, action: "list", listTarget: "ports", permanent: true })`
- **Structured firewall add/remove port**:
  - `firewall_cmd({ serverAlias, action: "add-port", port: "8080/tcp", permanent: true })`
  - `firewall_cmd({ serverAlias, action: "remove-port", port: "8080/tcp", permanent: true })`
- **Structured firewall reload**:
  - `firewall_cmd({ serverAlias, action: "reload" })`
- **Tokenized socket inspection**:
  - `netstat({ serverAlias, args: ["-t", "-u", "-l", "-n"] })`
  - `ss({ serverAlias, args: ["-t", "-u", "-l", "-n"] })`
- **Tool-side filtering**:
  - `docker_logs({ serverAlias, container: "api", grep: "ERROR|WARN" })`
- **Structured HTTP probe**:
  - `curl_http({ serverAlias, method: "GET", url: "https://example.com/health" })`

## Two-Step Confirmation Protocol

This protocol is **MANDATORY** for all tools that modify the system (Write Actions).

1. **Step 1 (The Proposal)**: Invoke the tool with only the functional arguments.
   - The server will return `status: "pending"` and a `confirmationId`.
2. **User Verification**: Present the `actionPreview` to the user and ask for explicit permission.
   - Do not auto-continue because of previous "confirm" messages from earlier steps.
   - If multiple write actions are planned, request confirmation step-by-step, not in bulk.
3. **Step 2 (The Execution)**: Only after the user says "Yes" or "Confirm", call the **exact same tool again** with:
   - `confirmExecution: true`
   - `confirmationId: "<The ID from Step 1>"`
   - **All original functional arguments must match perfectly.**
   - If arguments changed, discard the old `confirmationId` and restart from Step 1.
   - If the pending confirmation is stale or unclear, restart from Step 1.

## Advanced Automation: execute_batch

- Use `execute_batch` when a task requires sequential steps where state must be preserved (primarily current working directory).
- **Batch Navigation**: You can use `cd` within a batch to affect subsequent commands in the same batch.
- **Batch Safety**: If a batch contains even one write action whose final command string is not whitelisted, the entire batch will trigger the two-step confirmation flow.

## Prohibited Actions

- **Never** attempt to bypass the confirmation flow.
- **Never** chain multiple destructive operations in one opaque command when they can be split and confirmed independently.
- **Never** execute commands that match patterns in the global blacklist (for example `rm -rf /`, `mkfs`).
- **Never** send raw free-form shell fragments to `firewall_cmd`, multi-word entries inside `netstat.args` or `ss.args`, or shell syntax inside `grep`.
- **Never** assume whitelist bypass applies on `readOnly` servers; `readOnly` still blocks write tools.
- **Never** try to delete system-critical directories using `rm_safe` (for example `/etc`, `/usr`, `/var`).
- If a server is marked as `readOnly`, do not attempt any write actions; inform the user instead.

## Safety Execution Pattern

1. Announce the exact next high-risk action in one line.
2. Run Step 1 and obtain `confirmationId`.
3. Ask user for confirmation with target server + path/command summary.
4. Run Step 2 only after explicit approval.
5. Immediately run read-only verification (`ll`, `docker_ps`, `cat`, and similar) and report result.

## Efficiency Tips

- **Output Truncation**: Large outputs (>30k chars) are auto-truncated. Use `tail`, `grep`, `journalctl`, or targeted inspection tools to fetch the specific data you need.
- **CWD Aliases**: Always prefer using working directory aliases (for example `cwd: "app-root"`) over absolute paths for better reliability and readability.
