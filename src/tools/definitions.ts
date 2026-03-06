import { Tool } from '@modelcontextprotocol/sdk/types.js';

function baseParams(properties: any = {}, required: string[] = []): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: {
      serverAlias: { type: 'string', description: 'Unique server key from config.json. Use list_servers to find available keys.' },
      ...properties
    },
    required: ['serverAlias', ...required]
  };
}

const confirmationParams = {
  confirmationId: { type: 'string', description: 'The ID returned from the first attempt of a high-risk tool.' },
  confirmExecution: { type: 'boolean', description: 'Set to true to finalize execution after receiving a confirmationId.' }
};

const grepParam = { grep: { type: 'string', description: 'Filter output using regex pattern.' } };
const cwdParam = { cwd: { type: 'string', description: 'Execution directory (supports aliases from list_working_directories).' } };

export const toolDefinitions: Tool[] = [
  // --- Discovery ---
  {
    name: 'list_servers',
    description: 'Discovery tool: List all configured SSH servers, their hosts, and descriptions.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ping_server',
    description: 'Connection test: Verifies if the SSH configuration for a specific server is valid and reachable.',
    inputSchema: baseParams()
  },
  {
    name: 'list_working_directories',
    description: 'Context tool: Retrieves path mappings for a specific server.',
    inputSchema: baseParams()
  },
  {
    name: 'check_dependencies',
    description: 'Environmental pre-check: Verifies if specific binaries exist on the remote server.',
    inputSchema: baseParams({ commands: { type: 'array', items: { type: 'string' } } }, ['commands'])
  },

  // --- System ---
  {
    name: 'get_system_info',
    description: 'System health check: Returns current user, system uptime, kernel, and memory.',
    inputSchema: baseParams()
  },
  {
    name: 'pwd',
    description: 'Current path: Returns the absolute path of the current directory on remote.',
    inputSchema: baseParams(cwdParam)
  },
  {
    name: 'cd',
    description: 'Directory navigation: Changes the working directory (effective within batch).',
    inputSchema: baseParams({ path: { type: 'string' } }, ['path'])
  },

  // --- Batch ---
  {
    name: 'execute_batch',
    description: 'Workflow automation: Executes a sequence of multiple tools in a single persistent SSH session. REQUIRES CONFIRMATION if any sub-tool is high-risk.',
    inputSchema: baseParams({
      commands: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            arguments: { type: 'object' }
          },
          required: ['name', 'arguments']
        }
      },
      ...cwdParam,
      ...confirmationParams
    }, ['commands'])
  },

  // --- Shell ---
  {
    name: 'execute_command',
    description: 'Arbitrary execution: Runs any shell command via SSH. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({
      command: { type: 'string' },
      ...cwdParam,
      ...confirmationParams
    }, ['command'])
  },

  // --- Files ---
  {
    name: 'upload_file',
    description: 'File transfer (Local -> Remote). REQUIRES CONFIRMATION.',
    inputSchema: baseParams({
      localPath: { type: 'string' },
      remotePath: { type: 'string' },
      ...confirmationParams
    }, ['localPath', 'remotePath'])
  },
  {
    name: 'download_file',
    description: 'File transfer (Remote -> Local).',
    inputSchema: baseParams({
      remotePath: { type: 'string' },
      localPath: { type: 'string' }
    }, ['remotePath', 'localPath'])
  },
  {
    name: 'll',
    description: 'Directory listing: Lists files in a directory with detailed information.',
    inputSchema: baseParams({ ...cwdParam, ...grepParam })
  },
  {
    name: 'cat',
    description: 'File reading: Reads text file content.',
    inputSchema: baseParams({ filePath: { type: 'string' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'tail',
    description: 'Log inspection: Reads last N lines of a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, lines: { type: 'number' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'edit_text_file',
    description: 'File creation/overwrite: Completely replaces file content. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({
      filePath: { type: 'string' },
      content: { type: 'string' },
      ...confirmationParams
    }, ['filePath', 'content'])
  },
  {
    name: 'append_text_file',
    description: 'File appending: Adds text to end of file. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({
      filePath: { type: 'string' },
      content: { type: 'string' },
      ...confirmationParams
    }, ['filePath', 'content'])
  },
  {
    name: 'mkdir',
    description: 'Directory creation: Creates a directory (mkdir -p). REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ path: { type: 'string' }, ...confirmationParams }, ['path'])
  },
  {
    name: 'chmod',
    description: 'Permission management: Changes file or directory permissions. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ mode: { type: 'string' }, path: { type: 'string' }, ...confirmationParams }, ['mode', 'path'])
  },
  {
    name: 'mv',
    description: 'File movement/rename: Moves or renames files or directories. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ source: { type: 'string' }, destination: { type: 'string' }, ...confirmationParams }, ['source', 'destination'])
  },
  {
    name: 'cp',
    description: 'File copy: Copies files or directories. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ 
      source: { type: 'string' }, 
      destination: { type: 'string' }, 
      recursive: { type: 'boolean' },
      ...confirmationParams 
    }, ['source', 'destination'])
  },
  {
    name: 'rm_safe',
    description: 'File deletion: Removes file or directory. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ path: { type: 'string' }, recursive: { type: 'boolean' }, ...confirmationParams }, ['path'])
  },
  {
    name: 'touch',
    description: 'Timestamp/File creation: Updates access time or creates empty file. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ filePath: { type: 'string' }, ...confirmationParams }, ['filePath'])
  },

  // --- Git ---
  {
    name: 'git_status',
    description: 'Git status: Displays repository status.',
    inputSchema: baseParams(cwdParam)
  },
  {
    name: 'git_pull',
    description: 'Git update: Pulls latest changes. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ ...cwdParam, ...confirmationParams })
  },
  {
    name: 'git_log',
    description: 'Git history: Shows commit logs.',
    inputSchema: baseParams({ ...cwdParam, count: { type: 'number' } })
  },

  // --- Docker ---
  {
    name: 'docker_compose_up',
    description: 'Deploy docker stack. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ ...cwdParam, ...confirmationParams }, ['cwd'])
  },
  {
    name: 'docker_compose_down',
    description: 'Remove docker stack. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ ...cwdParam, ...confirmationParams }, ['cwd'])
  },
  {
    name: 'docker_compose_logs',
    description: 'View compose logs.',
    inputSchema: baseParams({ ...cwdParam, lines: { type: 'number' }, ...grepParam }, ['cwd'])
  },
  {
    name: 'docker_compose_restart',
    description: 'Restart compose stack. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ ...cwdParam, ...confirmationParams }, ['cwd'])
  },
  {
    name: 'docker_ps',
    description: 'List docker containers.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'docker_logs',
    description: 'Get container logs.',
    inputSchema: baseParams({ container: { type: 'string' }, lines: { type: 'number' }, ...grepParam }, ['container'])
  },

  // --- Service & Network ---
  {
    name: 'systemctl_status',
    description: 'Check systemd service status.',
    inputSchema: baseParams({ service: { type: 'string' }, ...grepParam }, ['service'])
  },
  {
    name: 'systemctl_restart',
    description: 'Restart system service. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ service: { type: 'string' }, ...confirmationParams }, ['service'])
  },
  {
    name: 'ip_addr',
    description: 'Show network interface info.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'ping',
    description: 'Verify host accessibility.',
    inputSchema: baseParams({ host: { type: 'string' }, count: { type: 'number' } }, ['host'])
  },
  {
    name: 'netstat',
    description: 'Monitor ports/connections.',
    inputSchema: baseParams({ args: { type: 'string' }, ...grepParam })
  },

  // --- Stats ---
  {
    name: 'df_h',
    description: 'System disk usage.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'du_sh',
    description: 'Directory size estimation.',
    inputSchema: baseParams({ path: { type: 'string' }, ...grepParam }, ['path'])
  },
  {
    name: 'nvidia_smi',
    description: 'GPU utilization status.',
    inputSchema: baseParams()
  }
];
