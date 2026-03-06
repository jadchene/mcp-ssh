#!/usr/bin/env node
import { MCPServer } from "./mcp.js";
import { ConfigManager } from "./config.js";
import { logger } from "./logger.js";
import { VERSION } from "./version.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-v") || args.includes("--version")) {
    console.log(`v${VERSION}`);
    process.exit(0);
  }

  try {
    let configPath = process.env.MCP_SSH_CONFIG || "config.json";
    const configIdx = args.indexOf("--config");
    if (configIdx !== -1 && args[configIdx + 1]) {
      configPath = args[configIdx + 1];
    }

    const configManager = new ConfigManager(configPath);
    const server = new MCPServer(configManager);
    await server.start();
  } catch (error) {
    logger.error("Failed to start MCP SSH server:", error);
    process.exit(1);
  }
}

main();

