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
