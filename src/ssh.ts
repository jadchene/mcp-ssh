import { Client, ConnectConfig, type SFTPWrapper } from 'ssh2';
import { EventEmitter } from 'node:events';
import { ServerConfig, ProxyConfig } from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PersistentShell } from './shell.js';
import { SessionError } from './session-error.js';

/** 命令输出及退出信息。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
export interface CommandResult {
  /** 标准输出。 */
  stdout: string;
  /** 标准错误。 */
  stderr: string;
  /** 命令退出码。 */
  code: number | null;
  /** 终止信号。 */
  signal: string | null;
  /** 标准输出是否截断。 */
  stdoutTruncated?: boolean;
  /** 标准错误是否截断。 */
  stderrTruncated?: boolean;
}

/** 单个目标连接及其持久 Shell、跳板连接的共同生命周期。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
export class SSHConnection extends EventEmitter {
  /** 初始化成功后可用的持久 Shell。 */
  public shell?: PersistentShell;
  /** 连接是否已经失效。 */
  public closed = false;
  /** 已启动的传输数量。 */
  private transfers = 0;

  /** 实际远程操作计数，不含本地校验。 */
  public get activity(): number { return (this.shell?.executions ?? 0) + this.transfers; }

  /** 记录已开始的 SFTP 操作。 */
  public markTransfer(): void { this.transfers++; }

  /** 注册目标和跳板连接的断开事件。 */
  constructor(public readonly client: Client, private readonly proxy?: Client) {
    super();
    for (const connection of [client, proxy].filter((value): value is Client => !!value)) {
      connection.on('error', () => this.close('connection_lost'));
      connection.on('end', () => this.close('connection_lost'));
      connection.on('close', () => this.close('connection_lost'));
    }
  }

  /** 绑定只创建一次的 Shell；失效传播到整个连接。 */
  public attachShell(shell: PersistentShell): void {
    if (this.closed) { shell.close(); return; }
    this.shell = shell;
    shell.on('invalid', (reason: string) => this.close(reason));
  }

  /** 一并释放资源，不对断线连接重试。 */
  public close(reason = 'disconnected'): void {
    if (this.closed) return;
    this.closed = true;
    this.shell?.close(reason);
    this.client.destroy();
    this.proxy?.destroy();
    this.emit('invalid', reason);
  }
}

/** 显式建立连接，其他方法只能操作已有会话。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
export class SSHClient {
  /** 生成目标或跳板的认证与主机密钥校验配置。 */
  private static getBaseConnectConfig(srv: ServerConfig | ProxyConfig): ConnectConfig {
    const config: ConnectConfig = {
      host: srv.host, port: srv.port ?? 22, username: srv.username, readyTimeout: 15000,
      keepaliveInterval: 15000, keepaliveCountMax: 3
    };
    if (srv.privateKey) {
      config.privateKey = srv.privateKey;
      if (srv.passphrase) config.passphrase = srv.passphrase;
    } else if (srv.password) config.password = srv.password;
    if (srv.strictHostKeyChecking !== false) {
      const configured = Array.isArray(srv.hostKeySha256) ? srv.hostKeySha256 : [srv.hostKeySha256].filter(Boolean) as string[];
      if (!configured.length) throw new Error(`Host key verification is enabled for ${srv.host}, but hostKeySha256 is not configured.`);
      config.hostVerifier = (key: Buffer) => {
        const fingerprint = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
        return configured.some((expected) => expected.replace(/=+$/, '') === fingerprint);
      };
    }
    return config;
  }

  /** 限制工具最终输出长度。 */
  public static truncate(text: string): string {
    return text.length <= 30000 ? text : text.substring(0, 30000) + `\n\n[... Output truncated (${text.length} chars) ...]`;
  }

  /** 仅供 connect 工具调用，成功返回已经初始化的持久 Shell。 */
  public static async connect(server: ServerConfig, signal?: AbortSignal): Promise<SSHConnection> {
    const config = this.getBaseConnectConfig(server);
    const proxyConfig = server.proxyJump ? this.getBaseConnectConfig(server.proxyJump) : undefined;
    const client = new Client();
    const proxy = proxyConfig ? new Client() : undefined;
    const connection = new SSHConnection(client, proxy);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        connection.removeListener('invalid', invalid);
        if (error) { connection.close('connection_failed'); reject(error); }
        else resolve(connection);
      };
      const invalid = (reason: string) => finish(new SessionError('CONNECTION_FAILED', 'SSH or persistent Shell initialization failed.', reason));
      const abort = () => finish(new SessionError('CONNECTION_FAILED', 'Connection cancelled.', 'cancelled'));
      const timer = setTimeout(() => finish(new SessionError('CONNECTION_FAILED', 'Connection initialization timed out.')), 30000);
      connection.on('invalid', invalid);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      client.once('ready', () => {
        client.shell(false, (error, stream) => {
          if (settled) { stream?.destroy(); return; }
          if (error) { finish(error); return; }
          const shell = new PersistentShell(stream);
          connection.attachShell(shell);
          shell.initialize(15000).then(() => finish(), (failure: Error) => finish(failure));
        });
      });
      try {
        if (proxy && proxyConfig) {
          proxy.once('ready', () => {
            proxy.forwardOut('127.0.0.1', 0, config.host!, config.port!, (error, stream) => {
              if (settled) { stream?.destroy(); return; }
              if (error) { finish(error); return; }
              try { client.connect({ ...config, sock: stream }); } catch (failure) { finish(failure as Error); }
            });
          });
          proxy.connect(proxyConfig);
        } else client.connect(config);
      } catch (error) { finish(error as Error); }
    });
  }

  /** 命令始终在已有的持久 Shell 执行。 */
  public static executeCommand(connection: SSHConnection, command: string, cwd?: string, timeoutMs = 60000, preserveStatus = false): Promise<CommandResult> {
    if (connection.closed || !connection.shell) return Promise.reject(new SessionError('SESSION_EXPIRED', 'Session expired; call connect explicitly.', 'connection_lost'));
    return connection.shell.execute(command, cwd, timeoutMs, preserveStatus);
  }

  /** 在已有连接上打开有超时和断线保护的 SFTP 操作。 */
  private static transfer(connection: SSHConnection, timeoutMs: number,
    action: (sftp: SFTPWrapper, finish: (error?: Error) => void) => (() => void) | void): Promise<void> {
    if (connection.closed) return Promise.reject(new SessionError('SESSION_EXPIRED', 'Session expired; call connect explicitly.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      let channel: SFTPWrapper | undefined;
      let cleanup: (() => void) | void;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        connection.removeListener('invalid', invalid);
        channel?.end();
        cleanup?.();
        error ? reject(error) : resolve();
      };
      const invalid = (reason: string) => finish(new SessionError('SESSION_EXPIRED', 'Session expired during transfer; call connect explicitly.', reason));
      const timer = setTimeout(() => {
        finish(new SessionError('OPERATION_TIMEOUT', `Transfer timed out after ${timeoutMs}ms; session is invalid.`, 'operation_timeout'));
        connection.close('operation_timeout');
      }, timeoutMs);
      connection.on('invalid', invalid);
      connection.markTransfer();
      connection.client.sftp((error, sftp) => {
        if (settled) { sftp?.end(); return; }
        if (error) { finish(error); return; }
        channel = sftp;
        sftp.on('error', finish);
        sftp.on('close', () => {
          if (!settled) connection.close('transfer_interrupted');
        });
        try { cleanup = action(sftp, finish); } catch (failure) { finish(failure as Error); }
        if (settled) cleanup?.();
      });
    });
  }

  /** 上传使用已有连接，完成后仅关闭传输通道。 */
  public static uploadFile(connection: SSHConnection, localPath: string, remotePath: string, timeoutMs = 60000): Promise<void> {
    return this.transfer(connection, timeoutMs, (sftp, finish) => {
      const input = fs.createReadStream(path.resolve(localPath));
      const output = sftp.createWriteStream(remotePath);
      input.on('error', finish);
      output.on('error', finish);
      output.on('close', () => finish());
      input.pipe(output);
      return () => { input.destroy(); output.destroy(); };
    });
  }

  /** 下载先写临时文件，全部完成后原子替换目标。 */
  public static downloadFile(connection: SSHConnection, remotePath: string, localPath: string, timeoutMs = 60000): Promise<void> {
    const resolved = path.resolve(localPath);
    const tempPath = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${randomUUID()}.part`);
    let cancelled = false;
    return this.transfer(connection, timeoutMs, (sftp, finish) => {
      sftp.fastGet(remotePath, tempPath, (error) => {
        if (cancelled) { fs.rmSync(tempPath, { force: true }); return; }
        if (error) { finish(error); return; }
        try { fs.renameSync(tempPath, resolved); finish(); } catch (failure) { finish(failure as Error); }
      });
      return () => { cancelled = true; fs.rmSync(tempPath, { force: true }); };
    });
  }
}
