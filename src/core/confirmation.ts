import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";

export interface PendingAction {
  toolName: string;
  serverAlias: string;
  args: any;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING = 500;

export class ConfirmationManager {
  private pending = new Map<string, PendingAction>();

  public createPending(toolName: string, serverAlias: string, args: any): string {
    // Cleanup expired first
    this.cleanup();

    if (this.pending.size >= MAX_PENDING) {
      throw new Error("Too many pending confirmations. Please wait or confirm existing ones.");
    }

    const id = randomUUID();
    this.pending.set(id, {
      toolName,
      serverAlias,
      args,
      expiresAt: Date.now() + TTL_MS
    });

    logger.info(`Action pending confirmation [${id}]: ${toolName} on ${serverAlias}`);
    return id;
  }

  public validateAndPop(id: string, toolName: string, serverAlias: string, args: any): boolean {
    const action = this.pending.get(id);
    if (!action) return false;

    // Check expiration
    if (Date.now() > action.expiresAt) {
      this.pending.delete(id);
      return false;
    }

    // Verify consistency: tool, server and essential args must match
    const isToolMatch = action.toolName === toolName;
    const isServerMatch = action.serverAlias === serverAlias;
    
    // Deep compare essential args (excluding the confirmation fields themselves)
    const { confirmationId: _1, confirmExecution: _2, ...currentArgs } = args;
    const { confirmationId: _3, confirmExecution: _4, ...pendingArgs } = action.args;
    const isArgsMatch = JSON.stringify(currentArgs) === JSON.stringify(pendingArgs);

    if (isToolMatch && isServerMatch && isArgsMatch) {
      this.pending.delete(id); // Use once
      return true;
    }

    return false;
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, action] of this.pending.entries()) {
      if (now > action.expiresAt) {
        this.pending.delete(id);
      }
    }
  }
}

export const confirmationManager = new ConfirmationManager();
