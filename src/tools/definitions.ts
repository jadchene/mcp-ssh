import { Tool } from '@modelcontextprotocol/sdk/types.js';

function baseParams(properties: any = {}, required: string[] = []): Tool['inputSchema'] {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      serverAlias: { type: 'string', minLength: 1, maxLength: 128, description: 'Exact serverAlias from list_servers.' },
      ...properties
    },
    required: ['serverAlias', ...required]
  };
}

const grepParam = { grep: { type: 'string', description: 'Output regex filter; not a shell command.' } };
const cwdParam = { cwd: { type: 'string', minLength: 1, maxLength: 4096, description: 'Working directory or alias from list_working_directories; applies to this call.' } };

export const toolDefinitions: Tool[] = [
  // --- Discovery (Core) ---
  {
    name: 'list_servers',
    description: 'List configured server aliases, hosts, and descriptions without connecting.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'ping_server',
    description: 'Test SSH connectivity.',
    inputSchema: baseParams()
  },
  {
    name: 'list_working_directories',
    description: 'List configured working-directory aliases.',
    inputSchema: baseParams()
  },
  {
    name: 'check_dependencies',
    description: 'Check whether remote binaries are installed.',
    inputSchema: baseParams({ commands: { type: 'array', items: { type: 'string' } } }, ['commands'])
  },

  // --- System (Core) ---
  {
    name: 'get_system_info',
    description: 'Returns current user, system uptime, kernel, and memory.',
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
    description: 'Returns the absolute path of the current directory on remote.',
    inputSchema: baseParams(cwdParam)
  },
  {
    name: 'cd',
    description: 'Change working directory for subsequent tools in execute_batch; calls otherwise have independent sessions.',
    inputSchema: baseParams({ path: { type: 'string' } }, ['path'])
  },

  // --- Batch (Core) ---
  {
    name: 'execute_batch',
    description: 'Run tools sequentially in one SSH session. Unwhitelisted high-risk commands require confirmation.',
    inputSchema: baseParams({
      commands: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            arguments: { type: 'object' }
          },
          additionalProperties: false,
          required: ['name', 'arguments']
        }
      },
      ...cwdParam
    }, ['commands'])
  },

  // --- Shell & Basic (Requirements) ---
  {
    name: 'execute_command',
    description: 'Run one shell command. No chaining, pipes, redirection, subshells, or multiline input. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({
      command: { type: 'string' },
      ...cwdParam
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
    description: 'File transfer (Local -> Remote). Requires confirmation.',
    inputSchema: baseParams({
      localPath: { type: 'string' },
      remotePath: { type: 'string' }
    }, ['localPath', 'remotePath'])
  },
  {
    name: 'download_file',
    description: 'File transfer (Remote -> Local). Requires confirmation.',
    inputSchema: baseParams({
      remotePath: { type: 'string' },
      localPath: { type: 'string' }
    }, ['remotePath', 'localPath'])
  },
  {
    name: 'll',
    description: 'Lists files in a directory with detailed information.',
    inputSchema: baseParams({ ...cwdParam, all: { type: 'boolean' }, ...grepParam })
  },
  {
    name: 'cat',
    description: 'Reads text file content.',
    inputSchema: baseParams({ filePath: { type: 'string' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'head',
    description: 'Reads the first N lines of a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, lines: { type: 'integer', minimum: 1, maximum: 10000 }, ...grepParam }, ['filePath'])
  },
  {
    name: 'tail',
    description: 'Reads last N lines of a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, lines: { type: 'integer', minimum: 1, maximum: 10000 }, ...grepParam }, ['filePath'])
  },
  {
    name: 'sed',
    description: 'Reads an inclusive line range from a text file.',
    inputSchema: baseParams({
      filePath: { type: 'string' },
      startLine: { type: 'integer', minimum: 1, maximum: 10000000 },
      endLine: { type: 'integer', minimum: 1, maximum: 10000000 },
      ...grepParam
    }, ['filePath', 'startLine', 'endLine'])
  },
  {
    name: 'grep',
    description: 'Search for a regex pattern in a file.',
    inputSchema: baseParams({ filePath: { type: 'string' }, pattern: { type: 'string' }, ignoreCase: { type: 'boolean' } }, ['filePath', 'pattern'])
  },
  {
    name: 'grep_r',
    description: 'Search for a regex pattern across files under a directory tree.',
    inputSchema: baseParams({
      path: { type: 'string' },
      pattern: { type: 'string' },
      ignoreCase: { type: 'boolean' },
      beforeContext: { type: 'integer', minimum: 0, maximum: 10000 },
      afterContext: { type: 'integer', minimum: 0, maximum: 10000 },
      context: { type: 'integer', minimum: 0, maximum: 10000 },
      include: { type: 'array', items: { type: 'string' } },
      excludeDir: { type: 'array', items: { type: 'string' } }
    }, ['path', 'pattern'])
  },
  {
    name: 'edit_text_file',
    description: 'Completely replaces file content. Requires confirmation.',
    inputSchema: baseParams({
      filePath: { type: 'string' },
      content: { type: 'string' }
    }, ['filePath', 'content'])
  },
  {
    name: 'touch',
    description: 'Updates access time or creates empty file. Requires confirmation.',
    inputSchema: baseParams({ filePath: { type: 'string' } }, ['filePath'])
  },
  {
    name: 'mkdir',
    description: 'Creates a directory. Set parents=true for mkdir -p behavior. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ path: { type: 'string' }, parents: { type: 'boolean' } }, ['path'])
  },
  {
    name: 'mv',
    description: 'Move or rename a file or directory. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ source: { type: 'string' }, destination: { type: 'string' }, force: { type: 'boolean' } }, ['source', 'destination'])
  },
  {
    name: 'cp',
    description: 'Copy a file or directory. Set recursive=true for directories. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ source: { type: 'string' }, destination: { type: 'string' }, recursive: { type: 'boolean' }, preserve: { type: 'boolean' } }, ['source', 'destination'])
  },
  {
    name: 'append_text_file',
    description: 'Append text to a file, creating it if needed. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ filePath: { type: 'string' }, content: { type: 'string' } }, ['filePath', 'content'])
  },
  {
    name: 'replace_in_file',
    description: 'Replace literal text inside a file. Set replaceAll=false to replace only the first occurrence. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ filePath: { type: 'string' }, search: { type: 'string' }, replace: { type: 'string' }, replaceAll: { type: 'boolean' } }, ['filePath', 'search', 'replace'])
  },
  {
    name: 'rm_safe',
    description: 'Delete a path under allowedRemoteRoots. Requires confirmation.',
    inputSchema: baseParams({ path: { type: 'string' }, recursive: { type: 'boolean' } }, ['path'])
  },
  {
    name: 'find',
    description: 'Search for files in a directory hierarchy.',
    inputSchema: baseParams({
      path: { type: 'string' },
      name: { type: 'string' },
      type: { type: 'string', enum: ['f', 'd', 'l'] },
      maxDepth: { type: 'integer', minimum: 1, maximum: 1000 },
      pathPattern: { type: 'string' },
      ...grepParam
    }, ['path'])
  },

  // --- Git ---
  {
    name: 'git_status',
    description: 'Displays repository status.',
    inputSchema: baseParams(cwdParam)
  },
  {
    name: 'git_fetch',
    description: 'Updates remote tracking refs. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ ...cwdParam, all: { type: 'boolean' }, prune: { type: 'boolean' } })
  },
  {
    name: 'git_pull',
    description: 'Pulls latest changes. Requires confirmation.',
    inputSchema: baseParams({ ...cwdParam })
  },
  {
    name: 'git_switch',
    description: 'Switches branches, or creates one with create=true. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ ...cwdParam, branch: { type: 'string' }, create: { type: 'boolean' }, startPoint: { type: 'string' } }, ['branch'])
  },
  {
    name: 'git_branch',
    description: 'Lists local or all branches.',
    inputSchema: baseParams({ ...cwdParam, all: { type: 'boolean' }, verbose: { type: 'boolean' } })
  },
  {
    name: 'git_log',
    description: 'Shows recent commit history.',
    inputSchema: baseParams({ ...cwdParam, maxCount: { type: 'integer', minimum: 1, maximum: 10000 }, oneline: { type: 'boolean' }, path: { type: 'string' } })
  },

  // --- Docker & Compose (Requirements) ---
  {
    name: 'docker_compose_up',
    description: 'Deploy docker stack. Requires confirmation.',
    inputSchema: baseParams({ ...cwdParam }, ['cwd'])
  },
  {
    name: 'docker_compose_down',
    description: 'Remove docker stack. Requires confirmation.',
    inputSchema: baseParams({ ...cwdParam }, ['cwd'])
  },
  {
    name: 'docker_compose_stop',
    description: 'Stop docker stack. Requires confirmation.',
    inputSchema: baseParams({ ...cwdParam }, ['cwd'])
  },
  {
    name: 'docker_compose_logs',
    description: 'View compose logs.',
    inputSchema: baseParams({ ...cwdParam, lines: { type: 'integer', minimum: 1, maximum: 10000 }, ...grepParam }, ['cwd'])
  },
  {
    name: 'docker_compose_restart',
    description: 'Restart compose stack. Requires confirmation.',
    inputSchema: baseParams({ ...cwdParam }, ['cwd'])
  },
  {
    name: 'docker_compose_pull',
    description: 'Pull images defined by the compose stack. Requires confirmation.',
    inputSchema: baseParams({ ...cwdParam, service: { type: 'string' } }, ['cwd'])
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
    description: 'Run one process inside a compose service container without shell expansion. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({
      ...cwdParam,
      service: { type: 'string' },
      command: { type: 'string' },
      args: { type: 'array', items: { type: 'string' } },
      user: { type: 'string' }
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
    description: 'Run one process inside a running container without shell expansion. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ container: { type: 'string' }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, user: { type: 'string' }, workdir: { type: 'string' } }, ['container', 'command'])
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
    description: 'Pull an image from a registry. Requires confirmation.',
    inputSchema: baseParams({ image: { type: 'string' } }, ['image'])
  },
  {
    name: 'docker_cp',
    description: 'Copy files/folders between a container and the local filesystem. Requires confirmation.',
    inputSchema: baseParams({ source: { type: 'string' }, destination: { type: 'string' } }, ['source', 'destination'])
  },
  {
    name: 'docker_stop',
    description: 'Stop one or more running containers. Requires confirmation.',
    inputSchema: baseParams({ container: { type: 'string' } }, ['container'])
  },
  {
    name: 'docker_rm',
    description: 'Remove one or more containers. Requires confirmation.',
    inputSchema: baseParams({ container: { type: 'string' } }, ['container'])
  },
  {
    name: 'docker_start',
    description: 'Start one or more stopped containers. Requires confirmation.',
    inputSchema: baseParams({ container: { type: 'string' } }, ['container'])
  },
  {
    name: 'docker_restart',
    description: 'Restart one or more running containers. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ container: { type: 'string' } }, ['container'])
  },
  {
    name: 'docker_rmi',
    description: 'Remove one or more images. Requires confirmation.',
    inputSchema: baseParams({ image: { type: 'string' } }, ['image'])
  },
  {
    name: 'docker_commit',
    description: 'Create a new image from a container\'s changes. Requires confirmation.',
    inputSchema: baseParams({ container: { type: 'string' }, repository: { type: 'string' } }, ['container', 'repository'])
  },
  {
    name: 'docker_logs',
    description: 'Get container logs.',
    inputSchema: baseParams({ container: { type: 'string' }, lines: { type: 'integer', minimum: 1, maximum: 10000 }, ...grepParam }, ['container'])
  },
  {
    name: 'docker_load',
    description: 'Load an image from a tar archive or STDIN. Requires confirmation.',
    inputSchema: baseParams({ path: { type: 'string' } }, ['path'])
  },
  {
    name: 'docker_save',
    description: 'Save one or more images to a tar archive. Requires confirmation.',
    inputSchema: baseParams({ image: { type: 'string' }, path: { type: 'string' } }, ['image', 'path'])
  },
  {
    name: 'docker_build',
    description: 'Build a docker image from a build context. Supports options such as tag, dockerfile, build args, no-cache, and fixed host networking. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({
      ...cwdParam,
      context: { type: 'string' },
      tag: { type: 'string' },
      dockerfile: { type: 'string' },
      buildArgs: { type: 'array', items: { type: 'string' } },
      noCache: { type: 'boolean' },
      networkHost: { type: 'boolean' }
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
    description: 'Restart system service. Requires confirmation.',
    inputSchema: baseParams({ service: { type: 'string' } }, ['service'])
  },
  {
    name: 'systemctl_start',
    description: 'Start system service. Requires confirmation.',
    inputSchema: baseParams({ service: { type: 'string' } }, ['service'])
  },
  {
    name: 'systemctl_stop',
    description: 'Stop system service. Requires confirmation.',
    inputSchema: baseParams({ service: { type: 'string' } }, ['service'])
  },
  {
    name: 'systemctl_enable',
    description: 'Enable system service at boot. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ service: { type: 'string' } }, ['service'])
  },
  {
    name: 'systemctl_disable',
    description: 'Disable system service at boot. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ service: { type: 'string' } }, ['service'])
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
      lines: { type: 'integer', minimum: 1, maximum: 10000 },
      since: { type: 'string' },
      until: { type: 'string' },
      priority: { type: 'string' },
      follow: { type: 'boolean' },
      grep: { type: 'string' }
    })
  },
  {
    name: 'firewall_cmd',
    description: 'Structured firewall control. Supports action=list|add-port|remove-port|reload with optional zone, permanent, and listTarget. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({
      action: { type: 'string', enum: ['list', 'add-port', 'remove-port', 'reload'] },
      listTarget: { type: 'string', enum: ['ports', 'services', 'all'] },
      port: { type: 'string' },
      zone: { type: 'string' },
      permanent: { type: 'boolean' }
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
    inputSchema: baseParams({ host: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 100 } }, ['host'])
  },
  {
    name: 'traceroute',
    description: 'Trace the network path to a host.',
    inputSchema: baseParams({ host: { type: 'string' }, maxHops: { type: 'integer', minimum: 1, maximum: 255 } }, ['host'])
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
    description: 'Perform an HTTP request with structured method, URL, headers, and optional body. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ method: { type: 'string' }, url: { type: 'string' }, headers: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, timeoutSeconds: { type: 'integer', minimum: 1, maximum: 3600 }, followRedirects: { type: 'boolean' } }, ['method', 'url'])
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
    description: 'Send a signal to a process ID. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ pid: { type: 'integer', minimum: 1, maximum: 2147483647 }, signal: { type: 'string' } }, ['pid'])
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
      port: { type: 'integer', minimum: 1, maximum: 65535 },
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
    description: 'Shows size, timestamps, mode bits, and related file details.',
    inputSchema: baseParams({ filePath: { type: 'string' }, ...grepParam }, ['filePath'])
  },
  {
    name: 'chmod',
    description: 'Change file mode bits. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ mode: { type: 'string' }, path: { type: 'string' }, recursive: { type: 'boolean' } }, ['mode', 'path'])
  },
  {
    name: 'chown',
    description: 'Change file owner and group. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ owner: { type: 'string' }, path: { type: 'string' }, recursive: { type: 'boolean' } }, ['owner', 'path'])
  },
  {
    name: 'ln',
    description: 'Create a link. Uses symbolic=true by default for symlinks. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ target: { type: 'string' }, linkPath: { type: 'string' }, symbolic: { type: 'boolean' }, force: { type: 'boolean' } }, ['target', 'linkPath'])
  },
  {
    name: 'tar_create',
    description: 'Create a tar archive from one or more source paths. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ sourcePaths: { type: 'array', items: { type: 'string' } }, outputPath: { type: 'string' }, gzip: { type: 'boolean' } }, ['sourcePaths', 'outputPath'])
  },
  {
    name: 'tar_extract',
    description: 'Extract a tar archive into a destination directory. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ archivePath: { type: 'string' }, destination: { type: 'string' }, gzip: { type: 'boolean' } }, ['archivePath', 'destination'])
  },
  {
    name: 'zip',
    description: 'Create a zip archive from one or more source paths. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ sourcePaths: { type: 'array', items: { type: 'string' } }, outputPath: { type: 'string' }, recursive: { type: 'boolean' } }, ['sourcePaths', 'outputPath'])
  },
  {
    name: 'unzip',
    description: 'Extract a zip archive into a destination directory. Requires confirmation unless whitelisted.',
    inputSchema: baseParams({ archivePath: { type: 'string' }, destination: { type: 'string' }, overwrite: { type: 'boolean' } }, ['archivePath', 'destination'])
  }
];
