/** 会话生命周期错误，供工具返回稳定错误码。
 * @author chenjd
 * @created 2026-10-12 14:00:00
 */
export class SessionError extends Error {
  /** 初始化错误码及可选失效原因。 */
  constructor(public readonly code: string, message: string, public readonly reason?: string) {
    super(message);
    this.name = 'SessionError';
  }
}
