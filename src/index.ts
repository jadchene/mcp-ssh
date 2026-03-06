#!/usr/bin/env node
import { MCPServer } from "./mcp.js";
import { ConfigManager } from "./config.js";
import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findPackageJson(startDir: string): string | null {
  let current = startDir;
  while (current !== path.parse(current).root) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) return pkgPath;
    current = path.dirname(current);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-v") || args.includes("--version")) {
    const pkgPath = findPackageJson(__dirname);
    if (pkgPath) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        console.log(`v${pkg.version}`);
        process.exit(0);
      } catch (e) {}
    }
    console.log("unknown version");
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

