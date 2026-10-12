import ssh2 from 'ssh2';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { Server, utils } = ssh2;

/** 本机回环 SSH/SFTP 服务，命令交给真实 Bash；禁止逐命令 exec。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
export async function startSshFixture(t, { shell = true, forward = false } = {}) {
  const temporaryRoot = process.env.MCP_SSH_TEST_TMP || path.join(os.tmpdir(), 'mcp-ssh-session-tests');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'fixture-'));
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
  const publicKey = utils.parseKey(key).getPublicSSH();
  const fingerprint = `SHA256:${createHash('sha256').update(publicKey).digest('base64').replace(/=+$/, '')}`;
  const clients = new Set();
  const processes = new Set();
  const sockets = new Set();
  const stats = { connections: 0, shells: 0, execs: 0, transfers: 0 };
  let bash = process.env.MCP_SSH_TEST_SHELL || '/bin/bash';
  if (process.platform === 'win32' && !process.env.MCP_SSH_TEST_SHELL) {
    const git = execFileSync('where.exe', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0];
    bash = path.resolve(path.dirname(git), '..', 'bin', 'bash.exe');
  }
  if (!fs.existsSync(bash)) throw new Error(`Real Bash fixture requires ${bash}; set MCP_SSH_TEST_SHELL.`);

  // SFTP 将 Git Bash 的盘符路径还原为本机路径，始终限制在本次夹具目录。
  const localPath = (remote) => {
    const value = process.platform === 'win32' ? remote.replace(/^\/([a-z])\//i, '$1:/') : remote;
    const resolved = path.resolve(value);
    const relative = path.relative(directory, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Fixture path outside temporary directory');
    return resolved;
  };
  const ssh = new Server({ hostKeys: [key] }, (client) => {
    clients.add(client);
    stats.connections++;
    client.on('error', () => {});
    client.on('close', () => clients.delete(client));
    client.on('authentication', (ctx) => ctx.method === 'password' && ctx.password === 'test-password' ? ctx.accept() : ctx.reject());
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('pty', (_accept, reject) => reject());
        session.on('exec', (_accept, reject) => { stats.execs++; reject(); });
        session.on('shell', (acceptShell, reject) => {
          if (!shell) { reject(); return; }
          stats.shells++;
          const channel = acceptShell();
          const env = { ...process.env };
          delete env.BASH_ENV;
          const child = spawn(bash, ['--noprofile', '--norc'], { cwd: directory, env, stdio: 'pipe', windowsHide: true });
          processes.add(child);
          channel.pipe(child.stdin);
          child.stdin.on('error', () => {});
          child.stdout.pipe(channel, { end: false });
          child.stderr.pipe(channel.stderr, { end: false });
          channel.on('close', () => {
            // 断线后目标流可能已停止读取，主动释放管道，避免等待 close 永久悬挂。
            child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.kill();
          });
          child.on('error', () => { channel.exit(1); channel.end(); });
          child.on('close', (code) => {
            processes.delete(child);
            channel.exit(code ?? 0);
            channel.end();
          });
        });
        session.on('sftp', (acceptSftp) => {
          stats.transfers++;
          const sftp = acceptSftp();
          const handles = new Map();
          let serial = 0;
          const status = utils.sftp.STATUS_CODE;
          const failure = (id) => sftp.status(id, status.FAILURE);
          sftp.on('OPEN', (id, filename, flags) => {
            try {
              const fd = fs.openSync(localPath(filename), utils.sftp.flagsToString(flags));
              const handle = Buffer.alloc(4);
              handle.writeUInt32BE(++serial);
              handles.set(serial, fd);
              sftp.handle(id, handle);
            } catch { failure(id); }
          });
          sftp.on('READ', (id, handle, offset, length) => {
            try {
              const data = Buffer.alloc(length);
              const size = fs.readSync(handles.get(handle.readUInt32BE()), data, 0, length, offset);
              size ? sftp.data(id, data.subarray(0, size)) : sftp.status(id, status.EOF);
            } catch { failure(id); }
          });
          sftp.on('WRITE', (id, handle, offset, data) => {
            try { fs.writeSync(handles.get(handle.readUInt32BE()), data, 0, data.length, offset); sftp.status(id, status.OK); }
            catch { failure(id); }
          });
          sftp.on('FSTAT', (id, handle) => {
            try { sftp.attrs(id, fs.fstatSync(handles.get(handle.readUInt32BE()))); } catch { failure(id); }
          });
          sftp.on('STAT', (id, filename) => {
            try { sftp.attrs(id, fs.statSync(localPath(filename))); } catch { failure(id); }
          });
          sftp.on('CLOSE', (id, handle) => {
            try { const index = handle.readUInt32BE(); fs.closeSync(handles.get(index)); handles.delete(index); sftp.status(id, status.OK); }
            catch { failure(id); }
          });
          sftp.on('close', () => { for (const fd of handles.values()) fs.closeSync(fd); handles.clear(); });
        });
      });
      client.on('tcpip', (accept, reject, info) => {
        if (!forward || info.destIP !== '127.0.0.1') { reject(); return; }
        const socket = net.connect(info.destPort, info.destIP, () => {
          const channel = accept();
          channel.pipe(socket).pipe(channel);
          channel.on('close', () => socket.destroy());
        });
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => reject());
      });
    });
  });
  await new Promise((resolve, reject) => { ssh.once('error', reject); ssh.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    const stopped = [...processes].map((child) => new Promise((resolve) => {
      child.once('close', resolve);
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.kill();
    }));
    for (const socket of sockets) socket.destroy();
    for (const client of clients) { client.end(); client._sock.destroy(); }
    await new Promise((resolve) => ssh.close(resolve));
    await Promise.all(stopped);
    if (!path.resolve(directory).startsWith(path.resolve(temporaryRoot) + path.sep)) throw new Error('Unsafe fixture cleanup');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { directory, stats, clients, ssh, serverConfig: {
    host: '127.0.0.1', port: ssh.address().port, username: 'tester', password: 'test-password', hostKeySha256: fingerprint
  } };
}
