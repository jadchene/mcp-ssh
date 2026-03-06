import { SSHClient } from '../ssh.js';
import { ConfigManager, ServerConfig } from '../config.js';
import { confirmationManager } from '../core/confirmation.js';

const WRITE_TOOLS = [
  'execute_command',
  'upload_file',
  'edit_text_file',
  'append_text_file',
  'mkdir',
  'chmod',
  'mv',
  'cp',
  'rm_safe',
  'touch',
  'git_pull',
  'docker_compose_up',
  'docker_compose_down',
  'docker_compose_restart',
  'systemctl_restart'
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

  private checkBlacklist(command: string) {
    const userBlacklist = this.configManager.getGlobalBlacklist();
    const combined = [...DEFAULT_BLACKLIST, ...userBlacklist.map(p => new RegExp(p, 'i'))];
    for (const pattern of combined) {
      if (pattern.test(command)) {
        throw new Error(`Security Violation: Prohibited pattern: ${pattern.toString()}`);
      }
    }
  }

  private getCommandForTool(name: string, params: any): string {
    switch (name) {
      case 'get_system_info': return 'echo "USER: $(whoami)"; echo "UPTIME: $(uptime)"; echo "KERNEL: $(uname -a)"; echo "MEMORY:"; free -m';
      case 'check_dependencies': return `for cmd in ${params.commands.join(' ')}; do which $cmd || echo "$cmd not found"; done`;
      case 'pwd': return 'pwd';
      case 'cd': return `cd ${params.path}`;
      case 'll': return 'ls -l';
      case 'cat': return `cat ${params.filePath}`;
      case 'tail': return `tail -n ${params.lines || 50} ${params.filePath}`;
      case 'mkdir': return `mkdir -p ${params.path}`;
      case 'chmod': return `chmod ${params.mode} ${params.path}`;
      case 'mv': return `mv -f ${params.source} ${params.destination}`;
      case 'cp': return `cp -f ${params.recursive ? '-r' : ''} ${params.source} ${params.destination}`;
      case 'rm_safe':
        const restricted = ['/', '/etc', '/usr', '/bin', '/var', '/root', '/home'];
        if (restricted.includes(params.path.trim())) throw new Error(`RM_SAFE: Denied for restricted directory.`);
        return `rm ${params.recursive ? '-rf' : '-f'} ${params.path}`;
      case 'touch': return `touch ${params.filePath}`;
      case 'append_text_file':
        const appB64 = Buffer.from(params.content).toString('base64');
        return `echo "${appB64}" | base64 -d >> ${params.filePath}`;
      case 'edit_text_file':
        const edB64 = Buffer.from(params.content).toString('base64');
        return `echo "${edB64}" | base64 -d > ${params.filePath}`;
      case 'git_status': return 'git status';
      case 'git_pull': return 'git pull --no-edit';
      case 'git_log': return `git log -n ${params.count || 10} --oneline`;
      case 'execute_command': return params.command;
      case 'docker_compose_up': return 'docker-compose up -d';
      case 'docker_compose_down': return 'docker-compose down --remove-orphans';
      case 'docker_compose_logs': return `docker-compose logs -n ${params.lines || 100}`;
      case 'docker_compose_restart': return 'docker-compose restart';
      case 'docker_ps': return 'docker ps';
      case 'docker_logs': return `docker logs -n ${params.lines || 100} ${params.container}`;
      case 'systemctl_status': return `systemctl status ${params.service}`;
      case 'systemctl_restart': return `systemctl restart ${params.service}`;
      case 'ip_addr': return 'ip addr';
      case 'ping': return `ping -c ${params.count || 4} ${params.host}`;
      case 'netstat': return `netstat ${params.args || '-tuln'}`;
      case 'df_h': return 'df -h';
      case 'du_sh': return `du -sh ${params.path}`;
      case 'nvidia_smi': return 'nvidia-smi';
      default: return '';
    }
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

    // --- Confirmation Logic ---
    const isWriteAction = WRITE_TOOLS.includes(name) || (name === 'execute_batch' && params.commands?.some((c: any) => WRITE_TOOLS.includes(c.name)));
    
    if (isWriteAction) {
      if (srv.readOnly) throw new Error(`Server '${serverAlias}' is read-only.`);
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

      for (const cmd of commands) {
        if (cmd.name === 'execute_command') this.checkBlacklist(cmd.arguments.command);
      }

      return await SSHClient.runSession(srv, async (conn) => {
        for (const cmd of commands) {
          if (cmd.name === 'cd') {
            currentBatchCwd = cmd.arguments.path;
            results.push(`Directory changed to: ${currentBatchCwd}`);
            continue;
          }
          let cmdStr = this.getCommandForTool(cmd.name, cmd.arguments);
          if (!cmdStr) { results.push(`[${cmd.name}] Error: Not supported in batch.`); continue; }
          if (cmd.arguments.grep) cmdStr += ` | grep -E "${cmd.arguments.grep.replace(/"/g, '\\"')}"`;
          const res = await SSHClient.executeOnConn(conn, cmdStr, currentBatchCwd, timeout);
          results.push(`[${cmd.name}]\n${res.stdout}${res.stderr ? '\n[STDERR]\n' + res.stderr : ''}`);
        }
        return results.join('\n\n---\n\n');
      });
    }

    if (name === 'execute_command') this.checkBlacklist(params.command);

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

    let commandToRun = this.getCommandForTool(name, params);
    if (commandToRun) {
      if (params.grep) commandToRun += ` | grep -E "${params.grep.replace(/"/g, '\\"')}"`;
      const res = await SSHClient.executeCommand(srv, commandToRun, cwd, timeout);
      let out = res.stdout;
      if (res.stderr) out += `\n[STDERR]\n${res.stderr}`;
      if (res.code !== 0 && res.code !== null && !params.grep) out += `\n[Exited with code ${res.code}]`;
      return out || 'Success (no output)';
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}
