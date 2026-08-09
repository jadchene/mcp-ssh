import { Client, ConnectConfig } from 'ssh2';
import { ServerConfig, ProxyConfig } from './config.js';
import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'node:crypto';

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
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
    if (srv.strictHostKeyChecking !== false) {
      const configured = Array.isArray(srv.hostKeySha256) ? srv.hostKeySha256 : [srv.hostKeySha256].filter(Boolean) as string[];
      if (configured.length === 0) {
        throw new Error(`Host key verification is enabled for ${srv.host}, but hostKeySha256 is not configured.`);
      }
      config.hostVerifier = (key: Buffer) => {
        const fingerprint = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
        return configured.some((expected) => expected.replace(/=+$/, '') === fingerprint);
      };
    }
    return config;
  }

  private static shellEscape(value: string): string {
    return `'${String(value).replace(/'/g, `'"'"'`)}'`;
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
    
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let settled = false;
      const succeed = (value: T) => { if (!settled) { settled = true; resolve(value); } };
      const fail = (error: unknown) => { if (!settled) { settled = true; reject(error); } };

      const connect = () => {
        if (serverConfig.proxyJump) {
          const proxyConn = new Client();
          const pConfig = this.getBaseConnectConfig(serverConfig.proxyJump);
          
          proxyConn.on('ready', () => {
            logger.info(`Proxy connection ready to ${pConfig.host}`);
            proxyConn.forwardOut('127.0.0.1', 0, mainConfig.host!, mainConfig.port!, (err, stream) => {
              if (err) {
                proxyConn.end();
                return fail(new Error(`Proxy forwarding failed: ${err.message}`));
              }
              conn.connect({ ...mainConfig, sock: stream });
            });
          }).on('error', (err) => {
            proxyConn.end();
            fail(new Error(`Proxy connection error: ${err.message}`));
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
          succeed(result);
        } catch (err) {
          conn.end();
          fail(err);
        }
      }).on('error', (err: Error) => {
        logger.error(`SSH Connection Error:`, err);
        fail(err);
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
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      const finalCommand = cwd ? `cd -- ${this.shellEscape(cwd)} && ${command}` : command;

      const capture = (data: Buffer, chunks: Buffer[], currentBytes: number): { bytes: number; truncated: boolean } => {
        const remaining = MAX_OUTPUT_LENGTH - currentBytes;
        if (remaining <= 0) return { bytes: currentBytes, truncated: true };
        if (data.length > remaining) {
          chunks.push(data.subarray(0, remaining));
          return { bytes: MAX_OUTPUT_LENGTH, truncated: true };
        }
        chunks.push(data);
        return { bytes: currentBytes + data.length, truncated: false };
      };
      
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      conn.exec(finalCommand, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          return reject(err);
        }
        stream.on('error', (streamError: Error) => {
          clearTimeout(timeout);
          reject(streamError);
        }).on('close', (code: number, signal: string) => {
          clearTimeout(timeout);
          const marker = '\n\n[... Output truncated ...]';
          resolve({
            stdout: Buffer.concat(stdoutChunks).toString() + (stdoutTruncated ? marker : ''),
            stderr: Buffer.concat(stderrChunks).toString() + (stderrTruncated ? marker : ''),
            code, 
            signal,
            stdoutTruncated,
            stderrTruncated
          });
        }).on('data', (data: Buffer) => {
          const captured = capture(data, stdoutChunks, stdoutBytes);
          stdoutBytes = captured.bytes;
          stdoutTruncated ||= captured.truncated;
        }).stderr.on('data', (data: Buffer) => {
          const captured = capture(data, stderrChunks, stderrBytes);
          stderrBytes = captured.bytes;
          stderrTruncated ||= captured.truncated;
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
    remotePath: string,
    timeoutMs: number = 60000
  ): Promise<void> {
    return this.runSession(serverConfig, (conn) => {
      return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          const readStream = fs.createReadStream(path.resolve(localPath));
          const writeStream = sftp.createWriteStream(remotePath);
          let settled = false;
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            sftp.end();
            error ? reject(error) : resolve();
          };
          const timeout = setTimeout(() => {
            readStream.destroy();
            writeStream.destroy();
            finish(new Error(`Upload timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          writeStream.on('close', () => finish()).on('error', finish);
          readStream.on('error', finish);
          readStream.pipe(writeStream);
        });
      });
    });
  }

  public static async downloadFile(
    serverConfig: ServerConfig,
    remotePath: string,
    localPath: string,
    timeoutMs: number = 60000
  ): Promise<void> {
    return this.runSession(serverConfig, (conn) => {
      return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          const resolved = path.resolve(localPath);
          const tempPath = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${randomUUID()}.part`);
          let settled = false;
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            sftp.end();
            if (error) {
              fs.rmSync(tempPath, { force: true });
              reject(error);
              return;
            }
            try {
              fs.renameSync(tempPath, resolved);
              resolve();
            } catch (renameError) {
              fs.rmSync(tempPath, { force: true });
              reject(renameError);
            }
          };
          const timeout = setTimeout(() => finish(new Error(`Download timed out after ${timeoutMs}ms`)), timeoutMs);
          sftp.fastGet(remotePath, tempPath, (downloadError) => {
            finish(downloadError || undefined);
          });
        });
      });
    });
  }
}
