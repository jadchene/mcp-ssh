---
name: ssh-mcp
description: Manage and automate remote infrastructure via SSH. Use this skill for server discovery, file management, Git/Docker/Systemd operations, and secure shell execution. Handles the mandatory two-step confirmation flow for all high-risk write operations.
---

# SSH MCP

Operate remote servers securely using the stateless SSH MCP service.

## Core Mandates

- **Stateless Operation**: Every command is a fresh connection. Use `execute_batch` when you need to maintain state (like `cd`) across multiple commands.
- **Single-Command Preference**: Keep `execute_command` to a single command whenever possible. For sequential or multi-step operations, use `execute_batch` by default.
- **Confirmation Safety**: All write operations (including but not limited to `rm`, `git_pull`, `docker_restart`, `chmod`) require a two-step confirmation via `confirmationId`.
- **Discovery First**: Never guess a server key or path. Always use discovery tools to verify your environment.
- **No Implicit Authorization**: Never treat one user confirmation as authorization for later write actions. Every high-risk step needs its own fresh user confirmation.
- **Compression Recovery Gate**: After any context compression event, re-read `core/AGENTS.md` and this `SKILL.md` before continuing. Do not execute pending high-risk step-2 calls until this re-read is done.

## Required Workflow

1.  **Target Discovery**: Call `list_servers` to find the correct `serverAlias`.
2.  **Path Mapping**: Call `list_working_directories` for that alias to find predefined semantic paths (e.g., `app-root`, `log-dir`).
3.  **Environment Pre-check**: Use `check_dependencies` to ensure required binaries (e.g., `docker`, `git`) are installed before complex tasks.
4.  **Health Check**: Call `get_system_info` if the task involves performance or capacity issues.
5.  **Execution**: 
    - Use specific tools (`docker_ps`, `git_status`) instead of generic `execute_command` whenever possible.
    - Avoid packing multiple commands into one `execute_command`; prefer `execute_batch` for chained steps.
    - Use `grep` parameters inside tools to filter large outputs and save context.

## Two-Step Confirmation Protocol

This protocol is **MANDATORY** for all tools that modify the system (Write Actions).

1.  **Step 1 (The Proposal)**: Invoke the tool with only the functional arguments.
    - The server will return `status: "pending"` and a `confirmationId`.
2.  **User Verification**: Present the `actionPreview` to the user and ask for explicit permission.
    - Do not auto-continue because of previous "confirm" messages from earlier steps.
    - If multiple write actions are planned, request confirmation step-by-step, not in bulk.
3.  **Step 2 (The Execution)**: Only after the user says "Yes" or "Confirm", call the **exact same tool again** with:
    - `confirmExecution: true`
    - `confirmationId: "<The ID from Step 1>"`
    - **All original functional arguments must match perfectly.**
    - If arguments changed, discard the old `confirmationId` and restart from Step 1.
    - If the pending confirmation is stale or unclear, restart from Step 1.

## Advanced Automation: execute_batch

- Use `execute_batch` when a task requires sequential steps where state must be preserved (primarily current working directory).
- **Batch Navigation**: You can use `cd` within a batch to affect subsequent commands in the same batch.
- **Batch Safety**: If a batch contains even one write action, the **entire batch** will trigger the two-step confirmation flow.

## Prohibited Actions

- **Never** attempt to bypass the confirmation flow.
- **Never** chain multiple destructive operations in one opaque command when they can be split and confirmed independently.
- **Never** execute commands that match patterns in the global blacklist (e.g., `rm -rf /`, `mkfs`).
- **Never** try to delete system-critical directories using `rm_safe` (e.g., `/etc`, `/usr`, `/var`).
- If a server is marked as `readOnly`, do not attempt any write actions; inform the user instead.

## Safety Execution Pattern

1. Announce the exact next high-risk action in one line.
2. Run Step 1 and obtain `confirmationId`.
3. Ask user for confirmation with target server + path/command summary.
4. Run Step 2 only after explicit approval.
5. Immediately run read-only verification (`ll`, `docker_ps`, `cat`, etc.) and report result.

## Efficiency Tips

- **Output Truncation**: Large outputs (>30k chars) are auto-truncated. Use `tail` or `grep` to fetch the specific data you need.
- **CWD Aliases**: Always prefer using working directory aliases (e.g., `cwd: "app-root"`) over absolute paths for better reliability and readability.
