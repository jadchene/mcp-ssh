import { Client, ConnectConfig } from 'ssh2';
import { ServerConfig, ProxyConfig } from './config.js';
import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
}

const MAX_OUTPUT_LENGTH = 30000;

export class SSHClient {
  private static getBaseConnectConfig(srv: ServerConfig | ProxyConfig): ConnectConfig {
    const config: ConnectConfig = {
      host: srv.host,
      port: (srv as any).port || 22,
      username: srv.username,
      readyTimeout: 15000,
    };
    if (srv.privateKey) {
      config.privateKey = srv.privateKey;
      if (srv.passphrase) config.passphrase = srv.passphrase;
    } else if (srv.password) {
      config.password = srv.password;
    }
    return config;
  }

  public static truncate(text: string): string {
    if (text.length <= MAX_OUTPUT_LENGTH) return text;
    return text.substring(0, MAX_OUTPUT_LENGTH) + `\n\n[... Output truncated (${text.length} chars) ...]`;
  }

  public static async runSession<T>(
    serverConfig: ServerConfig,
    action: (conn: Client) => Promise<T>
  ): Promise<T> {
    const mainConfig = this.getBaseConnectConfig(serverConfig);
    
    // Support strictHostKeyChecking: false (standard automation practice)
    if (serverConfig.strictHostKeyChecking === false) {
      (mainConfig as any).algorithms = { serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519'] };
    }

    return new Promise((resolve, reject) => {
      const conn = new Client();

      const connect = () => {
        if (serverConfig.proxyJump) {
          const proxyConn = new Client();
          const pConfig = this.getBaseConnectConfig(serverConfig.proxyJump);
          
          proxyConn.on('ready', () => {
            logger.info(`Proxy connection ready to ${pConfig.host}`);
            proxyConn.forwardOut('127.0.0.1', 0, mainConfig.host!, mainConfig.port!, (err, stream) => {
              if (err) {
                proxyConn.end();
                return reject(new Error(`Proxy forwarding failed: ${err.message}`));
              }
              conn.connect({ ...mainConfig, sock: stream });
            });
          }).on('error', (err) => {
            proxyConn.end();
            reject(new Error(`Proxy connection error: ${err.message}`));
          }).connect(pConfig);
          
          // Ensure proxy closes when main connection closes
          conn.on('close', () => proxyConn.end());
        } else {
          conn.connect(mainConfig);
        }
      };

      conn.on('ready', async () => {
        logger.info(`SSH Session ready for ${serverConfig.host}`);
        try {
          const result = await action(conn);
          conn.end();
          resolve(result);
        } catch (err) {
          conn.end();
          reject(err);
        }
      }).on('error', (err: Error) => {
        logger.error(`SSH Connection Error:`, err);
        reject(err);
      });

      connect();
    });
  }

  public static async executeOnConn(
    conn: Client,
    command: string,
    cwd?: string,
    timeoutMs: number = 60000
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const finalCommand = cwd ? `cd ${cwd} && ${command}` : command;
      
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      conn.exec(finalCommand, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          return reject(err);
        }
        stream.on('close', (code: number, signal: string) => {
          clearTimeout(timeout);
          resolve({ 
            stdout: this.truncate(stdout), 
            stderr: this.truncate(stderr), 
            code, 
            signal 
          });
        }).on('data', (data: Buffer) => {
          stdout += data.toString();
        }).stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
  }

  public static async executeCommand(
    serverConfig: ServerConfig,
    command: string,
    cwd?: string,
    timeoutMs: number = 60000
  ): Promise<CommandResult> {
    return this.runSession(serverConfig, (conn) => this.executeOnConn(conn, command, cwd, timeoutMs));
  }

  public static async uploadFile(
    serverConfig: ServerConfig,
    localPath: string,
    remotePath: string
  ): Promise<void> {
    return this.runSession(serverConfig, (conn) => {
      return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          const readStream = fs.createReadStream(path.resolve(localPath));
          const writeStream = sftp.createWriteStream(remotePath);
          writeStream.on('close', resolve).on('error', reject);
          readStream.pipe(writeStream);
        });
      });
    });
  }

  public static async downloadFile(
    serverConfig: ServerConfig,
    remotePath: string,
    localPath: string
  ): Promise<void> {
    return this.runSession(serverConfig, (conn) => {
      return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          sftp.fastGet(remotePath, path.resolve(localPath), (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
  }
}
