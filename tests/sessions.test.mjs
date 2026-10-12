import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigManager } from '../dist/config.js';
import { ToolHandlers } from '../dist/tools/handlers.js';
import { SessionPool } from '../dist/sessions.js';
import { SSHClient } from '../dist/ssh.js';
import { PersistentShell } from '../dist/shell.js';
import { toolDefinitions } from '../dist/tools/definitions.js';
import { MCPServer } from '../dist/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../dist/logger.js';
import { startSshFixture } from './ssh-fixture.mjs';

/** 创建可热更新配置及实际会话池。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
function createRuntime(t, fixture, options = {}, approval = async () => 'yes') {
  const file = path.join(fixture.directory, 'config.json');
  let configuration = { allowedLocalRoots: [fixture.directory], servers: { test: fixture.serverConfig }, ...options };
  fs.writeFileSync(file, JSON.stringify(configuration));
  const config = new ConfigManager(file);
  const pool = new SessionPool(config);
  const handlers = new ToolHandlers(config, approval, pool);
  t.after(() => { handlers.close(); config.close(); });
  return { config, pool, handlers, update(changes) {
    configuration = { ...configuration, ...changes };
    fs.writeFileSync(file, JSON.stringify(configuration));
  } };
}

/** 等待可验证的配置或连接状态，超时即失败。 */
async function until(predicate, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for fixture state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('all remote tools require sessionId and only connect accepts an alias', async () => {
  assert.equal(toolDefinitions.length, 104);
  for (const definition of toolDefinitions) {
    if (['list_servers', 'list_working_directories', 'connect'].includes(definition.name)) continue;
    assert.ok(definition.inputSchema.required.includes('sessionId'), definition.name);
    assert.equal('serverAlias' in definition.inputSchema.properties, false, definition.name);
  }
});

test('one real SSH and shell preserve state across tools and batches, with SFTP sharing the connection', async (t) => {
  const fixture = await startSshFixture(t);
  const { handlers } = createRuntime(t, fixture);
  const { sessionId } = await handlers.handleTool('connect', { serverAlias: 'test' });
  const call = (name, args = {}) => handlers.handleTool(name, { sessionId, ...args });
  assert.equal((await handlers.handleTool('list_servers', {})).servers[0].enable, true);
  await call('execute_command', { command: 'export MCP_SESSION_VALUE=first' });
  assert.match(await call('env'), /MCP_SESSION_VALUE=first/);
  const initial = (await call('pwd')).trim();
  fs.mkdirSync(path.join(fixture.directory, 'sub'));
  await call('cd', { path: 'sub' });
  assert.equal((await call('pwd')).trim(), `${initial}/sub`);
  fs.writeFileSync(path.join(fixture.directory, 'state.sh'), 'MCP_LOCAL_VALUE=local\nfunction mcp_test_fn() { printf function-result; }\numask 077\n');
  await call('execute_command', { command: '. ../state.sh' });
  assert.equal(await call('execute_command', { command: 'printf "%s" "$MCP_LOCAL_VALUE"' }), 'local');
  assert.equal(await call('execute_command', { command: 'mcp_test_fn' }), 'function-result');
  assert.match(await call('execute_command', { command: 'umask' }), /0077/);
  await call('execute_batch', { commands: [
    { name: 'execute_command', arguments: { command: 'export MCP_SESSION_VALUE=second' } },
    { name: 'cd', arguments: { path: '..' } }
  ] });
  assert.match(await call('env'), /MCP_SESSION_VALUE=second/);
  assert.equal((await call('pwd')).trim(), initial);
  fs.mkdirSync(path.join(fixture.directory, "quoted'; id"));
  await call('pwd', { cwd: "quoted'; id" });
  assert.equal((await call('pwd')).trim(), `${initial}/quoted'; id`);
  await call('cd', { path: '..' });
  assert.match(await call('execute_batch', { commands: [{ name: 'pwd', arguments: {} }] }), new RegExp(initial));
  assert.match(await call('execute_command', { command: 'false' }), /Exited with code 1/);
  assert.equal(await call('execute_command', { command: 'printf "%s" "$?"' }), '1');
  assert.equal((await call('pwd')).trim(), initial);
  assert.match(await call('pwd', { cwd: 'missing-directory' }), /Exited with code/);
  assert.equal((await call('pwd')).trim(), initial);
  await call('pwd', { cwd: 'sub' });
  const input = path.join(fixture.directory, 'upload.txt');
  fs.writeFileSync(input, 'sftp-payload');
  await call('upload_file', { localPath: input, remotePath: 'remote.txt' });
  assert.equal(fs.readFileSync(path.join(fixture.directory, 'sub', 'remote.txt'), 'utf8'), 'sftp-payload');
  const output = path.join(fixture.directory, 'download.txt');
  await call('download_file', { localPath: output, remotePath: 'remote.txt' });
  assert.equal(fs.readFileSync(output, 'utf8'), 'sftp-payload');
  assert.equal(await call('ping_server'), 'Session is connected.');
  assert.deepEqual(fixture.stats, { connections: 1, shells: 1, execs: 0, transfers: 2 });
  await handlers.handleTool('disconnect', { sessionId });
  assert.deepEqual(await handlers.handleTool('disconnect', { sessionId }), { disconnected: true });
  await assert.rejects(() => call('pwd'), { code: 'SESSION_EXPIRED', reason: 'disconnected' });
  assert.equal(fixture.stats.connections, 1);
});

test('missing, old and unknown targets never connect; batch target overrides and management are rejected', async (t) => {
  const fixture = await startSshFixture(t);
  const { handlers } = createRuntime(t, fixture);
  for (const name of ['hostname', 'execute_batch', 'upload_file', 'download_file', 'ping_server']) {
    const args = name === 'execute_batch' ? { commands: [{ name: 'pwd', arguments: {} }] } : name.endsWith('_file') ? { localPath: 'x', remotePath: 'y' } : {};
    await assert.rejects(() => handlers.handleTool(name, { ...args, serverAlias: 'test' }), /sessionId/);
    await assert.rejects(() => handlers.handleTool(name, { ...args, sessionId: 'unknown' }), { code: 'SESSION_EXPIRED' });
  }
  for (const child of [ { name: 'pwd', arguments: { sessionId: 'other' } }, { name: 'pwd', arguments: { serverAlias: 'other' } },
    { name: 'connect', arguments: { serverAlias: 'test' } }, { name: 'disconnect', arguments: {} }, { name: 'execute_batch', arguments: {} } ]) {
    await assert.rejects(() => handlers.handleTool('execute_batch', { sessionId: 'unknown', commands: [child] }), /inherit|not supported|nested/);
  }
  assert.equal(fixture.stats.connections, 0);
});

test('sessions are isolated and same-session concurrency or disconnect while busy is rejected', async (t) => {
  const fixture = await startSshFixture(t);
  const { handlers, pool } = createRuntime(t, fixture);
  const first = await pool.connect('test');
  const second = await pool.connect('test');
  await handlers.handleTool('execute_command', { sessionId: first.sessionId, command: 'export MCP_ISOLATED=one' });
  assert.doesNotMatch(await handlers.handleTool('env', { sessionId: second.sessionId }), /MCP_ISOLATED/);
  const active = handlers.handleTool('execute_command', { sessionId: first.sessionId, command: 'sleep 0.2' });
  await until(() => pool.entries.get(first.sessionId)?.busy);
  await assert.rejects(() => handlers.handleTool('pwd', { sessionId: first.sessionId }), { code: 'SESSION_BUSY' });
  assert.throws(() => pool.disconnect(first.sessionId), { code: 'SESSION_BUSY' });
  assert.match(await handlers.handleTool('pwd', { sessionId: second.sessionId }), /fixture-/);
  await active;
  assert.equal(fixture.stats.shells, 2);
});

test('idle expiry releases resources without reconnect; lookup enforces deadlines even before timers run', async (t) => {
  const fixture = await startSshFixture(t);
  const { handlers, pool } = createRuntime(t, fixture, { sessionIdleTimeoutMs: 100 });
  const { sessionId } = await pool.connect('test');
  await new Promise((resolve) => setTimeout(resolve, 140));
  await assert.rejects(() => handlers.handleTool('pwd', { sessionId }), { code: 'SESSION_EXPIRED', reason: 'idle_timeout' });
  assert.deepEqual(pool.disconnect(sessionId), { disconnected: true });
  await until(() => fixture.clients.size === 0);
  const next = await pool.connect('test');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.timers.tick(101);
  assert.throws(() => pool.get(next.sessionId), { code: 'SESSION_EXPIRED', reason: 'idle_timeout' });
  assert.equal(fixture.stats.connections, 2);
});

test('long operations suspend idle expiry and refresh it on completion, invalid requests do not', async (t) => {
  const fixture = await startSshFixture(t);
  const { handlers, pool } = createRuntime(t, fixture, { sessionIdleTimeoutMs: 100 });
  const { sessionId } = await pool.connect('test');
  await handlers.handleTool('execute_command', { sessionId, command: 'sleep 0.2' });
  assert.ok(pool.get(sessionId));
  const expiry = pool.entries.get(sessionId).expiresAt;
  await assert.rejects(() => handlers.handleTool('pwd', { sessionId, unexpected: true }), /unsupported parameter/);
  assert.equal(pool.entries.get(sessionId).expiresAt, expiry);
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.throws(() => pool.get(sessionId), { code: 'SESSION_EXPIRED' });
});

test('approval waiting does not keep a session alive; tightened permissions and changed shell state block execution', async (t) => {
  const fixture = await startSshFixture(t);
  let approve;
  const runtime = createRuntime(t, fixture, { sessionIdleTimeoutMs: 150 }, () => new Promise((resolve) => { approve = resolve; }));
  const { sessionId } = await runtime.pool.connect('test');
  const operation = runtime.handlers.handleTool('execute_command', { sessionId, command: 'echo must-not-run' });
  await until(() => !!approve);
  await new Promise((resolve) => setTimeout(resolve, 200));
  approve('yes');
  await assert.rejects(operation, { code: 'SESSION_EXPIRED' });
  const next = await runtime.pool.connect('test');
  approve = undefined;
  const pending = runtime.handlers.handleTool('execute_command', { sessionId: next.sessionId, command: 'echo must-not-run' });
  await until(() => !!approve);
  await runtime.handlers.handleTool('cd', { sessionId: next.sessionId, path: '.' });
  approve('yes');
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
});

test('enable defaults true; disabled configs need no credentials and hot reload invalidates sessions', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture, { servers: {
    test: fixture.serverConfig,
    disabled: { ...fixture.serverConfig, host: 'hidden-server.example', enable: false, dangerMode: true,
      workingDirectories: { hidden: { path: '/hidden-path', desc: 'hidden directory' } },
      password: '${MCP_SSH_UNUSED_MISSING_ENV}', privateKeyPath: './missing-key' }
  } });
  await assert.rejects(() => runtime.pool.connect('disabled'), { code: 'SERVER_DISABLED' });
  const discovery = await runtime.handlers.handleTool('list_servers', {});
  assert.deepEqual(discovery.servers.map((server) => server.serverAlias), ['test']);
  assert.doesNotMatch(JSON.stringify(discovery), /disabled|hidden-server|hidden-path|FULL ACCESS/);
  await assert.rejects(() => runtime.handlers.handleTool('list_working_directories', { serverAlias: 'disabled' }), { code: 'SERVER_DISABLED' });
  const { sessionId } = await runtime.pool.connect('test');
  runtime.update({ servers: { test: { ...fixture.serverConfig, enable: false } } });
  await until(() => runtime.config.getServerConfig('test').enable === false);
  assert.deepEqual(await runtime.handlers.handleTool('list_servers', {}), { servers: [] });
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED', reason: 'server_disabled' });
  await assert.rejects(() => runtime.pool.connect('test'), { code: 'SERVER_DISABLED' });
  runtime.update({ servers: { test: { ...fixture.serverConfig, enable: true } } });
  await until(() => runtime.config.getServerConfig('test').enable === true);
  assert.deepEqual((await runtime.handlers.handleTool('list_servers', {})).servers.map((server) => server.serverAlias), ['test']);
  const reenabled = await runtime.pool.connect('test');
  assert.notEqual(reenabled.sessionId, sessionId);
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED' });
});

test('connection configuration changes invalidate sessions; read-only hot reload affects subsequent tools', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture);
  const { sessionId } = await runtime.pool.connect('test');
  runtime.update({ servers: { test: { ...fixture.serverConfig, readOnly: true } } });
  await until(() => runtime.config.getServerConfig('test').readOnly === true);
  await assert.rejects(() => runtime.handlers.handleTool('touch', { sessionId, filePath: 'denied' }), /read-only/);
  assert.ok(runtime.pool.get(sessionId));
  runtime.update({ servers: { test: { ...fixture.serverConfig, username: 'changed' } } });
  await until(() => runtime.config.getServerConfig('test').username === 'changed');
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED', reason: 'configuration_changed' });
});

test('shell exit, command timeout and network loss invalidate rather than create another shell', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture, { defaultTimeout: 100 });
  for (const command of ['exit 0', 'sleep 1']) {
    const { sessionId } = await runtime.pool.connect('test');
    await assert.rejects(() => runtime.handlers.handleTool('execute_command', { sessionId, command }), (error) => ['SESSION_EXPIRED', 'OPERATION_TIMEOUT'].includes(error.code));
    assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED' });
  }
  const { sessionId } = await runtime.pool.connect('test');
  const pending = runtime.handlers.handleTool('execute_command', { sessionId, command: 'sleep 1' });
  await until(() => runtime.pool.entries.get(sessionId)?.busy);
  for (const client of fixture.clients) client.end();
  await assert.rejects(pending, { code: 'SESSION_EXPIRED' });
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED' });
  assert.equal(fixture.stats.connections, 3);
  assert.equal(fixture.stats.shells, 3);
});

test('failed shell initialization frees capacity; wrong host identity fails before shell creation', async (t) => {
  const fixture = await startSshFixture(t, { shell: false });
  const runtime = createRuntime(t, fixture, { maxSessions: 1 });
  for (let i = 0; i < 2; i++) await assert.rejects(() => runtime.pool.connect('test'), { code: 'CONNECTION_FAILED' });
  assert.equal(runtime.pool.entries.size, 0);
  assert.equal(fixture.stats.connections, 2);
  const wrong = createRuntime(t, fixture, { servers: { test: { ...fixture.serverConfig, hostKeySha256: 'SHA256:wrong' } } });
  await assert.rejects(() => wrong.pool.connect('test'), { code: 'CONNECTION_FAILED' });
  assert.equal(fixture.stats.shells, 0);
});

test('capacity counts connecting sessions and shutdown aborts pending establishment', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture, { maxSessions: 1 });
  const original = SSHClient.connect;
  let connectCount = 0;
  SSHClient.connect = (_server, signal) => new Promise((_resolve, reject) => {
    connectCount++;
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  try {
    const pending = runtime.pool.connect('test');
    await assert.rejects(() => runtime.pool.connect('test'), { code: 'SESSION_LIMIT_REACHED' });
    runtime.pool.close();
    await assert.rejects(pending, { code: 'CONNECTION_FAILED' });
    assert.equal(connectCount, 1);
    assert.equal(runtime.pool.entries.size, 0);
  } finally { SSHClient.connect = original; }
});

test('jump connection is reused and both connections close on disconnect', async (t) => {
  const target = await startSshFixture(t);
  const jump = await startSshFixture(t, { forward: true });
  const runtime = createRuntime(t, target, { servers: { test: { ...target.serverConfig, proxyJump: jump.serverConfig } } });
  const { sessionId } = await runtime.pool.connect('test');
  await runtime.handlers.handleTool('pwd', { sessionId });
  await runtime.handlers.handleTool('env', { sessionId });
  assert.equal(target.stats.connections, 1);
  assert.equal(jump.stats.connections, 1);
  runtime.pool.disconnect(sessionId);
  await until(() => target.clients.size === 0 && jump.clients.size === 0);
});

test('framing handles every-byte chunks, separate stderr, missing newline and truncation', async () => {
  const stream = new EventEmitter();
  stream.stderr = new EventEmitter();
  stream.destroy = () => {};
  stream.write = (script, callback) => {
    const token = script.match(/([a-f0-9]{32}):BEGIN/)[1];
    queueMicrotask(() => {
      const stdout = Buffer.from(`startup noise\x1e${token}:BEGIN\x1f${'a'.repeat(31000)}\x1e${token}:END:7\x1f`);
      for (const byte of stdout) stream.emit('data', Buffer.from([byte]));
      const stderr = Buffer.from(`\x1e${token}:BEGIN\x1fno newline\x1e${token}:END\x1f`);
      for (const byte of stderr) stream.stderr.emit('data', Buffer.from([byte]));
      callback?.();
    });
  };
  const shell = new PersistentShell(stream);
  const result = await shell.execute('ignored', undefined, 3000);
  assert.equal(result.code, 7);
  assert.equal(result.stderr, 'no newline');
  assert.equal(result.stdoutTruncated, true);
  assert.ok(result.stdout.length < 30100);
  shell.close();
});

test('enable and session options validate types and defaults', async (t) => {
  const fixture = await startSshFixture(t);
  const file = path.join(fixture.directory, 'invalid-config.json');
  for (const enable of ['false', 0, null]) {
    fs.writeFileSync(file, JSON.stringify({ servers: { test: { ...fixture.serverConfig, enable } } }));
    assert.throws(() => new ConfigManager(file), /enable must be a boolean/);
  }
  for (const configuration of [{ sessionIdleTimeoutMs: 0 }, { maxSessions: 0 }, { maxSessions: '2' }]) {
    fs.writeFileSync(file, JSON.stringify({ ...configuration, servers: {} }));
    assert.throws(() => new ConfigManager(file), /must be an integer/);
  }
  fs.writeFileSync(file, JSON.stringify({ servers: { test: fixture.serverConfig } }));
  const config = new ConfigManager(file);
  t.after(() => config.close());
  assert.equal(config.getSessionIdleTimeout(), 1800000);
  assert.equal(config.getMaxSessions(), 32);
  assert.equal(config.getAllServers().test.enable, true);
  assert.equal(config.getServerConfig('test').enable, true);
});

test('MCP connect returns usable structured session data and transport close releases shell, connections and listeners', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture);
  const baselineListeners = process.listeners('SIGTERM').length;
  const mcp = new MCPServer(runtime.config, runtime.pool);
  const client = new Client({ name: 'fixture-client', version: '1' }, { capabilities: { elicitation: { form: {} } } });
  client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'accept' }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await mcp.server.close(); });
  await mcp.server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = await client.callTool({ name: 'connect', arguments: { serverAlias: 'test' } });
  assert.notEqual(result.isError, true);
  const { sessionId, idleTimeoutMs, expiresAt } = result.structuredContent;
  assert.equal(idleTimeoutMs, 1800000);
  assert.ok(Date.parse(expiresAt) > Date.now());
  const command = (name, args = {}) => client.callTool({ name, arguments: { sessionId, ...args } });
  assert.notEqual((await command('execute_command', { command: 'export MCP_TRANSPORT=retained' })).isError, true);
  assert.match((await command('env')).content[0].text, /MCP_TRANSPORT=retained/);
  const unknown = await client.callTool({ name: 'pwd', arguments: { sessionId: 'expired' } });
  assert.equal(unknown.isError, true);
  assert.equal(JSON.parse(unknown.content[0].text).code, 'SESSION_EXPIRED');
  const entry = runtime.pool.entries.get(sessionId);
  await client.close();
  assert.equal(runtime.pool.entries.size, 0);
  assert.equal(entry.connection.closed, true);
  assert.equal(entry.connection.shell.closed, true);
  assert.equal(entry.timer._destroyed, true);
  assert.equal(runtime.config.watcher, null);
  assert.equal(process.listeners('SIGTERM').length, baselineListeners);
  await until(() => fixture.clients.size === 0);
});

test('SFTP open timeout and connection loss reject pending requests and invalidate without reconnecting', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture);
  const localPath = path.join(fixture.directory, 'pending-download');
  const first = await runtime.pool.connect('test');
  const connection = runtime.pool.get(first.sessionId).connection;
  connection.client.sftp = () => {};
  await assert.rejects(() => SSHClient.downloadFile(connection, '/pending', localPath, 50), { code: 'OPERATION_TIMEOUT' });
  assert.throws(() => runtime.pool.get(first.sessionId), { code: 'SESSION_EXPIRED' });
  const second = await runtime.pool.connect('test');
  const next = runtime.pool.get(second.sessionId).connection;
  next.client.sftp = () => {};
  const pending = SSHClient.downloadFile(next, '/pending', localPath, 1000);
  next.close('connection_lost');
  await assert.rejects(pending, { code: 'SESSION_EXPIRED' });
  assert.equal(fixture.stats.connections, 2);
  assert.equal(fs.existsSync(localPath), false);
});

test('policy tightened during approval rejects operation without touching remote state', async (t) => {
  const fixture = await startSshFixture(t);
  let approve;
  const runtime = createRuntime(t, fixture, {}, () => new Promise((resolve) => { approve = resolve; }));
  const { sessionId } = await runtime.pool.connect('test');
  const operation = runtime.handlers.handleTool('touch', { sessionId, filePath: 'must-not-exist' });
  await until(() => !!approve);
  runtime.update({ servers: { test: { ...fixture.serverConfig, readOnly: true } } });
  await until(() => runtime.config.getServerConfig('test').readOnly === true);
  approve('yes');
  await assert.rejects(operation, /read-only|policy changed/);
  assert.equal(fs.existsSync(path.join(fixture.directory, 'must-not-exist')), false);
});

test('local transfer denial and NUL/background command rejection do not refresh expiry or execute', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture, { allowedLocalRoots: [] });
  const { sessionId } = await runtime.pool.connect('test');
  const entry = runtime.pool.entries.get(sessionId);
  const activity = entry.connection.activity;
  const expiry = entry.expiresAt;
  await assert.rejects(() => runtime.handlers.handleTool('download_file', { sessionId, localPath: 'denied', remotePath: '/pending' }), /Local file access is disabled/);
  await assert.rejects(() => runtime.handlers.handleTool('execute_command', { sessionId, command: 'echo\0bad' }), /NUL/);
  await assert.rejects(() => runtime.handlers.handleTool('execute_command', { sessionId, command: 'sleep 1 &' }), /Background/);
  assert.equal(entry.expiresAt, expiry);
  assert.equal(entry.connection.activity, activity);
});

test('disabling a busy server immediately rejects the command and frees its session', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture);
  const { sessionId } = await runtime.pool.connect('test');
  const entry = runtime.pool.entries.get(sessionId);
  const pending = runtime.handlers.handleTool('execute_command', { sessionId, command: 'sleep 1' });
  const rejected = assert.rejects(pending, { code: 'SESSION_EXPIRED' });
  await until(() => entry.connection.activity > 2 && entry.busy);
  runtime.update({ servers: { test: { ...fixture.serverConfig, enable: false } } });
  await rejected;
  assert.equal(runtime.pool.entries.size, 0);
  assert.equal(entry.connection.shell.closed, true);
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED', reason: 'server_disabled' });
});

test('losing the jump connection interrupts an active operation without replacing the shell', { timeout: 5000 }, async (t) => {
  const target = await startSshFixture(t);
  const jump = await startSshFixture(t, { forward: true });
  const runtime = createRuntime(t, target, { servers: { test: { ...target.serverConfig, proxyJump: jump.serverConfig } } });
  const { sessionId } = await runtime.pool.connect('test');
  const entry = runtime.pool.entries.get(sessionId);
  const pending = runtime.handlers.handleTool('execute_command', { sessionId, command: 'sleep 1' });
  const rejected = assert.rejects(pending, { code: 'SESSION_EXPIRED' });
  await until(() => entry.connection.activity > 2 && entry.busy);
  for (const client of jump.clients) client.end();
  await rejected;
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED' });
  assert.equal(target.stats.connections, 1);
  assert.equal(target.stats.shells, 1);
  assert.equal(jump.stats.connections, 1);
});

test('persistent errexit and nounset options keep their shell semantics', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture);
  const { sessionId } = await runtime.pool.connect('test');
  await runtime.handlers.handleTool('execute_command', { sessionId, command: 'set -u' });
  assert.match(await runtime.handlers.handleTool('pwd', { sessionId }), /fixture-/);
  await runtime.handlers.handleTool('execute_command', { sessionId, command: 'set -e' });
  await assert.rejects(() => runtime.handlers.handleTool('execute_command', { sessionId, command: 'false' }), { code: 'SESSION_EXPIRED' });
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED' });
  assert.equal(fixture.stats.shells, 1);
});

test('unexpected SFTP channel close invalidates the session reported as expired', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture);
  const { sessionId } = await runtime.pool.connect('test');
  const connection = runtime.pool.get(sessionId).connection;
  const channel = new EventEmitter();
  channel.end = () => {};
  channel.fastGet = () => queueMicrotask(() => channel.emit('close'));
  connection.client.sftp = (callback) => callback(null, channel);
  await assert.rejects(() => SSHClient.downloadFile(connection, '/interrupted', path.join(fixture.directory, 'unfinished'), 1000),
    { code: 'SESSION_EXPIRED', reason: 'transfer_interrupted' });
  assert.throws(() => runtime.pool.get(sessionId), { code: 'SESSION_EXPIRED', reason: 'transfer_interrupted' });
  assert.equal(connection.shell.closed, true);
});

test('rm_safe rejects a resolved escape without exiting the persistent shell', async (t) => {
  const fixture = await startSshFixture(t);
  fs.mkdirSync(path.join(fixture.directory, 'allowed'));
  fs.mkdirSync(path.join(fixture.directory, 'outside'));
  fs.writeFileSync(path.join(fixture.directory, 'outside', 'keep.txt'), 'protected');
  fs.symlinkSync(path.join(fixture.directory, 'outside'), path.join(fixture.directory, 'allowed', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const runtime = createRuntime(t, fixture);
  const { sessionId } = await runtime.pool.connect('test');
  const directory = (await runtime.handlers.handleTool('pwd', { sessionId })).trim();
  runtime.update({ servers: { test: { ...fixture.serverConfig, allowedRemoteRoots: [`${directory}/allowed`] } } });
  await until(() => !!runtime.config.getServerConfig('test').allowedRemoteRoots);
  const result = await runtime.handlers.handleTool('rm_safe', { sessionId, path: `${directory}/allowed/link`, recursive: true });
  assert.match(result, /resolved path denied/);
  assert.match(result, /Exited with code 64/);
  assert.equal((await runtime.handlers.handleTool('pwd', { sessionId })).trim(), directory);
  assert.equal(fs.readFileSync(path.join(fixture.directory, 'outside', 'keep.txt'), 'utf8'), 'protected');
});

test('server lookup never resolves inherited object properties', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture);
  for (const alias of ['constructor', 'toString', '__proto__']) {
    assert.equal(runtime.config.getServerConfig(alias), undefined);
    await assert.rejects(() => runtime.pool.connect(alias), { code: 'SERVER_NOT_FOUND' });
  }
  assert.equal(fixture.stats.connections, 0);
});

test('explicit prototype-like aliases are discoverable while unmapped directory names remain paths', async (t) => {
  const fixture = await startSshFixture(t);
  const runtime = createRuntime(t, fixture, { servers: { ['__proto__']: { ...fixture.serverConfig, workingDirectories: {} } } });
  const discovery = await runtime.handlers.handleTool('list_servers', {});
  assert.deepEqual(discovery.servers.map((server) => server.serverAlias), ['__proto__']);
  const { sessionId } = await runtime.pool.connect('__proto__');
  fs.mkdirSync(path.join(fixture.directory, 'constructor'));
  const result = await runtime.handlers.handleTool('pwd', { sessionId, cwd: 'constructor' });
  assert.match(result, /\/constructor\n$/);
});

test('relative config and environment log directories resolve from the configuration file', async (t) => {
  const fixture = await startSshFixture(t);
  const file = path.join(fixture.directory, 'relative-log-config.json');
  for (const source of ['config', 'environment']) {
    const relative = source === 'config' ? './file-logs' : './environment-logs';
    const directory = path.resolve(fixture.directory, relative);
    fs.writeFileSync(file, JSON.stringify({ ...(source === 'config' ? { logDir: relative } : {}), servers: {} }));
    const previous = process.env.MCP_SSH_LOG_DIR;
    if (source === 'environment') process.env.MCP_SSH_LOG_DIR = relative;
    else delete process.env.MCP_SSH_LOG_DIR;
    let config;
    try {
      config = new ConfigManager(file);
      const transports = logger.transports.filter((transport) => transport.name === 'file');
      assert.equal(transports.length, 2);
      for (const transport of transports) assert.equal(path.resolve(transport.dirname), directory);
      await until(() => fs.existsSync(path.join(directory, 'mcp-ssh.log')));
    } finally {
      config?.close();
      if (previous === undefined) delete process.env.MCP_SSH_LOG_DIR;
      else process.env.MCP_SSH_LOG_DIR = previous;
      for (const transport of logger.transports.filter((value) => value.name === 'file')) {
        const destination = transport._dest;
        logger.remove(transport);
        transport._stream?.destroy();
        if (destination && !destination.closed) {
          await new Promise((resolve) => { destination.once('close', resolve); destination.destroy(); });
        }
      }
    }
  }
});

test('equivalent jump-host identity survives configuration formatting and default changes', async (t) => {
  const target = await startSshFixture(t);
  const jump = await startSshFixture(t, { forward: true });
  const runtime = createRuntime(t, target, { servers: { test: { ...target.serverConfig, proxyJump: jump.serverConfig } } });
  const { sessionId } = await runtime.pool.connect('test');
  runtime.update({ servers: { test: { ...target.serverConfig, desc: 'formatted configuration',
    hostKeySha256: [target.serverConfig.hostKeySha256], proxyJump: {
      hostKeySha256: [jump.serverConfig.hostKeySha256], password: jump.serverConfig.password,
      username: jump.serverConfig.username, port: jump.serverConfig.port, host: jump.serverConfig.host,
      strictHostKeyChecking: true
    }
  } } });
  await until(() => runtime.config.getServerConfig('test').desc === 'formatted configuration');
  assert.ok(runtime.pool.get(sessionId));
  assert.match(await runtime.handlers.handleTool('pwd', { sessionId }), /fixture-/);
  assert.equal(target.stats.connections, 1);
  assert.equal(jump.stats.connections, 1);
});
