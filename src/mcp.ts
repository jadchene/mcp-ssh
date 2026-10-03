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

export class MCPServer {
  private server: Server;
  private handlers: ToolHandlers;
  private shuttingDown = false;

  constructor(private configManager: ConfigManager) {
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
    });
    this.setupHandlers();

    this.server.onerror = (error) => logger.error("[MCP Error]", error);
    const shutdown = () => void this.shutdown();
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = request.params.arguments ?? {};
      const target = typeof args.serverAlias === 'string' ? this.configManager.getServerConfig(args.serverAlias) : undefined;
      const warning = target?.dangerMode === true ? FULL_ACCESS_WARNING : undefined;
      try {
        logger.info(`Handling tool call: ${request.params.name}`, {
          argumentKeys: Object.keys(args),
          serverAlias: typeof args.serverAlias === 'string' ? args.serverAlias : undefined
        });
        const clientInfo = request.params._meta?.["io.modelcontextprotocol/clientInfo"] ?? this.server.getClientVersion();
        const result = await this.handlers.handleTool(request.params.name, args, clientInfo);
        
        // Ensure the result is a string for the MCP "text" content type
        const textOutput = warning
          ? JSON.stringify(typeof result === 'object' && result !== null && !Array.isArray(result)
            ? { ...result, warning } : { result, warning })
          : typeof result === "string" ? result : JSON.stringify(result);

        return {
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
              text: warning ? JSON.stringify({ error: error.message, warning }) : `Error: ${error.message}`,
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
    try {
      await this.server.close();
    } finally {
      this.configManager.close();
      process.exitCode = 0;
    }
  }
}
