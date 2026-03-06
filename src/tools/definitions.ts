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
  // --- Discovery (Core) ---
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

  // --- System (Core) ---
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

  // --- Batch (Core) ---
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

  // --- Shell & Basic (Requirements) ---
  {
    name: 'execute_command',
    description: 'Arbitrary execution: Runs any shell command via SSH. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({
      command: { type: 'string' },
      ...cwdParam,
      ...confirmationParams
    }, ['command'])
  },
  {
    name: 'echo',
    description: 'Print text or variables.',
    inputSchema: baseParams({ text: { type: 'string' } }, ['text'])
  },

  // --- Files (Requirements) ---
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
    name: 'grep',
    description: 'Pattern search: Search for a regex pattern in a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, pattern: { type: 'string' }, ignoreCase: { type: 'boolean' } }, ['filePath', 'pattern'])
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
    name: 'touch',
    description: 'Timestamp/File creation: Updates access time or creates empty file.',
    inputSchema: baseParams({ filePath: { type: 'string' } }, ['filePath'])
  },
  {
    name: 'rm_safe',
    description: 'File deletion: Removes file or directory. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ path: { type: 'string' }, recursive: { type: 'boolean' }, ...confirmationParams }, ['path'])
  },
  {
    name: 'find',
    description: 'Search for files in a directory hierarchy.',
    inputSchema: baseParams({ path: { type: 'string' }, name: { type: 'string' }, ...grepParam }, ['path'])
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

  // --- Docker & Compose (Requirements) ---
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
    name: 'docker_compose_stop',
    description: 'Stop docker stack. REQUIRES CONFIRMATION.',
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
    name: 'docker_images',
    description: 'List docker images.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'docker_pull',
    description: 'Pull an image from a registry. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ image: { type: 'string' }, ...confirmationParams }, ['image'])
  },
  {
    name: 'docker_cp',
    description: 'Copy files/folders between a container and the local filesystem. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ source: { type: 'string' }, destination: { type: 'string' }, ...confirmationParams }, ['source', 'destination'])
  },
  {
    name: 'docker_stop',
    description: 'Stop one or more running containers. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ container: { type: 'string' }, ...confirmationParams }, ['container'])
  },
  {
    name: 'docker_rm',
    description: 'Remove one or more containers. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ container: { type: 'string' }, ...confirmationParams }, ['container'])
  },
  {
    name: 'docker_start',
    description: 'Start one or more stopped containers. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ container: { type: 'string' }, ...confirmationParams }, ['container'])
  },
  {
    name: 'docker_rmi',
    description: 'Remove one or more images. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ image: { type: 'string' }, ...confirmationParams }, ['image'])
  },
  {
    name: 'docker_commit',
    description: 'Create a new image from a container\'s changes. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ container: { type: 'string' }, repository: { type: 'string' }, ...confirmationParams }, ['container', 'repository'])
  },
  {
    name: 'docker_logs',
    description: 'Get container logs.',
    inputSchema: baseParams({ container: { type: 'string' }, lines: { type: 'number' }, ...grepParam }, ['container'])
  },
  {
    name: 'docker_load',
    description: 'Load an image from a tar archive or STDIN. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ path: { type: 'string' }, ...confirmationParams }, ['path'])
  },
  {
    name: 'docker_save',
    description: 'Save one or more images to a tar archive. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ image: { type: 'string' }, path: { type: 'string' }, ...confirmationParams }, ['image', 'path'])
  },

  // --- Service & Network (Requirements) ---
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
    name: 'systemctl_start',
    description: 'Start system service. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ service: { type: 'string' }, ...confirmationParams }, ['service'])
  },
  {
    name: 'systemctl_stop',
    description: 'Stop system service. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ service: { type: 'string' }, ...confirmationParams }, ['service'])
  },
  {
    name: 'ip_addr',
    description: 'Show network interface info.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'firewall_cmd',
    description: 'Control the runtime/permanent firewall. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ args: { type: 'string' }, ...confirmationParams }, ['args'])
  },
  {
    name: 'netstat',
    description: 'Monitor ports/connections.',
    inputSchema: baseParams({ args: { type: 'string' }, ...grepParam })
  },

  // --- Stats & Process (Requirements) ---
  {
    name: 'nvidia_smi',
    description: 'GPU utilization status.',
    inputSchema: baseParams()
  },
  {
    name: 'ps',
    description: 'Report a snapshot of the current processes.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'df_h',
    description: 'System disk usage.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'du_sh',
    description: 'Directory size estimation.',
    inputSchema: baseParams({ path: { type: 'string' }, ...grepParam }, ['path'])
  }
];
