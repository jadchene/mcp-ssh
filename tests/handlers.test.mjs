import test from 'node:test';
import assert from 'node:assert/strict';

import { ToolHandlers } from '../dist/tools/handlers.js';
import { SSHClient } from '../dist/ssh.js';

/**
 * Build a lightweight config manager stub for ToolHandlers tests.
 */
function createConfigManager({
  blacklist = [],
  whitelist = [],
  readOnly = false
} = {}) {
  return {
    getServerConfig(alias) {
      if (alias !== 'test-server') {
        return undefined;
      }

      return {
        host: '127.0.0.1',
        port: 22,
        username: 'tester',
        readOnly
      };
    },
    getGlobalBlacklist() {
      return blacklist;
    },
    getGlobalWhitelist() {
      return whitelist;
    },
    getDefaultTimeout() {
      return 1000;
    }
  };
}

/**
 * Temporarily replace SSHClient static methods for a single test.
 */
async function withMockedSsh(overrides, callback) {
  const originals = new Map();

  for (const [name, implementation] of Object.entries(overrides)) {
    originals.set(name, SSHClient[name]);
    SSHClient[name] = implementation;
  }

  try {
    return await callback();
  } finally {
    for (const [name, implementation] of originals.entries()) {
      SSHClient[name] = implementation;
    }
  }
}

test('execute_command should bypass confirmation when command matches whitelist', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ['^docker ps$'] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'container-list',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('execute_command', {
      serverAlias: 'test-server',
      command: 'docker ps'
    })
  );

  assert.equal(result, 'container-list');
  assert.equal(capturedCommand, 'docker ps');
});

test('execute_command should reject chained shell segments', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  await assert.rejects(
    () =>
      handlers.handleTool('execute_command', {
        serverAlias: 'test-server',
        command: 'docker ps && reboot'
      }),
    /single command/
  );
});

test('blacklist should still reject a command even when whitelist also matches', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ['.*'] })
  );

  await assert.rejects(
    () =>
      handlers.handleTool('execute_command', {
        serverAlias: 'test-server',
        command: 'rm -rf /'
      }),
    /Security Violation/
  );
});

test('execute_batch should still require confirmation when any high-risk sub-command is not whitelisted', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ['^docker ps$'] })
  );

  const result = await handlers.handleTool('execute_batch', {
    serverAlias: 'test-server',
    commands: [
      {
        name: 'execute_command',
        arguments: { command: 'docker ps' }
      },
      {
        name: 'execute_command',
        arguments: { command: 'systemctl restart nginx' }
      }
    ]
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.actionPreview.tool, 'execute_batch');
});

test('execute_batch should execute directly when every high-risk sub-command is whitelisted', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ['^docker ps$'] })
  );

  const executedCommands = [];

  const result = await withMockedSsh({
    async runSession(_serverConfig, action) {
      return action({});
    },
    async executeOnConn(_conn, command) {
      executedCommands.push(command);
      return {
        stdout: `ran:${command}`,
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('execute_batch', {
      serverAlias: 'test-server',
      commands: [
        {
          name: 'execute_command',
          arguments: { command: 'docker ps' }
        }
      ]
    })
  );

  assert.match(result, /\[execute_command\]\nran:docker ps/);
  assert.deepEqual(executedCommands, ['docker ps']);
});

test('built-in write tool should bypass confirmation when its generated command matches whitelist', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ['^docker-compose restart$'] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'compose-restarted',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_compose_restart', {
      serverAlias: 'test-server',
      cwd: '/srv/app'
    })
  );

  assert.equal(result, 'compose-restarted');
  assert.equal(capturedCommand, 'docker-compose restart');
});

test('built-in write tool should shell-escape dangerous parameter content', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ["^docker rm 'demo && reboot'$"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'removed',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_rm', {
      serverAlias: 'test-server',
      container: 'demo && reboot'
    })
  );

  assert.equal(result, 'removed');
  assert.equal(capturedCommand, "docker rm 'demo && reboot'");
});

test('mkdir should build mkdir -p command and support whitelist', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ["^mkdir -p '/data/releases'$"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'created',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('mkdir', {
      serverAlias: 'test-server',
      path: '/data/releases',
      parents: true
    })
  );

  assert.equal(result, 'created');
  assert.equal(capturedCommand, "mkdir -p '/data/releases'");
});

test('append_text_file should append decoded content to the target file', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: [".*>> '/tmp/app.log'$"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'appended',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('append_text_file', {
      serverAlias: 'test-server',
      filePath: '/tmp/app.log',
      content: 'hello'
    })
  );

  assert.equal(result, 'appended');
  assert.match(capturedCommand, /base64 -d >> '\/tmp\/app\.log'$/);
});

test('docker_exec should build a non-shell exec command with escaped args', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: [".*docker exec.*'/bin/ls'.*'-l'.*'/data folder'$"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'exec-ok',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_exec', {
      serverAlias: 'test-server',
      container: 'api',
      command: '/bin/ls',
      args: ['-l', '/data folder']
    })
  );

  assert.equal(result, 'exec-ok');
  assert.equal(capturedCommand, "docker exec 'api' '/bin/ls' '-l' '/data folder'");
});

test('curl_http should build a structured POST request with body piping', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ['.*curl -X POST.*--data-binary @-$'] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'http-ok',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('curl_http', {
      serverAlias: 'test-server',
      method: 'POST',
      url: 'https://example.com/api',
      headers: ['Content-Type: application/json'],
      body: '{"ok":true}'
    })
  );

  assert.equal(result, 'http-ok');
  assert.match(capturedCommand, /curl -X POST/);
  assert.match(capturedCommand, /--data-binary @-$/);
});

test('firewall_cmd should build structured list command and support whitelist', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ['^firewall-cmd --permanent --list-ports$'] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: '8080/tcp',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('firewall_cmd', {
      serverAlias: 'test-server',
      action: 'list',
      listTarget: 'ports',
      permanent: true
    })
  );

  assert.equal(result, '8080/tcp');
  assert.equal(capturedCommand, 'firewall-cmd --permanent --list-ports');
});

test('firewall_cmd should reject dangerous port token input', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  await assert.rejects(
    () =>
      handlers.handleTool('firewall_cmd', {
        serverAlias: 'test-server',
        action: 'add-port',
        port: '8080/tcp && reboot'
      }),
    /single token|forbidden shell control/
  );
});

test('netstat should use argument array and reject unsafe tokens', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  await assert.rejects(
    () =>
      handlers.handleTool('netstat', {
        serverAlias: 'test-server',
        args: ['-tuln', '&&', 'reboot']
      }),
    /single token|forbidden shell control/
  );
});

test('grep parameter should reject shell substitution payloads', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  await assert.rejects(
    () =>
      handlers.handleTool('cat', {
        serverAlias: 'test-server',
        filePath: '/tmp/app.log',
        grep: '$(reboot)'
      }),
    /forbidden shell control/
  );
});

test('head should build a bounded file preview command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'line1\nline2',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('head', {
      serverAlias: 'test-server',
      filePath: '/tmp/app.log',
      lines: 2
    })
  );

  assert.equal(result, 'line1\nline2');
  assert.equal(capturedCommand, "head -n 2 '/tmp/app.log'");
});

test('sed should build an inclusive line range command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'range-output',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('sed', {
      serverAlias: 'test-server',
      filePath: '/tmp/app.log',
      startLine: 100,
      endLine: 140
    })
  );

  assert.equal(result, 'range-output');
  assert.equal(capturedCommand, "sed -n '100,140p' '/tmp/app.log'");
});

test('sed should reject reversed line ranges', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  await assert.rejects(
    () =>
      handlers.handleTool('sed', {
        serverAlias: 'test-server',
        filePath: '/tmp/app.log',
        startLine: 140,
        endLine: 100
      }),
    /greater than or equal/
  );
});

test('head should reject non-positive line counts', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  await assert.rejects(
    () =>
      handlers.handleTool('head', {
        serverAlias: 'test-server',
        filePath: '/tmp/app.log',
        lines: 0
      }),
    /positive integer/
  );
});

test('ll should support hidden files with all=true', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: '.env\n.git',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('ll', {
      serverAlias: 'test-server',
      all: true
    })
  );

  assert.equal(result, '.env\n.git');
  assert.equal(capturedCommand, 'ls -la');
});

test('grep_r should build a recursive grep command with include and exclude-dir filters', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: './src/app.ts:12:match',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('grep_r', {
      serverAlias: 'test-server',
      path: '/srv/app',
      pattern: 'match',
      ignoreCase: true,
      include: ['*.ts'],
      excludeDir: ['node_modules']
    })
  );

  assert.equal(result, './src/app.ts:12:match');
  assert.equal(capturedCommand, "grep -RinE --include '*.ts' --exclude-dir 'node_modules' 'match' '/srv/app'");
});

test('grep_r should support symmetric context output', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'ctx',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('grep_r', {
      serverAlias: 'test-server',
      path: '/srv/app',
      pattern: 'match',
      context: 2
    })
  );

  assert.equal(capturedCommand, "grep -RnE -C 2 'match' '/srv/app'");
});

test('docker_build should support tag, dockerfile, build args, no-cache, and fixed host networking', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: [".*docker build -t 'demo:latest'.*-f 'Dockerfile\\.prod'.*--no-cache.*--network=host.*"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'build-ok',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_build', {
      serverAlias: 'test-server',
      context: '.',
      tag: 'demo:latest',
      dockerfile: 'Dockerfile.prod',
      buildArgs: ['HTTP_PROXY=http://proxy.local:8080'],
      noCache: true,
      networkHost: true
    })
  );

  assert.equal(result, 'build-ok');
  assert.match(capturedCommand, /docker build/);
  assert.match(capturedCommand, /--network=host/);
  assert.match(capturedCommand, /-t 'demo:latest'/);
  assert.match(capturedCommand, /-f 'Dockerfile\.prod'/);
  assert.match(capturedCommand, /--build-arg 'HTTP_PROXY=http:\/\/proxy\.local:8080'/);
});

test('docker_compose_pull should build a service-scoped pull command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ["^docker-compose pull 'api'$"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'pulled',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_compose_pull', {
      serverAlias: 'test-server',
      cwd: '/srv/app',
      service: 'api'
    })
  );

  assert.equal(result, 'pulled');
  assert.equal(capturedCommand, "docker-compose pull 'api'");
});

test('docker_compose_ps should build a compose status command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'api  running',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_compose_ps', {
      serverAlias: 'test-server',
      cwd: '/srv/app'
    })
  );

  assert.equal(result, 'api  running');
  assert.equal(capturedCommand, 'docker-compose ps');
});

test('docker_compose_config should build a config render command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'services:\n  api:',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_compose_config', {
      serverAlias: 'test-server',
      cwd: '/srv/app'
    })
  );

  assert.equal(result, 'services:\n  api:');
  assert.equal(capturedCommand, 'docker-compose config');
});

test('docker_compose_exec should build a non-shell compose exec command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: [".*docker-compose exec -T.*'api'.*'/bin/sh'.*'-lc'.*'echo ok'.*"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'exec-ok',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('docker_compose_exec', {
      serverAlias: 'test-server',
      cwd: '/srv/app',
      service: 'api',
      command: '/bin/sh',
      args: ['-lc', 'echo ok'],
      user: 'root'
    })
  );

  assert.equal(result, 'exec-ok');
  assert.equal(capturedCommand, "docker-compose exec -T --user 'root' 'api' '/bin/sh' '-lc' 'echo ok'");
});

test('stat should build a file metadata inspection command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'Size: 128',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('stat', {
      serverAlias: 'test-server',
      filePath: '/tmp/app.log'
    })
  );

  assert.equal(result, 'Size: 128');
  assert.equal(capturedCommand, "stat '/tmp/app.log'");
});

test('find should support type, maxDepth, and pathPattern filters', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: '/srv/app/config/app.yml',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('find', {
      serverAlias: 'test-server',
      path: '/srv/app',
      maxDepth: 3,
      type: 'f',
      name: '*.yml',
      pathPattern: '*/config/*'
    })
  );

  assert.equal(capturedCommand, "find '/srv/app' -maxdepth 3 -type f -name '*.yml' -path '*/config/*'");
});

test('journalctl should support follow and until filters', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'journal-output',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('journalctl', {
      serverAlias: 'test-server',
      unit: 'nginx',
      since: '1 hour ago',
      until: 'now',
      follow: true,
      lines: 20
    })
  );

  assert.equal(capturedCommand, "journalctl --no-pager -u 'nginx' --since '1 hour ago' --until 'now' -f -n 20");
});

test('which should build a command path lookup', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: '/usr/bin/docker',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('which', {
      serverAlias: 'test-server',
      commandName: 'docker'
    })
  );

  assert.equal(capturedCommand, "which 'docker'");
});

test('lsof should support path, process, and port filters', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'nginx 123 root  txt',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('lsof', {
      serverAlias: 'test-server',
      path: '/var/log/nginx/access.log',
      process: 'nginx',
      port: 443
    })
  );

  assert.equal(capturedCommand, "lsof '/var/log/nginx/access.log' -c 'nginx' -i :443");
});

test('env should build an environment listing command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'PATH=/usr/bin', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('env', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'env');
});

test('file should build a file type inspection command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'ASCII text', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('file', {
      serverAlias: 'test-server',
      path: '/tmp/app.log'
    })
  );

  assert.equal(capturedCommand, "file '/tmp/app.log'");
});

test('hostname should build a hostname command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'server-01', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('hostname', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'hostname');
});

test('uptime should build an uptime command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: ' 10:00 up 1 day', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('uptime', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'uptime');
});

test('free should build a memory usage command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'Mem:', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('free', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'free -m');
});

test('df_inode should build an inode usage command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'Inodes', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('df_inode', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'df -i');
});

test('mount should build a mounted filesystems command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: '/dev/sda1 on /', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('mount', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'mount');
});

test('id should build an identity command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'uid=0(root)', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('id', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'id');
});

test('uname should default to full kernel info', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'Linux host 6.1', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('uname', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'uname -a');
});

test('ip_route should build a route inspection command', async () => {
  const handlers = new ToolHandlers(
    createConfigManager()
  );

  let capturedCommand = null;

  await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return { stdout: 'default via 10.0.0.1', stderr: '', code: 0, signal: null };
    }
  }, () =>
    handlers.handleTool('ip_route', {
      serverAlias: 'test-server'
    })
  );

  assert.equal(capturedCommand, 'ip route');
});

test('systemctl_enable should build an enable command and support whitelist', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ["^systemctl enable 'nginx'$"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'enabled',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('systemctl_enable', {
      serverAlias: 'test-server',
      service: 'nginx'
    })
  );

  assert.equal(result, 'enabled');
  assert.equal(capturedCommand, "systemctl enable 'nginx'");
});

test('systemctl_disable should build a disable command and support whitelist', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({ whitelist: ["^systemctl disable 'nginx'$"] })
  );

  let capturedCommand = null;

  const result = await withMockedSsh({
    async executeCommand(_serverConfig, command) {
      capturedCommand = command;
      return {
        stdout: 'disabled',
        stderr: '',
        code: 0,
        signal: null
      };
    }
  }, () =>
    handlers.handleTool('systemctl_disable', {
      serverAlias: 'test-server',
      service: 'nginx'
    })
  );

  assert.equal(result, 'disabled');
  assert.equal(capturedCommand, "systemctl disable 'nginx'");
});

test('read-only server should still reject whitelisted built-in write tools', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({
      readOnly: true,
      whitelist: ['^docker-compose restart$']
    })
  );

  await assert.rejects(
    () =>
      handlers.handleTool('docker_compose_restart', {
        serverAlias: 'test-server',
        cwd: '/srv/app'
      }),
    /read-only/
  );
});

test('read-only server should reject mkdir even when it is whitelisted', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({
      readOnly: true,
      whitelist: ["^mkdir -p '/data/releases'$"]
    })
  );

  await assert.rejects(
    () =>
      handlers.handleTool('mkdir', {
        serverAlias: 'test-server',
        path: '/data/releases',
        parents: true
      }),
    /read-only/
  );
});

test('read-only server should reject execute_batch even when write sub-commands are whitelisted', async () => {
  const handlers = new ToolHandlers(
    createConfigManager({
      readOnly: true,
      whitelist: ['^docker-compose restart$']
    })
  );

  await assert.rejects(
    () =>
      handlers.handleTool('execute_batch', {
        serverAlias: 'test-server',
        commands: [
          {
            name: 'docker_compose_restart',
            arguments: { cwd: '/srv/app' }
          }
        ]
      }),
    /read-only/
  );
});
