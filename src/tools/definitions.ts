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
    name: 'hostname',
    description: 'Show the current host name.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'id',
    description: 'Show current user identity and group information.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'uname',
    description: 'Show kernel and operating system information.',
    inputSchema: baseParams({ all: { type: 'boolean' }, ...grepParam })
  },
  {
    name: 'uptime',
    description: 'Show system uptime and load averages.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'free',
    description: 'Show memory usage in megabytes.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'env',
    description: 'Show environment variables visible to the remote session.',
    inputSchema: baseParams(grepParam)
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
    description: 'Workflow automation: Executes a sequence of multiple tools in a single persistent SSH session. REQUIRES CONFIRMATION when any high-risk sub-tool final command is not whitelisted.',
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
    description: 'Single-command execution: Runs exactly one shell command segment via SSH. Rejects chaining, pipes, redirection, subshell syntax, and multiline input. REQUIRES CONFIRMATION unless the final command is whitelisted.',
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
    inputSchema: baseParams({ ...cwdParam, all: { type: 'boolean' }, ...grepParam })
  },
  {
    name: 'cat',
    description: 'File reading: Reads text file content.',
    inputSchema: baseParams({ filePath: { type: 'string' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'head',
    description: 'File preview: Reads the first N lines of a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, lines: { type: 'number' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'tail',
    description: 'Log inspection: Reads last N lines of a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, lines: { type: 'number' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'sed',
    description: 'Line range reading: Reads an inclusive line range from a text file.',
    inputSchema: baseParams({
      filePath: { type: 'string' },
      startLine: { type: 'number' },
      endLine: { type: 'number' },
      ...grepParam
    }, ['filePath', 'startLine', 'endLine'])
  },
  {
    name: 'grep',
    description: 'Pattern search: Search for a regex pattern in a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, pattern: { type: 'string' }, ignoreCase: { type: 'boolean' } }, ['filePath', 'pattern'])
  },
  {
    name: 'grep_r',
    description: 'Recursive pattern search: Search for a regex pattern across files under a directory tree.',
    inputSchema: baseParams({
      path: { type: 'string' },
      pattern: { type: 'string' },
      ignoreCase: { type: 'boolean' },
      beforeContext: { type: 'number' },
      afterContext: { type: 'number' },
      context: { type: 'number' },
      include: { type: 'array', items: { type: 'string' } },
      excludeDir: { type: 'array', items: { type: 'string' } }
    }, ['path', 'pattern'])
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
    name: 'mkdir',
    description: 'Directory creation: Creates a directory. Set parents=true for mkdir -p behavior. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ path: { type: 'string' }, parents: { type: 'boolean' }, ...confirmationParams }, ['path'])
  },
  {
    name: 'mv',
    description: 'Move or rename a file or directory. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ source: { type: 'string' }, destination: { type: 'string' }, force: { type: 'boolean' }, ...confirmationParams }, ['source', 'destination'])
  },
  {
    name: 'cp',
    description: 'Copy a file or directory. Set recursive=true for directories. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ source: { type: 'string' }, destination: { type: 'string' }, recursive: { type: 'boolean' }, preserve: { type: 'boolean' }, ...confirmationParams }, ['source', 'destination'])
  },
  {
    name: 'append_text_file',
    description: 'Append text to a file, creating it if needed. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ filePath: { type: 'string' }, content: { type: 'string' }, ...confirmationParams }, ['filePath', 'content'])
  },
  {
    name: 'replace_in_file',
    description: 'Replace literal text inside a file. Set replaceAll=false to replace only the first occurrence. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ filePath: { type: 'string' }, search: { type: 'string' }, replace: { type: 'string' }, replaceAll: { type: 'boolean' }, ...confirmationParams }, ['filePath', 'search', 'replace'])
  },
  {
    name: 'rm_safe',
    description: 'File deletion: Removes file or directory. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ path: { type: 'string' }, recursive: { type: 'boolean' }, ...confirmationParams }, ['path'])
  },
  {
    name: 'find',
    description: 'Search for files in a directory hierarchy.',
    inputSchema: baseParams({
      path: { type: 'string' },
      name: { type: 'string' },
      type: { type: 'string', enum: ['f', 'd', 'l'] },
      maxDepth: { type: 'number' },
      pathPattern: { type: 'string' },
      ...grepParam
    }, ['path'])
  },

  // --- Git ---
  {
    name: 'git_status',
    description: 'Git status: Displays repository status.',
    inputSchema: baseParams(cwdParam)
  },
  {
    name: 'git_fetch',
    description: 'Git fetch: Updates remote tracking refs. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ ...cwdParam, all: { type: 'boolean' }, prune: { type: 'boolean' }, ...confirmationParams })
  },
  {
    name: 'git_pull',
    description: 'Git update: Pulls latest changes. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ ...cwdParam, ...confirmationParams })
  },
  {
    name: 'git_switch',
    description: 'Git switch: Switches branches, or creates one with create=true. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ ...cwdParam, branch: { type: 'string' }, create: { type: 'boolean' }, startPoint: { type: 'string' }, ...confirmationParams }, ['branch'])
  },
  {
    name: 'git_branch',
    description: 'Git branch: Lists local or all branches.',
    inputSchema: baseParams({ ...cwdParam, all: { type: 'boolean' }, verbose: { type: 'boolean' } })
  },
  {
    name: 'git_log',
    description: 'Git log: Shows recent commit history.',
    inputSchema: baseParams({ ...cwdParam, maxCount: { type: 'number' }, oneline: { type: 'boolean' }, path: { type: 'string' } })
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
    name: 'docker_compose_pull',
    description: 'Pull images defined by the compose stack. REQUIRES CONFIRMATION.',
    inputSchema: baseParams({ ...cwdParam, service: { type: 'string' }, ...confirmationParams }, ['cwd'])
  },
  {
    name: 'docker_compose_ps',
    description: 'List compose services and their current state.',
    inputSchema: baseParams({ ...cwdParam, service: { type: 'string' }, ...grepParam }, ['cwd'])
  },
  {
    name: 'docker_compose_config',
    description: 'Render the fully resolved compose configuration for inspection.',
    inputSchema: baseParams({ ...cwdParam, ...grepParam }, ['cwd'])
  },
  {
    name: 'docker_compose_exec',
    description: 'Run one process inside a compose service container without shell expansion. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({
      ...cwdParam,
      service: { type: 'string' },
      command: { type: 'string' },
      args: { type: 'array', items: { type: 'string' } },
      user: { type: 'string' },
      ...confirmationParams
    }, ['cwd', 'service', 'command'])
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
    name: 'docker_exec',
    description: 'Run one process inside a running container without shell expansion. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ container: { type: 'string' }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, user: { type: 'string' }, workdir: { type: 'string' }, ...confirmationParams }, ['container', 'command'])
  },
  {
    name: 'docker_inspect',
    description: 'Inspect a container, image, volume, or network.',
    inputSchema: baseParams({ target: { type: 'string' }, format: { type: 'string' } }, ['target'])
  },
  {
    name: 'docker_stats',
    description: 'Show container resource usage.',
    inputSchema: baseParams({ container: { type: 'string' }, noStream: { type: 'boolean' } })
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
    name: 'docker_restart',
    description: 'Restart one or more running containers. REQUIRES CONFIRMATION unless the final command is whitelisted.',
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
  {
    name: 'docker_build',
    description: 'Build a docker image from a build context. Supports options such as tag, dockerfile, build args, no-cache, and fixed host networking. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({
      ...cwdParam,
      context: { type: 'string' },
      tag: { type: 'string' },
      dockerfile: { type: 'string' },
      buildArgs: { type: 'array', items: { type: 'string' } },
      noCache: { type: 'boolean' },
      networkHost: { type: 'boolean' },
      ...confirmationParams
    }, ['context'])
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
    name: 'systemctl_enable',
    description: 'Enable system service at boot. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ service: { type: 'string' }, ...confirmationParams }, ['service'])
  },
  {
    name: 'systemctl_disable',
    description: 'Disable system service at boot. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ service: { type: 'string' }, ...confirmationParams }, ['service'])
  },
  {
    name: 'ip_addr',
    description: 'Show network interface info.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'ip_route',
    description: 'Show routing table information.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'mount',
    description: 'Show mounted filesystems.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'journalctl',
    description: 'Read systemd journal logs with optional unit, since, until, priority, and follow filters.',
    inputSchema: baseParams({
      unit: { type: 'string' },
      lines: { type: 'number' },
      since: { type: 'string' },
      until: { type: 'string' },
      priority: { type: 'string' },
      follow: { type: 'boolean' },
      grep: { type: 'string' }
    })
  },
  {
    name: 'firewall_cmd',
    description: 'Structured firewall control. Supports action=list|add-port|remove-port|reload with optional zone, permanent, and listTarget. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({
      action: { type: 'string', enum: ['list', 'add-port', 'remove-port', 'reload'] },
      listTarget: { type: 'string', enum: ['ports', 'services', 'all'] },
      port: { type: 'string' },
      zone: { type: 'string' },
      permanent: { type: 'boolean' },
      ...confirmationParams
    }, ['action'])
  },
  {
    name: 'netstat',
    description: 'Monitor ports/connections. Use args as an array of individual option tokens, for example ["-t", "-u", "-l", "-n"].',
    inputSchema: baseParams({ args: { type: 'array', items: { type: 'string' } }, ...grepParam })
  },
  {
    name: 'ss',
    description: 'Socket statistics. Use args as an array of individual option tokens, for example ["-t", "-u", "-l", "-n"].',
    inputSchema: baseParams({ args: { type: 'array', items: { type: 'string' } }, ...grepParam })
  },
  {
    name: 'ping_host',
    description: 'Ping a host a fixed number of times.',
    inputSchema: baseParams({ host: { type: 'string' }, count: { type: 'number' } }, ['host'])
  },
  {
    name: 'traceroute',
    description: 'Trace the network path to a host.',
    inputSchema: baseParams({ host: { type: 'string' }, maxHops: { type: 'number' } }, ['host'])
  },
  {
    name: 'nslookup',
    description: 'Resolve hostnames using nslookup.',
    inputSchema: baseParams({ host: { type: 'string' }, server: { type: 'string' } }, ['host'])
  },
  {
    name: 'dig',
    description: 'Resolve DNS records using dig.',
    inputSchema: baseParams({ host: { type: 'string' }, recordType: { type: 'string' }, server: { type: 'string' } }, ['host'])
  },
  {
    name: 'curl_http',
    description: 'Perform an HTTP request with structured method, URL, headers, and optional body. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ method: { type: 'string' }, url: { type: 'string' }, headers: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, timeoutSeconds: { type: 'number' }, followRedirects: { type: 'boolean' }, ...confirmationParams }, ['method', 'url'])
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
    name: 'pgrep',
    description: 'Find process IDs by name or full command pattern.',
    inputSchema: baseParams({ pattern: { type: 'string' }, fullCommand: { type: 'boolean' } }, ['pattern'])
  },
  {
    name: 'kill_process',
    description: 'Send a signal to a process ID. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ pid: { type: 'number' }, signal: { type: 'string' }, ...confirmationParams }, ['pid'])
  },
  {
    name: 'df_h',
    description: 'System disk usage.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'df_inode',
    description: 'Filesystem inode usage.',
    inputSchema: baseParams(grepParam)
  },
  {
    name: 'du_sh',
    description: 'Directory size estimation.',
    inputSchema: baseParams({ path: { type: 'string' }, ...grepParam }, ['path'])
  },
  {
    name: 'which',
    description: 'Resolve the executable path of a command available on the remote host.',
    inputSchema: baseParams({ commandName: { type: 'string' }, ...grepParam }, ['commandName'])
  },
  {
    name: 'lsof',
    description: 'Inspect open files, ports, and process-file relationships.',
    inputSchema: baseParams({
      path: { type: 'string' },
      process: { type: 'string' },
      port: { type: 'number' },
      ...grepParam
    })
  },
  {
    name: 'file',
    description: 'Detect file type and encoding information.',
    inputSchema: baseParams({ path: { type: 'string' }, ...grepParam }, ['path'])
  },
  {
    name: 'stat',
    description: 'File metadata inspection: Shows size, timestamps, mode bits, and related file details.',
    inputSchema: baseParams({ filePath: { type: 'string' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'chmod',
    description: 'Change file mode bits. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ mode: { type: 'string' }, path: { type: 'string' }, recursive: { type: 'boolean' }, ...confirmationParams }, ['mode', 'path'])
  },
  {
    name: 'chown',
    description: 'Change file owner and group. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ owner: { type: 'string' }, path: { type: 'string' }, recursive: { type: 'boolean' }, ...confirmationParams }, ['owner', 'path'])
  },
  {
    name: 'ln',
    description: 'Create a link. Uses symbolic=true by default for symlinks. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ target: { type: 'string' }, linkPath: { type: 'string' }, symbolic: { type: 'boolean' }, force: { type: 'boolean' }, ...confirmationParams }, ['target', 'linkPath'])
  },
  {
    name: 'tar_create',
    description: 'Create a tar archive from one or more source paths. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ sourcePaths: { type: 'array', items: { type: 'string' } }, outputPath: { type: 'string' }, gzip: { type: 'boolean' }, ...confirmationParams }, ['sourcePaths', 'outputPath'])
  },
  {
    name: 'tar_extract',
    description: 'Extract a tar archive into a destination directory. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ archivePath: { type: 'string' }, destination: { type: 'string' }, gzip: { type: 'boolean' }, ...confirmationParams }, ['archivePath', 'destination'])
  },
  {
    name: 'zip',
    description: 'Create a zip archive from one or more source paths. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ sourcePaths: { type: 'array', items: { type: 'string' } }, outputPath: { type: 'string' }, recursive: { type: 'boolean' }, ...confirmationParams }, ['sourcePaths', 'outputPath'])
  },
  {
    name: 'unzip',
    description: 'Extract a zip archive into a destination directory. REQUIRES CONFIRMATION unless the final command is whitelisted.',
    inputSchema: baseParams({ archivePath: { type: 'string' }, destination: { type: 'string' }, overwrite: { type: 'boolean' }, ...confirmationParams }, ['archivePath', 'destination'])
  }
];
