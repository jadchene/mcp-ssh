#!/usr/bin/env node
import { ConfigWebServer } from "./web-config/server.js";
import { parseWebArgs } from "./web-config/options.js";
import { resolve } from "node:path";
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

  let web: ConfigWebServer | undefined;
  let configManager: ConfigManager | undefined;
  try {
    parseWebArgs(args);
    let configPath = process.env.MCP_SSH_CONFIG || "config.json";
    const configIdx = args.indexOf("--config");
    if (configIdx !== -1 && args[configIdx + 1]) {
      configPath = args[configIdx + 1];
    }

    configPath = resolve(configPath);
    configManager = new ConfigManager(configPath);
    web = new ConfigWebServer({
      project: "ssh", configPath, args, defaultPort: 3101,
      validate: raw => configManager!.validateRaw(raw), reload: () => configManager!.reload()
    });
    await web.start();
    const server = new MCPServer(configManager, undefined, () => { void web?.close(); });
    await server.start();
  } catch (error) {
    await web?.close();
    configManager?.close();
    logger.error("Failed to start MCP SSH server:", error);
    process.exit(1);
  }
}

main();

