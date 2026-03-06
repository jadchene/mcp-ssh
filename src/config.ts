import fs from 'fs';
import path from 'path';
import { logger, updateLogTransports } from './logger.js';

export interface WorkingDirectory {
  path: string;
  desc: string;
}

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  privateKey?: string;
  passphrase?: string;
  /** Whether to verify host keys. Set to false for ease of use in dynamic envs. */
  strictHostKeyChecking?: boolean;
  readOnly?: boolean;
  desc?: string;
  workingDirectories?: Record<string, WorkingDirectory>;
  /** Optional jump host configuration */
  proxyJump?: ProxyConfig;
}

export interface AppConfig {
  logDir?: string;
  commandBlacklist?: string[];
  defaultTimeout?: number;
  servers: Record<string, ServerConfig>;
}

export class ConfigManager {
  private configPath: string;
  private config: AppConfig;
  private watchTimeout: NodeJS.Timeout | null = null;

  constructor(configPath: string) {
    this.configPath = path.resolve(configPath);
    this.config = { servers: {} };
    this.config = this.loadConfig();
    this.watchConfig();
  }

  private substituteEnvVars(val: string): string {
    return val.replace(/\${(\w+)}/g, (_, name) => process.env[name] || '');
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
        logger.error(`Failed to read proxy private key:`, err);
      }
    }
    return proxy;
  }

  private loadConfig(): AppConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn(`Config file not found at ${this.configPath}.`);
        return { servers: {} };
      }
      const rawData = fs.readFileSync(this.configPath, 'utf8');
      if (!rawData.trim()) return this.config; 

      const parsed = JSON.parse(rawData) as AppConfig;
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
            logger.error(`Failed to read private key for server ${key}:`, err);
          }
        }
      }
      logger.info('Configuration loaded successfully (sensitive data masked).');
      return parsed;
    } catch (error) {
      logger.error('Failed to load config:', error);
      return this.config;
    }
  }


  private watchConfig() {
    if (fs.existsSync(this.configPath)) {
      fs.watch(this.configPath, () => {
        if (this.watchTimeout) clearTimeout(this.watchTimeout);
        this.watchTimeout = setTimeout(() => {
          this.config = this.loadConfig();
          logger.info('Config hot-reloaded.');
        }, 100); 
      });
    }
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

  public getDefaultTimeout(): number {
    return this.config.defaultTimeout || 60000;
  }
}
