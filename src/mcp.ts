import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolDefinitions } from "./tools/definitions.js";
import { ToolHandlers } from "./tools/handlers.js";
import { ConfigManager } from "./config.js";
import { logger } from "./logger.js";
import { NAME, VERSION } from "./version.js";
import { buildCodexApprovalMeta } from "./codex-approval.js";
import { FULL_ACCESS_WARNING } from "./danger-mode.js";
import { SessionError } from './session-error.js';
import type { SessionPool } from './sessions.js';

export class MCPServer {
  private server: Server;
  private handlers: ToolHandlers;
  private shuttingDown = false;
  /** 关闭资源一次，兼顾信号及传输断开。 */
  private resourcesClosed = false;
  /** 可移除的进程信号处理器。 */
  private shutdownListener = () => { void this.shutdown(); };

  constructor(private configManager: ConfigManager, sessions?: SessionPool) {
    this.server = new Server(
      {
        name: NAME,
        version: VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.handlers = new ToolHandlers(configManager, async (preview) => {
      const clientCapabilities = this.server.getClientCapabilities();
      if (!clientCapabilities?.elicitation) {
        return 'unavailable';
      }

      const approvalMeta = preview.codexAutoReview ? buildCodexApprovalMeta(
        preview.clientInfo ?? this.server.getClientVersion(), preview.tool, preview.arguments, preview.message,
        preview.riskLevel !== 'normal'
      ) : undefined;
      const result = await this.server.elicitInput({
        mode: 'form',
        message: preview.message,
        requestedSchema: {
          type: 'object',
          properties: {}
        },
        ...(approvalMeta ? { _meta: approvalMeta } : {})
      });

      return result.action === 'accept'
        ? 'yes'
        : 'no';
    }, sessions);
    this.setupHandlers();

    this.server.onerror = (error) => logger.error("[MCP Error]", error);
    this.server.onclose = () => this.closeResources();
    process.once("SIGINT", this.shutdownListener);
    process.once("SIGTERM", this.shutdownListener);
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = request.params.arguments ?? {};
      const serverAlias = typeof args.serverAlias === 'string' ? args.serverAlias : typeof args.sessionId === 'string' ? this.handlers.getSessionServerAlias(args.sessionId) : undefined;
      const target = serverAlias ? this.configManager.getServerConfig(serverAlias) : undefined;
      const warning = target?.dangerMode === true ? FULL_ACCESS_WARNING : undefined;
      try {
        logger.info(`Handling tool call: ${request.params.name}`, {
          argumentKeys: Object.keys(args),
          serverAlias
        });
        const clientInfo = request.params._meta?.["io.modelcontextprotocol/clientInfo"] ?? this.server.getClientVersion();
        const result = await this.handlers.handleTool(request.params.name, args, clientInfo);
        
        // Ensure the result is a string for the MCP "text" content type
        const textOutput = warning
          ? JSON.stringify(typeof result === 'object' && result !== null && !Array.isArray(result)
            ? { ...result, warning } : { result, warning })
          : typeof result === "string" ? result : JSON.stringify(result);

        return {
          ...(typeof result === 'object' && result !== null && !Array.isArray(result) ? { structuredContent: warning ? { ...result, warning } : result } : {}),
          content: [
            {
              type: "text",
              text: textOutput,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Tool execution error: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: warning || error instanceof SessionError ? JSON.stringify({ error: error.message,
                ...(error instanceof SessionError ? { code: error.code, reason: error.reason } : {}),
                ...(warning ? { warning } : {}) }) : `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("MCP SSH Server running on stdio");
  }

  private async shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.closeResources();
    try {
      await this.server.close();
    } finally {
      process.exitCode = 0;
    }
  }

  /** 传输关闭时清理会话、配置监听和信号处理器。 */
  private closeResources(): void {
    if (this.resourcesClosed) return;
    this.resourcesClosed = true;
    this.handlers.close();
    this.configManager.close();
    process.removeListener('SIGINT', this.shutdownListener);
    process.removeListener('SIGTERM', this.shutdownListener);
  }
}
