/**
 * 按 Codex 0.160.0 的私有约定构造审批元数据，不改变服务端权限校验。
 * @author chenjd
 * @created 2026-10-02 22:15:29
 */
export function buildCodexApprovalMeta(
  clientInfo: unknown,
  toolName: string,
  toolParams: Record<string, unknown>,
  description: string,
  sensitive = false
): Record<string, unknown> | undefined {
  if (typeof clientInfo !== "object" || clientInfo === null || Array.isArray(clientInfo)) {
    return undefined;
  }
  const name = (clientInfo as Record<string, unknown>).name;
  if (typeof name !== "string" || !/^codex(?:$|[-_])/i.test(name.trim())) {
    return undefined;
  }
  return {
    codex_request_type: "approval_request",
    codex_approval_kind: "mcp_tool_call",
    codex_strict_auto_review: true,
    ...(sensitive ? { codex_sensitive_action: true } : {}),
    tool_name: toolName,
    tool_description: description,
    tool_params: structuredClone(toolParams)
  };
}
