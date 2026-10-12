import { createHash, randomUUID } from 'node:crypto';
import { ConfigManager, type ServerConfig, type ProxyConfig } from './config.js';
import { SSHClient, type SSHConnection } from './ssh.js';
import { SessionError } from './session-error.js';
import path from 'node:path';

/** 会话池内部条目，包含建立中状态。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
interface SessionEntry {
  /** 绑定的服务器别名。 */
  serverAlias: string;
  /** 连接身份配置摘要。 */
  fingerprint: string;
  /** 用于取消尚未完成的连接。 */
  controller: AbortController;
  /** 初始化完成后的连接。 */
  connection?: SSHConnection;
  /** 运行中的顶层操作。 */
  busy: boolean;
  /** 最后一次实际操作结束时间。 */
  lastUsedAt: number;
  /** 空闲截止时间。 */
  expiresAt: number;
  /** 空闲清理计时器。 */
  timer?: NodeJS.Timeout;
  /** 审批后检测状态变化的版本。 */
  revision: number;
}

/** 显式会话池，失效条目不能重新连接。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
export class SessionPool {
  /** 包括连接中条目的活动会话。 */
  private entries = new Map<string, SessionEntry>();
  /** 有限数量的失效原因。 */
  private expired = new Map<string, { reason: string; at: number }>();
  /** 配置订阅清理函数。 */
  private unsubscribe: () => void;
  /** 关闭后不再接受连接。 */
  private closed = false;

  /** 监听配置变化并处理禁用或连接身份变更。 */
  constructor(private readonly config: ConfigManager) {
    this.unsubscribe = config.onChange(() => this.reconcile());
  }

  /** 对决定连接身份的字段计算摘要。 */
  private fingerprint(server: ServerConfig): string {
    // 只保留真实连接使用的身份字段，忽略属性顺序、描述和等价默认值。
    const identity = (value: ServerConfig | ProxyConfig) => {
      const pins = Array.isArray(value.hostKeySha256) ? value.hostKeySha256 : [value.hostKeySha256].filter((pin): pin is string => !!pin);
      return [value.host, value.port ?? 22, value.username,
        value.privateKey ? ['key', value.privateKey, value.passphrase ?? null] : ['password', value.password ?? null],
        value.strictHostKeyChecking !== false,
        value.strictHostKeyChecking === false ? [] : [...new Set(pins.map((pin) => pin.replace(/=+$/, '')))].sort()];
    };
    return createHash('sha256').update(JSON.stringify([identity(server), server.proxyJump ? identity(server.proxyJump) : null])).digest('hex');
  }

  /** 禁用服务器或无效别名不会创建客户端。 */
  private enabledServer(alias: string): ServerConfig {
    const server = this.config.getServerConfig(alias);
    if (!server) throw new SessionError('SERVER_NOT_FOUND', `Server alias '${alias}' not found in configuration.`);
    if (server.enable === false) throw new SessionError('SERVER_DISABLED', `Server '${alias}' is disabled.`);
    return server;
  }

  /** 唯一建连入口，建立中也占用容量。 */
  public async connect(serverAlias: string): Promise<object> {
    if (this.closed) throw new SessionError('SESSION_EXPIRED', 'MCP server is shutting down.', 'server_closed');
    const server = this.enabledServer(serverAlias);
    if (this.entries.size >= this.config.getMaxSessions()) throw new SessionError('SESSION_LIMIT_REACHED', 'Session limit reached; disconnect an unused session.');
    const sessionId = randomUUID();
    const entry: SessionEntry = { serverAlias, fingerprint: this.fingerprint(server), controller: new AbortController(), busy: false,
      lastUsedAt: Date.now(), expiresAt: 0, revision: 0 };
    this.entries.set(sessionId, entry);
    try {
      const connection = await SSHClient.connect(server, entry.controller.signal);
      if (this.entries.get(sessionId) !== entry || connection.closed) {
        connection.close();
        throw new SessionError('CONNECTION_FAILED', 'Connection invalidated while initializing.');
      }
      entry.connection = connection;
      connection.on('invalid', (reason: string) => this.invalidate(sessionId, reason));
      this.reconcile();
      if (this.entries.get(sessionId) !== entry) throw new SessionError('CONNECTION_FAILED', 'Server configuration changed while connecting.');
      entry.lastUsedAt = Date.now();
      this.arm(sessionId, entry);
      return { sessionId, serverAlias, idleTimeoutMs: this.config.getSessionIdleTimeout(), expiresAt: new Date(entry.expiresAt).toISOString() };
    } catch (error) {
      this.invalidate(sessionId, 'connection_failed');
      if (error instanceof SessionError) throw error;
      throw new SessionError('CONNECTION_FAILED', `Connection failed: ${(error as Error).message}`);
    }
  }

  /** 查询会话和最新权限，不刷新空闲时间。 */
  public get(sessionId: string): { serverAlias: string; server: ServerConfig; connection: SSHConnection; revision: number } {
    const entry = this.entries.get(sessionId);
    if (!entry?.connection || entry.connection.closed) this.failExpired(sessionId);
    const server = this.config.getServerConfig(entry.serverAlias);
    if (!server || server.enable === false || this.fingerprint(server) !== entry.fingerprint) {
      this.invalidate(sessionId, server?.enable === false ? 'server_disabled' : 'configuration_changed');
      this.failExpired(sessionId);
    }
    if (!entry.busy && Date.now() >= entry.expiresAt) {
      this.invalidate(sessionId, 'idle_timeout');
      this.failExpired(sessionId);
    }
    return { serverAlias: entry.serverAlias, server, connection: entry.connection, revision: entry.revision };
  }

  /** 供日志和警告查询归属，不保活、不抛错。 */
  public getAlias(sessionId: string): string | undefined { return this.entries.get(sessionId)?.serverAlias; }

  /** 审批前读取真实目录，不延长空闲寿命，也不改变用户操作版本。 */
  public inspectDirectory(sessionId: string): Promise<string> {
    return this.use(sessionId, async (connection) => {
      const result = await SSHClient.executeCommand(connection, 'command pwd -P', undefined, this.config.getDefaultTimeout(), true);
      const directory = result.stdout.replace(/\n$/, '');
      if (result.code !== 0 || result.stdoutTruncated || !path.posix.isAbsolute(directory)) throw new Error('Cannot inspect the session working directory.');
      return directory;
    }, undefined, false);
  }

  /** 一次只执行一个操作，完成后刷新空闲期限。 */
  public async use<T>(sessionId: string, action: (connection: SSHConnection) => Promise<T>, expectedRevision?: number, refreshIdle = true): Promise<T> {
    const context = this.get(sessionId);
    const entry = this.entries.get(sessionId)!;
    if (entry.busy) throw new SessionError('SESSION_BUSY', 'Session is executing another operation.');
    if (expectedRevision !== undefined && expectedRevision !== context.revision) throw new SessionError('SESSION_CHANGED', 'Session state changed during approval; review and retry the operation.');
    entry.busy = true;
    const activity = context.connection.activity;
    clearTimeout(entry.timer);
    try { return await action(context.connection); }
    finally {
      entry.busy = false;
      const used = context.connection.activity !== activity;
      if (used && refreshIdle) entry.revision++;
      if (this.entries.get(sessionId) === entry) {
        if (used && refreshIdle) entry.lastUsedAt = Date.now();
        this.arm(sessionId, entry);
      }
    }
  }

  /** 显式断开，已记录的断开请求允许幂等重试。 */
  public disconnect(sessionId: string): object {
    const entry = this.entries.get(sessionId);
    if (!entry) {
      const record = this.expired.get(sessionId);
      if (record && Date.now() - record.at < 3600000) return { disconnected: true };
      this.failExpired(sessionId);
    }
    this.get(sessionId);
    if (entry.busy) throw new SessionError('SESSION_BUSY', 'Session is executing; disconnect after completion.');
    this.invalidate(sessionId, 'disconnected');
    return { disconnected: true };
  }

  /** 根据最后完成时间设置失效定时器。 */
  private arm(sessionId: string, entry: SessionEntry): void {
    clearTimeout(entry.timer);
    entry.expiresAt = entry.lastUsedAt + this.config.getSessionIdleTimeout();
    entry.timer = setTimeout(() => this.invalidate(sessionId, 'idle_timeout'), Math.max(0, entry.expiresAt - Date.now()));
    entry.timer.unref();
  }

  /** 释放资源并有限保存原因。 */
  private invalidate(sessionId: string, reason: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.entries.delete(sessionId);
    clearTimeout(entry.timer);
    entry.controller.abort();
    entry.connection?.close(reason);
    const now = Date.now();
    this.expired.set(sessionId, { reason, at: now });
    for (const [id, record] of this.expired) {
      if (this.expired.size <= 1024 && now - record.at < 3600000) break;
      this.expired.delete(id);
    }
  }

  /** 未知或过期 ID 不触发重连。 */
  private failExpired(sessionId: string): never {
    const record = this.expired.get(sessionId);
    const reason = record && Date.now() - record.at < 3600000 ? record.reason : 'unknown_session';
    if (reason === 'unknown_session') this.expired.delete(sessionId);
    throw new SessionError('SESSION_EXPIRED', `Session expired (${reason}); call connect explicitly.`, reason);
  }

  /** 配置热更新立即失效禁用及身份变更的连接。 */
  private reconcile(): void {
    for (const [id, entry] of this.entries) {
      const server = this.config.getServerConfig(entry.serverAlias);
      if (!server || server.enable === false || this.fingerprint(server) !== entry.fingerprint) {
        this.invalidate(id, server?.enable === false ? 'server_disabled' : 'configuration_changed');
      } else if (entry.connection && !entry.busy) this.arm(id, entry);
    }
  }

  /** 关闭池和建立中连接，清理订阅与记录。 */
  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    for (const id of this.entries.keys()) this.invalidate(id, 'server_closed');
    this.expired.clear();
  }
}
