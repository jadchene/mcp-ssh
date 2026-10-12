import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { ClientChannel } from 'ssh2';
import type { CommandResult } from './ssh.js';
import { SessionError } from './session-error.js';

/** 单次操作的流解析状态。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
interface OutputFrame {
  /** 尚未完成解析的字节。 */
  pending: Buffer;
  /** 已捕获的有限输出。 */
  chunks: Buffer[];
  /** 已捕获字节数。 */
  size: number;
  /** 已识别开始标记。 */
  started: boolean;
  /** 已识别结束标记。 */
  ended: boolean;
  /** 输出是否截断。 */
  truncated: boolean;
}

/** 当前执行的命令及完成回调。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
interface PendingCommand {
  /** 随机帧标识，不跨命令复用。 */
  token: string;
  /** 标准输出和错误流的解析状态。 */
  frames: [OutputFrame, OutputFrame];
  /** 解析到的退出码。 */
  code: number | null;
  /** 内部只读查询不覆盖上一条用户命令的退出状态。 */
  preserveStatus: boolean;
  /** 操作截止定时器。 */
  timer: NodeJS.Timeout;
  /** 成功回调。 */
  resolve: (value: CommandResult) => void;
  /** 失败回调。 */
  reject: (error: Error) => void;
}

/** 在同一个 POSIX 兼容 Shell 中逐条执行命令，保留变量、函数及目录。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
export class PersistentShell extends EventEmitter {
  /** 当前操作，仅允许一个。 */
  private pending?: PendingCommand;
  /** 关闭后不允许重建 Shell。 */
  public closed = false;
  /** 实际发送到 Shell 的操作数量，用于避免无效请求刷新空闲期限。 */
  public executions = 0;
  /** 用户命令的最后退出状态，协议输出不得覆盖。 */
  private previousStatus = 0;
  /** 临时状态恢复函数名，不碰用户定义的固定名字。 */
  private readonly statusFunction = `__mcp_restore_${randomUUID().replace(/-/g, '')}`;

  /** 注册流事件；初始化由 initialize 完成。 */
  constructor(private readonly stream: ClientChannel) {
    super();
    stream.on('data', (data: Buffer) => this.consume(0, data));
    stream.stderr.on('data', (data: Buffer) => this.consume(1, data));
    stream.on('error', () => this.close('shell_lost'));
    stream.on('end', () => this.close('shell_exited'));
    stream.on('close', () => this.close('shell_exited'));
  }

  /** 转义命令文本，使 eval 在当前 Shell 执行而不展开传输内容。 */
  private quote(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
  }

  /** 建立专用协议输出描述符并确认 Shell 可以执行协议。 */
  public async initialize(timeoutMs: number): Promise<void> {
    this.stream.write('exec 3>&1 4>&2\n');
    const result = await this.execute(':', undefined, timeoutMs);
    if (result.code !== 0) {
      this.close('shell_initialization_failed');
      throw new SessionError('CONNECTION_FAILED', 'Persistent POSIX shell initialization failed.');
    }
  }

  /** 在当前 Shell 执行；cwd 切换成功后对后续调用持续生效。 */
  public execute(command: string, cwd?: string, timeoutMs = 60000, preserveStatus = false): Promise<CommandResult> {
    if (this.closed) return Promise.reject(new SessionError('SESSION_EXPIRED', 'Session expired; call connect explicitly.', 'shell_exited'));
    if (this.pending) return Promise.reject(new SessionError('SESSION_BUSY', 'Session is executing another operation.'));
    if (command.includes('\0') || cwd?.includes('\0')) return Promise.reject(new Error('Shell arguments cannot contain NUL bytes.'));
    const token = randomUUID().replace(/-/g, '');
    const statusVariable = `__mcp_status_${token}`;
    const payload = cwd ? `cd -- ${this.quote(cwd)} && ${command}` : command;
    return new Promise((resolve, reject) => {
      const makeFrame = (): OutputFrame => ({ pending: Buffer.alloc(0), chunks: [], size: 0, started: false, ended: false, truncated: false });
      const timer = setTimeout(() => {
        this.close('operation_timeout', new SessionError('OPERATION_TIMEOUT', `Operation timed out after ${timeoutMs}ms; session is invalid. Remote processes may still be running.`, 'operation_timeout'));
      }, timeoutMs);
      this.pending = { token, frames: [makeFrame(), makeFrame()], code: null, preserveStatus, timer, resolve, reject };
      this.executions++;
      // 输入重定向仅作用于本次 eval，避免命令吞掉后续协议行；不创建子 Shell。
      const script = `command printf '\\036${token}:BEGIN\\037' >&3\n` +
        `command printf '\\036${token}:BEGIN\\037' >&4\n` +
        `${this.statusFunction}() { return ${this.previousStatus}; }\n` +
        `if ${this.statusFunction}; then\n` +
        `eval ${this.quote(payload)} </dev/null\n` +
        `else\n` +
        `eval ${this.quote(payload)} </dev/null\n` +
        `fi\n` +
        `${statusVariable}=$?\n` +
        `command printf '\\036${token}:END:%s\\037' "$${statusVariable}" >&3\n` +
        `command printf '\\036${token}:END\\037' >&4\n` +
        `unset ${statusVariable}\n` +
        `unset -f ${this.statusFunction}\n`;
      this.stream.write(script, (error?: Error | null) => { if (error) this.close('shell_lost'); });
    });
  }

  /** 有上限地捕获输出，协议尾部仍继续解析。 */
  private capture(frame: OutputFrame, data: Buffer): void {
    const remaining = 30000 - frame.size;
    if (data.length > remaining) frame.truncated = true;
    if (remaining > 0) {
      const chunk = data.subarray(0, remaining);
      frame.chunks.push(chunk);
      frame.size += chunk.length;
    }
  }

  /** 从任意分块中识别两个流各自的开始、结束和退出码。 */
  private consume(index: 0 | 1, data: Buffer): void {
    const operation = this.pending;
    if (!operation) return;
    const frame = operation.frames[index];
    if (frame.ended) return;
    frame.pending = Buffer.concat([frame.pending, data]);
    const begin = Buffer.from(`\x1e${operation.token}:BEGIN\x1f`);
    const end = Buffer.from(`\x1e${operation.token}:END${index === 0 ? ':' : '\x1f'}`);
    if (!frame.started) {
      const position = frame.pending.indexOf(begin);
      if (position < 0) {
        frame.pending = frame.pending.subarray(Math.max(0, frame.pending.length - begin.length + 1));
        return;
      }
      frame.started = true;
      frame.pending = frame.pending.subarray(position + begin.length);
    }
    const position = frame.pending.indexOf(end);
    if (position < 0) {
      const safeLength = Math.max(0, frame.pending.length - end.length + 1);
      this.capture(frame, frame.pending.subarray(0, safeLength));
      frame.pending = frame.pending.subarray(safeLength);
      return;
    }
    this.capture(frame, frame.pending.subarray(0, position));
    frame.pending = frame.pending.subarray(position + end.length);
    if (index === 0) {
      // 退出码可能和标记分处不同数据块，保留完整前缀再继续解析。
      const stop = frame.pending.indexOf(0x1f);
      if (stop < 0) {
        frame.pending = Buffer.concat([end, frame.pending]);
        if (frame.pending.length > end.length + 16) this.close('shell_protocol_error');
        return;
      }
      const status = frame.pending.subarray(0, stop).toString();
      if (!/^\d{1,3}$/.test(status)) { this.close('shell_protocol_error'); return; }
      operation.code = Number(status);
    }
    frame.pending = Buffer.alloc(0);
    frame.ended = true;
    if (!operation.frames.every((value) => value.ended)) return;
    clearTimeout(operation.timer);
    this.pending = undefined;
    if (!operation.preserveStatus) this.previousStatus = operation.code ?? 0;
    const output = (value: OutputFrame) => Buffer.concat(value.chunks).toString('utf8') + (value.truncated ? '\n\n[... Output truncated ...]' : '');
    operation.resolve({ stdout: output(operation.frames[0]), stderr: output(operation.frames[1]), code: operation.code, signal: null,
      stdoutTruncated: operation.frames[0].truncated, stderrTruncated: operation.frames[1].truncated });
  }

  /** 失效时拒绝等待中的命令并关闭通道，不进行重连。 */
  public close(reason = 'disconnected', error?: Error): void {
    if (this.closed) return;
    this.closed = true;
    const operation = this.pending;
    this.pending = undefined;
    if (operation) {
      clearTimeout(operation.timer);
      operation.reject(error ?? new SessionError('SESSION_EXPIRED', 'Session expired; call connect explicitly. Remote processes may still be running.', reason));
    }
    this.stream.destroy();
    this.emit('invalid', reason);
  }
}
