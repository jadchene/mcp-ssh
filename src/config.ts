import fs from 'fs';
import path from 'path';
import { logger, updateLogTransports } from './logger.js';

export interface WorkingDirectory {
  path: string;
  desc: string;
}

export interface ProxyConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  privateKey?: string;
  passphrase?: string;
  strictHostKeyChecking?: boolean;
  hostKeySha256?: string | string[];
}

export interface ServerConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  privateKey?: string;
  passphrase?: string;
  /** Whether to verify host keys. Set to false for ease of use in dynamic envs. */
  strictHostKeyChecking?: boolean;
  /** Allowed SHA-256 host key fingerprints (SHA256:base64). Required unless strict checking is false. */
  hostKeySha256?: string | string[];
  readOnly?: boolean;
  desc?: string;
  workingDirectories?: Record<string, WorkingDirectory>;
  /** Optional jump host configuration */
  proxyJump?: ProxyConfig;
  /** Optional absolute remote roots within which rm_safe may delete. */
  allowedRemoteRoots?: string[];
}

export interface AppConfig {
  logDir?: string;
  commandBlacklist?: string[];
  commandWhitelist?: string[];
  defaultTimeout?: number;
  /** Local roots available to upload/download operations. Defaults to no local file access. */
  allowedLocalRoots?: string[];
  servers: Record<string, ServerConfig>;
}

export class ConfigManager {
  private configPath: string;
  private config: AppConfig;
  private watchTimeout: NodeJS.Timeout | null = null;
  private watcher: fs.FSWatcher | null = null;

  constructor(configPath: string) {
    this.configPath = path.resolve(configPath);
    this.config = { servers: {} };
    if (process.env.MCP_SSH_LOG_DIR) {
      updateLogTransports(process.env.MCP_SSH_LOG_DIR);
    }
    this.config = this.loadConfig(true) ?? { servers: {} };
    this.watchConfig();
  }

  private substituteEnvVars(val: string): string {
    return val.replace(/\${(\w+)}/g, (_, name) => {
      const resolved = process.env[name];
      if (resolved === undefined) throw new Error(`Required environment variable '${name}' is not set.`);
      return resolved;
    });
  }

  private validatePort(port: number, label: string) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${label} must be an integer from 1 to 65535.`);
    }
  }

  private validateConfig(config: AppConfig) {
    if (!config || typeof config !== 'object' || !config.servers || typeof config.servers !== 'object' || Array.isArray(config.servers)) {
      throw new Error(`Configuration must contain a 'servers' object.`);
    }
    if (config.defaultTimeout !== undefined && (!Number.isInteger(config.defaultTimeout) || config.defaultTimeout < 100 || config.defaultTimeout > 3600000)) {
      throw new Error(`defaultTimeout must be an integer from 100 to 3600000 milliseconds.`);
    }
    if (config.allowedLocalRoots !== undefined && (!Array.isArray(config.allowedLocalRoots) || config.allowedLocalRoots.some((root) => typeof root !== 'string' || !root.trim()))) {
      throw new Error(`allowedLocalRoots must be an array of non-empty paths.`);
    }
    for (const [alias, server] of Object.entries(config.servers)) {
      if (!server || typeof server.host !== 'string' || !server.host || typeof server.username !== 'string' || !server.username) {
        throw new Error(`Server '${alias}' must define non-empty host and username values.`);
      }
      this.validatePort(server.port ?? 22, `Server '${alias}' port`);
      if (server.allowedRemoteRoots !== undefined && (!Array.isArray(server.allowedRemoteRoots) || server.allowedRemoteRoots.some((root) => typeof root !== 'string' || !path.posix.isAbsolute(root)))) {
        throw new Error(`Server '${alias}' allowedRemoteRoots must contain absolute paths.`);
      }
      if (server.hostKeySha256 !== undefined && !(typeof server.hostKeySha256 === 'string' || (Array.isArray(server.hostKeySha256) && server.hostKeySha256.every((value) => typeof value === 'string')))) {
        throw new Error(`Server '${alias}' hostKeySha256 must be a string or string array.`);
      }
      if (server.proxyJump) {
        if (!server.proxyJump.host || !server.proxyJump.username) throw new Error(`Server '${alias}' proxyJump must define host and username.`);
        this.validatePort(server.proxyJump.port ?? 22, `Server '${alias}' proxyJump port`);
      }
    }
    for (const [label, patterns] of [['commandBlacklist', config.commandBlacklist], ['commandWhitelist', config.commandWhitelist]] as const) {
      for (const pattern of patterns || []) {
        try { new RegExp(pattern, 'i'); } catch { throw new Error(`${label} contains an invalid regular expression: ${pattern}`); }
      }
    }
  }

  private processProxy(proxy?: ProxyConfig): ProxyConfig | undefined {
    if (!proxy) return undefined;
    if (proxy.host) proxy.host = this.substituteEnvVars(proxy.host);
    if (proxy.username) proxy.username = this.substituteEnvVars(proxy.username);
    if (proxy.password) proxy.password = this.substituteEnvVars(proxy.password);
    if (proxy.passphrase) proxy.passphrase = this.substituteEnvVars(proxy.passphrase);
    if (proxy.privateKeyPath) {
      proxy.privateKeyPath = this.substituteEnvVars(proxy.privateKeyPath);
      try {
        const keyPath = path.resolve(path.dirname(this.configPath), proxy.privateKeyPath);
        proxy.privateKey = fs.readFileSync(keyPath, 'utf8');
      } catch (err) {
        throw new Error(`Failed to read proxy private key '${proxy.privateKeyPath}': ${(err as Error).message}`);
      }
    }
    return proxy;
  }

  private loadConfig(throwOnError = false): AppConfig | null {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn(`Config file not found at ${this.configPath}.`);
        return throwOnError ? { servers: {} } : null;
      }
      const rawData = fs.readFileSync(this.configPath, 'utf8');
      if (!rawData.trim()) return null;

      const parsed = JSON.parse(rawData) as AppConfig;
      this.validateConfig(parsed);
      if (parsed.logDir) updateLogTransports(this.substituteEnvVars(parsed.logDir));

      const maskedConfig = JSON.parse(JSON.stringify(parsed)); // For logging

      for (const key of Object.keys(parsed.servers || {})) {
        const srv = parsed.servers[key];
        const logSrv = maskedConfig.servers[key];

        if (srv.host) srv.host = this.substituteEnvVars(srv.host);
        if (srv.username) srv.username = this.substituteEnvVars(srv.username);

        // Mask passwords/passphrases in log object
        if (srv.password) {
          srv.password = this.substituteEnvVars(srv.password);
          logSrv.password = "********";
        }
        if (srv.passphrase) {
          srv.passphrase = this.substituteEnvVars(srv.passphrase);
          logSrv.passphrase = "********";
        }
        if (srv.proxyJump) {
          srv.proxyJump = this.processProxy(srv.proxyJump);
          if (logSrv.proxyJump.password) logSrv.proxyJump.password = "********";
          if (logSrv.proxyJump.passphrase) logSrv.proxyJump.passphrase = "********";
        }

        if (srv.privateKeyPath) {
          srv.privateKeyPath = this.substituteEnvVars(srv.privateKeyPath);
          try {
            const keyPath = path.resolve(path.dirname(this.configPath), srv.privateKeyPath);
            srv.privateKey = fs.readFileSync(keyPath, 'utf8');
          } catch (err) {
            throw new Error(`Failed to read private key for server '${key}': ${(err as Error).message}`);
          }
        }
      }
      logger.info('Configuration loaded successfully (sensitive data masked).');
      return parsed;
    } catch (error) {
      logger.error('Failed to load config:', error);
      if (throwOnError) throw error;
      return null;
    }
  }


  private watchConfig() {
    const configDirectory = path.dirname(this.configPath);
    const configName = path.basename(this.configPath);
    this.watcher = fs.watch(configDirectory, (_eventType, filename) => {
      if (filename && filename.toString() !== configName) return;
      if (this.watchTimeout) clearTimeout(this.watchTimeout);
      this.watchTimeout = setTimeout(() => {
        this.watchTimeout = null;
        const nextConfig = this.loadConfig();
        if (!nextConfig) return;
        this.config = nextConfig;
        logger.info('Config hot-reloaded.');
      }, 100);
    });
  }

  public getServerConfig(alias: string): ServerConfig | undefined {
    return this.config.servers[alias];
  }
  
  public getAllServers(): Record<string, { desc?: string, host: string }> {
    const result: any = {};
    for (const [alias, srv] of Object.entries(this.config.servers)) {
      result[alias] = { desc: srv.desc, host: srv.host };
    }
    return result;
  }

  public getGlobalBlacklist(): string[] {
    return this.config.commandBlacklist || [];
  }

  public getGlobalWhitelist(): string[] {
    return this.config.commandWhitelist || [];
  }

  public getDefaultTimeout(): number {
    return this.config.defaultTimeout ?? 60000;
  }

  public getAllowedLocalRoots(): string[] {
    return (this.config.allowedLocalRoots || []).map((root) =>
      path.resolve(path.dirname(this.configPath), this.substituteEnvVars(root))
    );
  }

  public close() {
    if (this.watchTimeout) clearTimeout(this.watchTimeout);
    this.watchTimeout = null;
    this.watcher?.close();
    this.watcher = null;
  }
}
