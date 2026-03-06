#!/usr/bin/env node
import { MCPServer } from './mcp.js';
import { ConfigManager } from './config.js';
import { logger } from './logger.js';

async function main() {
  try {
    const configPath = process.env.MCP_SSH_CONFIG || 'config.json';
    const configManager = new ConfigManager(configPath);
    
    const server = new MCPServer(configManager);
    await server.start();
  } catch (error) {
    logger.error('Failed to start MCP SSH server:', error);
    process.exit(1);
  }
}

main();
