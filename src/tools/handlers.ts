import { SSHClient } from '../ssh.js';
import { ConfigManager, ServerConfig } from '../config.js';
import { confirmationManager } from '../core/confirmation.js';

const WRITE_TOOLS = [
  'execute_command',
  'upload_file',
  'edit_text_file',
  'rm_safe',
  'git_pull',
  'docker_compose_up',
  'docker_compose_down',
  'docker_compose_stop',
  'docker_compose_restart',
  'docker_pull',
  'docker_cp',
  'docker_stop',
  'docker_rm',
  'docker_start',
  'docker_rmi',
  'docker_commit',
  'docker_load',
  'docker_save',
  'systemctl_restart',
  'systemctl_start',
  'systemctl_stop',
  'firewall_cmd'
];

const DEFAULT_BLACKLIST = [
  /rm\s+-(rf|fr|r|f)\s+\//i,
  /rm\s+-(rf|fr|r|f)\s+\*/i,
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev\/sd[a-z]/i,
  /shutdown/i,
  /reboot/i
];

export class ToolHandlers {
  constructor(private configManager: ConfigManager) {}

  /**
   * Build regex list from config patterns using case-insensitive matching to keep
   * behavior aligned with the existing blacklist implementation.
   */
  private compileUserPatterns(patterns: string[]): RegExp[] {
    return patterns.map((pattern) => new RegExp(pattern, 'i'));
  }

  private getServerConfig(alias: string): ServerConfig {
    const config = this.configManager.getServerConfig(alias);
    if (!config) {
      throw new Error(`Server alias '${alias}' not found in configuration.`);
    }
    return config;
  }

  private resolveCwd(srv: ServerConfig, cwd?: string): string | undefined {
    if (!cwd) return undefined;
    if (srv.workingDirectories && srv.workingDirectories[cwd]) {
      return srv.workingDirectories[cwd].path;
    }
    return cwd;
  }

  /**
   * Escape arbitrary text as a single POSIX shell argument to avoid command
   * injection through built-in tool parameters.
   */
  private shellEscape(value: string): string {
    return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
  }

  /**
   * execute_command is intentionally limited to one command segment. Chaining,
   * pipes, subshells, redirection, and multiline payloads must use safer tools
   * or execute_batch instead.
   */
  private validateSingleCommand(command: string) {
    this.ensureNoShellControl(command, 'execute_command only supports a single command without shell chaining, pipes, redirection, subshells, or multiline input.');
  }

  /**
   * Validate free-form option fragments that intentionally allow spaces but must
   * never introduce shell control syntax.
   */
  private validateShellFragment(value: string, fieldName: string) {
    this.ensureNoShellControl(value, `${fieldName} contains forbidden shell control characters.`);
  }

  /**
   * Validate one shell token that is expected to remain a single argument.
   */
  private validateShellToken(value: string, fieldName: string) {
    if (/\s/.test(value)) {
      throw new Error(`${fieldName} must be a single token without spaces.`);
    }
    this.validateShellFragment(value, fieldName);
  }

  private ensureNoShellControl(value: string, errorMessage: string) {
    const forbiddenOperators = [/&&/, /\|\|/, /;/, /\|/, /\$\(/, /`/, />/, /</, /\r|\n/];
    for (const pattern of forbiddenOperators) {
      if (pattern.test(value)) {
        throw new Error(errorMessage);
      }
    }
  }

  private checkBlacklist(command: string) {
    const userBlacklist = this.compileUserPatterns(this.configManager.getGlobalBlacklist());
    const normalizedCommand = this.stripQuotedLiterals(command);

    for (const pattern of DEFAULT_BLACKLIST) {
      if (pattern.test(normalizedCommand)) {
        throw new Error(`Security Violation: Prohibited pattern: ${pattern.toString()}`);
      }
    }

    for (const pattern of userBlacklist) {
      if (pattern.test(command)) {
        throw new Error(`Security Violation: Prohibited pattern: ${pattern.toString()}`);
      }
    }
  }

  /**
   * Remove quoted literal payloads before evaluating built-in default blacklist
   * rules so escaped user arguments do not look like executable shell syntax.
   */
  private stripQuotedLiterals(command: string): string {
    return command
      .replace(/'[^']*'/g, "''")
      .replace(/"([^"\\]|\\.)*"/g, '""');
  }

  /**
   * Whitelisted execute_command payloads can bypass the confirmation flow, but
   * they still must pass blacklist validation first.
   */
  private isCommandWhitelisted(command: string): boolean {
    const userWhitelist = this.compileUserPatterns(this.configManager.getGlobalWhitelist());
    return userWhitelist.some((pattern) => pattern.test(command));
  }

  /**
   * Resolve the exact shell command string that will be executed for command-based
   * tools so that security rules operate on the same final text.
   */
  private getExecutableCommand(name: string, params: any): string {
    let command = this.getCommandForTool(name, params);
    if (!command) return '';
    if (params.grep) {
      this.validateShellFragment(params.grep, 'grep');
      command += ` | grep -E ${this.shellEscape(params.grep)}`;
    }
    return command;
  }

  /**
   * Determine whether the current tool invocation still needs confirmation after
   * command whitelist rules are applied to the final executable command.
   */
  private requiresConfirmation(name: string, params: any): boolean {
    if (name !== 'execute_batch') {
      if (!WRITE_TOOLS.includes(name)) return false;
      const command = this.getExecutableCommand(name, params);
      return command ? !this.isCommandWhitelisted(command) : true;
    }

    return params.commands?.some((cmd: any) => {
      if (!WRITE_TOOLS.includes(cmd.name)) return false;
      const command = this.getExecutableCommand(cmd.name, cmd.arguments);
      return command ? !this.isCommandWhitelisted(command) : true;
    }) ?? false;
  }

  /**
   * Determine whether a tool invocation is fundamentally a write action,
   * regardless of whether whitelist rules later skip manual confirmation.
   */
  private isWriteToolCall(name: string, params: any): boolean {
    if (name !== 'execute_batch') {
      return WRITE_TOOLS.includes(name);
    }

    return params.commands?.some((cmd: any) => WRITE_TOOLS.includes(cmd.name)) ?? false;
  }

  /**
   * Apply blacklist validation to every command-bearing tool invocation before
   * confirmation and execution.
   */
  private validateToolCommand(name: string, params: any) {
    if (name === 'execute_command') {
      this.validateSingleCommand(params.command);
    }
    if (name === 'netstat' && Array.isArray(params.args)) {
      for (const [index, arg] of params.args.entries()) {
        this.validateShellToken(arg, `netstat.args[${index}]`);
      }
    }
    const command = this.getExecutableCommand(name, params);
    if (command) {
      this.checkBlacklist(command);
    }
  }

  private getCommandForTool(name: string, params: any): string {
    switch (name) {
      case 'get_system_info': return 'echo "USER: $(whoami)"; echo "UPTIME: $(uptime)"; echo "KERNEL: $(uname -a)"; echo "MEMORY:"; free -m';
      case 'check_dependencies': return `for cmd in ${params.commands.map((cmd: string) => this.shellEscape(cmd)).join(' ')}; do which "$cmd" || echo "$cmd not found"; done`;
      case 'pwd': return 'pwd';
      case 'cd': return `cd ${this.shellEscape(params.path)}`;
      case 'll': return 'ls -l';
      case 'cat': return `cat ${this.shellEscape(params.filePath)}`;
      case 'tail': return `tail -n ${params.lines || 50} ${this.shellEscape(params.filePath)}`;
      case 'grep': return `grep ${params.ignoreCase ? '-inE' : '-nE'} ${this.shellEscape(params.pattern)} ${this.shellEscape(params.filePath)}`;
      case 'edit_text_file':
        const edB64 = Buffer.from(params.content).toString('base64');
        return `printf '%s' ${this.shellEscape(edB64)} | base64 -d > ${this.shellEscape(params.filePath)}`;
      case 'touch': return `touch ${this.shellEscape(params.filePath)}`;
      case 'rm_safe':
        const restricted = ['/', '/etc', '/usr', '/bin', '/var', '/root', '/home'];
        if (restricted.includes(params.path.trim())) throw new Error(`RM_SAFE: Denied for restricted directory.`);
        return `rm ${params.recursive ? '-rf' : '-f'} ${this.shellEscape(params.path)}`;
      case 'echo': return `echo ${this.shellEscape(params.text)}`;
      case 'find': return `find ${this.shellEscape(params.path)} -name ${this.shellEscape(params.name)}`;
      case 'git_status': return 'git status';
      case 'git_pull': return 'git pull --no-edit';
      case 'execute_command': return params.command;
      case 'docker_compose_up': return 'docker-compose up -d';
      case 'docker_compose_down': return 'docker-compose down --remove-orphans';
      case 'docker_compose_stop': return 'docker-compose stop';
      case 'docker_compose_logs': return `docker-compose logs -n ${params.lines || 100}`;
      case 'docker_compose_restart': return 'docker-compose restart';
      case 'docker_ps': return 'docker ps';
      case 'docker_images': return 'docker images';
      case 'docker_pull': return `docker pull ${this.shellEscape(params.image)}`;
      case 'docker_cp': return `docker cp ${this.shellEscape(params.source)} ${this.shellEscape(params.destination)}`;
      case 'docker_stop': return `docker stop ${this.shellEscape(params.container)}`;
      case 'docker_rm': return `docker rm ${this.shellEscape(params.container)}`;
      case 'docker_start': return `docker start ${this.shellEscape(params.container)}`;
      case 'docker_rmi': return `docker rmi ${this.shellEscape(params.image)}`;
      case 'docker_commit': return `docker commit ${this.shellEscape(params.container)} ${this.shellEscape(params.repository)}`;
      case 'docker_logs': return `docker logs -n ${params.lines || 100} ${this.shellEscape(params.container)}`;
      case 'docker_load': return `docker load -i ${this.shellEscape(params.path)}`;
      case 'docker_save': return `docker save -o ${this.shellEscape(params.path)} ${this.shellEscape(params.image)}`;
      case 'systemctl_status': return `systemctl status ${this.shellEscape(params.service)}`;
      case 'systemctl_restart': return `systemctl restart ${this.shellEscape(params.service)}`;
      case 'systemctl_start': return `systemctl start ${this.shellEscape(params.service)}`;
      case 'systemctl_stop': return `systemctl stop ${this.shellEscape(params.service)}`;
      case 'ip_addr': return 'ip addr';
      case 'firewall_cmd':
        return this.buildFirewallCommand(params);
      case 'netstat':
        return `netstat ${(params.args && params.args.length > 0) ? params.args.map((arg: string, index: number) => {
          this.validateShellToken(arg, `netstat.args[${index}]`);
          return arg;
        }).join(' ') : '-tuln'}`;
      case 'df_h': return 'df -h';
      case 'du_sh': return `du -sh ${this.shellEscape(params.path)}`;
      case 'nvidia_smi': return 'nvidia-smi';
      case 'ps': return 'ps aux';
      default: return '';
    }
  }

  /**
   * Build firewall-cmd from structured inputs so the service controls the final
   * command shape instead of accepting a free-form shell fragment.
   */
  private buildFirewallCommand(params: any): string {
    const parts = ['firewall-cmd'];

    if (params.zone) {
      this.validateShellToken(params.zone, 'firewall_cmd.zone');
      parts.push(`--zone=${params.zone}`);
    }

    if (params.permanent) {
      parts.push('--permanent');
    }

    switch (params.action) {
      case 'reload':
        parts.push('--reload');
        break;
      case 'list': {
        const listTarget = params.listTarget || 'ports';
        const targetMap: Record<string, string> = {
          ports: '--list-ports',
          services: '--list-services',
          all: '--list-all'
        };
        const targetFlag = targetMap[listTarget];
        if (!targetFlag) {
          throw new Error(`Unsupported firewall_cmd.listTarget: ${listTarget}`);
        }
        parts.push(targetFlag);
        break;
      }
      case 'add-port':
      case 'remove-port': {
        if (!params.port) {
          throw new Error(`firewall_cmd action '${params.action}' requires 'port'.`);
        }
        this.validateShellToken(params.port, 'firewall_cmd.port');
        const flag = params.action === 'add-port' ? '--add-port' : '--remove-port';
        parts.push(`${flag}=${params.port}`);
        break;
      }
      default:
        throw new Error(`Unsupported firewall_cmd action: ${params.action}`);
    }

    return parts.join(' ');
  }

  public async handleTool(name: string, args: any): Promise<any> {
    if (name === 'list_servers') {
      const servers = this.configManager.getAllServers();
      if (Object.keys(servers).length === 0) return "No servers configured.";
      return "Available SSH Servers:\n" + Object.entries(servers)
        .map(([alias, info]) => `- [${alias}] ${info.host}${info.desc ? ' (' + info.desc + ')' : ''}`)
        .join('\n');
    }

    const { serverAlias, confirmationId, confirmExecution, ...params } = args;
    const srv = this.getServerConfig(serverAlias);
    const timeout = this.configManager.getDefaultTimeout();

    if (name === 'ping_server') {
      try {
        await SSHClient.runSession(srv, async () => true);
        return `Successfully connected to server '${serverAlias}' (${srv.host}). Configuration is valid.`;
      } catch (err: any) {
        return `Connection failed for server '${serverAlias}': ${err.message}`;
      }
    }

    this.validateToolCommand(name, params);

    if (name === 'execute_batch') {
      for (const cmd of params.commands || []) {
        this.validateToolCommand(cmd.name, cmd.arguments);
      }
    }

    // --- Confirmation Logic ---
    const isWriteToolCall = this.isWriteToolCall(name, params);
    const isWriteAction = this.requiresConfirmation(name, params);

    if (isWriteToolCall && srv.readOnly) {
      throw new Error(`Server '${serverAlias}' is read-only.`);
    }

    if (isWriteAction) {
      if (confirmationId && confirmExecution === true) {
        const isValid = confirmationManager.validateAndPop(confirmationId, name, serverAlias, args);
        if (!isValid) throw new Error("Invalid or expired confirmationId. Please try again.");
      } else {
        const newId = confirmationManager.createPending(name, serverAlias, args);
        return {
          status: "pending",
          confirmationId: newId,
          message: `Manual confirmation required for high-risk tool: ${name}. Call this tool again with confirmExecution=true and the provided confirmationId.`,
          actionPreview: { tool: name, server: serverAlias, args: params }
        };
      }
    }

    // --- Execution Logic ---
    if (name === 'execute_batch') {
      const commands: any[] = params.commands;
      let results: string[] = [];
      let currentBatchCwd = this.resolveCwd(srv, params.cwd);

      return await SSHClient.runSession(srv, async (conn) => {
        for (const cmd of commands) {
          if (cmd.name === 'cd') {
            currentBatchCwd = cmd.arguments.path;
            results.push(`Directory changed to: ${currentBatchCwd}`);
            continue;
          }
          let cmdStr = this.getExecutableCommand(cmd.name, cmd.arguments);
          if (!cmdStr) { results.push(`[${cmd.name}] Error: Not supported in batch.`); continue; }
          const res = await SSHClient.executeOnConn(conn, cmdStr, currentBatchCwd, timeout);
          results.push(`[${cmd.name}]\n${res.stdout}${res.stderr ? '\n[STDERR]\n' + res.stderr : ''}`);
        }
        return results.join('\n\n---\n\n');
      });
    }

    const cwd = this.resolveCwd(srv, params.cwd);

    if (name === 'list_working_directories') {
      if (!srv.workingDirectories || Object.keys(srv.workingDirectories).length === 0) {
        return `No directory mappings for '${serverAlias}'.`;
      }
      return `Working Directories for [${serverAlias}]:\n` + Object.entries(srv.workingDirectories)
        .map(([alias, info]) => `  - ${alias}: ${info.path} (${info.desc})`)
        .join('\n');
    }

    if (name === 'upload_file') {
      await SSHClient.uploadFile(srv, params.localPath, params.remotePath);
      return `Successfully uploaded ${params.localPath} to ${params.remotePath}`;
    }
    if (name === 'download_file') {
      await SSHClient.downloadFile(srv, params.remotePath, params.localPath);
      return `Successfully downloaded ${params.remotePath} to ${params.localPath}`;
    }

    let commandToRun = this.getExecutableCommand(name, params);
    if (commandToRun) {
      const res = await SSHClient.executeCommand(srv, commandToRun, cwd, timeout);
      let out = res.stdout;
      if (res.stderr) out += `\n[STDERR]\n${res.stderr}`;
      if (res.code !== 0 && res.code !== null && !params.grep) out += `\n[Exited with code ${res.code}]`;
      return out || 'Success (no output)';
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}
