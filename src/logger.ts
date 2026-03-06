import winston from 'winston';
import path from 'path';
import fs from 'fs';

let currentLogDir = process.env.MCP_SSH_LOG_DIR || 'logs';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-ssh' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export function updateLogTransports(logDir: string) {
  if (path.resolve(logDir) === path.resolve(currentLogDir)) {
    return;
  }
  
  currentLogDir = logDir;
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Remove existing file transports
  const fileTransports = logger.transports.filter(t => t instanceof winston.transports.File);
  fileTransports.forEach(t => logger.remove(t));

  // Add new file transports
  logger.add(new winston.transports.File({ 
    filename: path.join(logDir, 'error.log'), 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: path.join(logDir, 'mcp-ssh.log') 
  }));
  
  logger.info(`Log directory updated to: ${logDir}`);
}

// Initialize with default or env var
updateLogTransports(currentLogDir);
