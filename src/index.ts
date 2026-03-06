#!/usr/bin/env node
import { MCPServer } from "./mcp.js";
import { ConfigManager } from "./config.js";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);

  // Check for version flag
  if (args.includes("-v") || args.includes("--version")) {
    try {
      const packageJsonPath = path.resolve(__dirname, "../package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      console.log(`v${packageJson.version}`);
    } catch (err) {
      console.log("unknown version");
    }
    process.exit(0);
  }

  try {
    // Find config path from args or env
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

