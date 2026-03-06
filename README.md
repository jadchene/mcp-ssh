English | [简体中文](./README_zh.md)

# 🚀 MCP SSH Service

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![MCP Ready](https://img.shields.io/badge/MCP-Ready-blue)](https://modelcontextprotocol.io/)

A **production-grade** Model Context Protocol (MCP) server designed for secure, stateless SSH automation. This service empowers AI agents to manage remote infrastructure with **human-in-the-loop** safety and **semantic environment awareness**.

---

## 🌟 Key Pillars

### 🔒 Uncompromising Security
*   **Two-Step Confirmation**: High-risk operations (writes, deletes, restarts) return a \confirmationId\. Nothing happens until a human approves the specific transaction.
*   **Command Blacklist**: Real-time regex interception for catastrophic commands like \m -rf /\ or \mkfs\.
*   **Server-Level Read-Only**: Lock specific servers to a non-destructive mode at the configuration level.
*   **Restricted File Deletion**: Hardcoded prevention of accidental deletion of system-critical paths like \/etc\ or \/usr\.

### 🧠 AI-Native Design
*   **Semantic Infrastructure Discovery**: AI can list servers and understand their purposes via natural language descriptions.
*   **Working Directory Aliases**: Map complex paths (e.g., \/var/www/my-app/v1/prod\) to simple aliases like \pp-root\ with descriptive metadata.
*   **Contextual Pre-checks**: Built-in tools to verify dependencies (Docker, Git) before execution.

### 🛠️ Enterprise DevOps Integration
*   **Stateless Connections**: Lazy-loaded SSH sessions that close immediately after use—no lingering idle processes.
*   **Advanced Networking**: Native support for **ProxyJump (Jump Hosts)** and private keys with **passphrases**, and customizable timeouts.
*   **Rich Toolset**: 45+ integrated tools covering Git, Docker, Docker Compose, Systemd, and Network diagnostics.

---

## 🚀 Quick Start

### Installation

\\\ash
# Install globally via npm
npm install -g @jadchene/mcp-ssh-service

# Start the server with a config file
mcp-ssh-service --config ./config.json
\\\

### Source Setup (Development)

\\\ash
git clone https://github.com/jadchene/mcp-ssh.git
cd mcp-ssh
npm install
npm run build
node dist/index.js --config ./config.json
\\\

---

## ⚙️ Advanced Configuration

The service leverages an external \config.json\. It supports **environment variable substitution** and **hot-reloading**.

\\\json
{
  "logDir": "./logs",
  "defaultTimeout": 60000,
  "commandBlacklist": ["^apt-get upgrade", "curl.*\\|.*sh"],
  "servers": {
    "prod-web": {
      "desc": "Primary API Cluster",
      "host": "10.0.0.5",
      "username": "deploy",
      "privateKeyPath": "~/.ssh/id_rsa",
      "passphrase": "${SSH_KEY_PWD}",
      "workingDirectories": {
        "logs": { "path": "/var/log/nginx", "desc": "Nginx access logs" }
      },
      "proxyJump": {
        "host": "bastion.example.com",
        "username": "jumpuser"
      }
    }
  }
}
\\\

---

## 🛠️ Integrated Toolset (45 Tools)

### 📂 Discovery & Context
*   \list_servers\: Discovery available hosts.
*   \ping_server\: Test SSH connection & credentials.
*   \list_working_directories\: Get semantic path mappings.
*   \get_system_info\: CPU, Memory, and System Uptime.
*   \check_dependencies\: Verify remote binaries.

### 💻 Shell & Files
*   \execute_command\*, \execute_batch\*: Run single or sequenced shell commands.
*   \ll\, \cat\, \	ail\, \grep\, \pwd\, \cd\: Browse and search remote files.
*   \upload_file\*, \download_file\: Transfer data.
*   \mkdir\*, \mv\*, \cp\*, \chmod\*, \m_safe\*, \	ouch\*: File system management.

### 🐳 DevOps & Services
*   \docker_ps\, \docker_logs\, \docker_compose_up\*, \docker_compose_restart\*: Container orchestration.
*   \systemctl_status\, \systemctl_restart\*: System service control.
*   \git_status\, \git_pull\*: Version control.
*   \ip_addr\, \ping\, \
etstat\, \df_h\, \
vidia_smi\: Diagnostics.

*\* High-risk: Requires \confirmationId\ and \confirmExecution: true\.*

---

## 🔐 The Confirmation Workflow

1.  **Request**: AI calls \m_safe({ path: '/tmp/old' })\.
2.  **Intercept**: Server returns \status: "pending"\ with a \confirmationId\.
3.  **Human Input**: You review the action in your chat client and approve.
4.  **Execution**: AI calls \m_safe\ again with the \confirmationId\ and \confirmExecution: true\.
5.  **Verify**: Server ensures parameters match exactly and executes the SSH command.

---

## 📄 License
Released under the [MIT License](./LICENSE).
