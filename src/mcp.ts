import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { toolDefinitions } from './tools/definitions.js';
import { ToolHandlers } from './tools/handlers.js';
import { ConfigManager } from './config.js';
import { logger } from './logger.js';

export class MCPServer {
  private server: Server;
  private handlers: ToolHandlers;

  constructor(configManager: ConfigManager) {
    this.server = new Server(
      {
        name: 'mcp-ssh',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.handlers = new ToolHandlers(configManager);
    this.setupHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (!request.params.arguments) {
          throw new Error('No arguments provided');
        }
        logger.info(`Handling tool call: ${request.params.name}`, request.params.arguments);
        const result = await this.handlers.handleTool(request.params.name, request.params.arguments);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Tool execution error: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
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
    logger.info('MCP SSH Server running on stdio');
  }
}
