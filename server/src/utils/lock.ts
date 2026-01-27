// src/utils/lock.ts
import { logger } from "./logger";

interface LockInfo {
  acquired: Date;
  timeoutHandle: NodeJS.Timeout;
  operation: string;
}

export class LockManager {
  private locks: Map<string, LockInfo> = new Map();

  /**
   * Acquire a lock with automatic timeout
   */
  async acquire(
    key: string, 
    timeoutMs: number = 300000, 
    operation: string = "unknown"
  ): Promise<boolean> {
    if (this.locks.has(key)) {
      const lockInfo = this.locks.get(key)!;
      const duration = Date.now() - lockInfo.acquired.getTime();
      logger.warn(
        `[LOCK] ⏳ ${key} is busy (${operation}). ` +
        `Held by: ${lockInfo.operation} for ${Math.round(duration / 1000)}s`
      );
      return false;
    }

    const timeoutHandle = setTimeout(() => {
      if (this.locks.has(key)) {
        logger.error(
          `[LOCK] ⚠️ Force-releasing ${key} after ${timeoutMs}ms timeout. ` +
          `Operation: ${operation}`
        );
        this.release(key);
      }
    }, timeoutMs);

    this.locks.set(key, {
      acquired: new Date(),
      timeoutHandle,
      operation
    });

    logger.debug(`[LOCK] ✅ Acquired: ${key} (${operation})`);
    return true;
  }

  /**
   * Release a lock
   */
  release(key: string): void {
    const lockInfo = this.locks.get(key);
    if (lockInfo) {
      clearTimeout(lockInfo.timeoutHandle);
      this.locks.delete(key);
      logger.debug(`[LOCK] 🔓 Released: ${key}`);
    }
  }

  /**
   * Check if a key is locked
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Get lock info for debugging
   */
  getLockInfo(key: string): LockInfo | null {
    return this.locks.get(key) || null;
  }

  /**
   * Wait for a lock to be released (with timeout)
   */
  async waitForRelease(key: string, maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 500;

    while (this.isLocked(key)) {
      if (Date.now() - startTime > maxWaitMs) {
        logger.warn(`[LOCK] ⏱️ Timeout waiting for ${key} release`);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return true;
  }

  /**
   * Acquire with automatic retry
   */
  async acquireWithRetry(
    key: string,
    operation: string,
    maxRetries: number = 3,
    retryDelayMs: number = 2000
  ): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      if (await this.acquire(key, 300000, operation)) {
        return true;
      }
      
      if (i < maxRetries - 1) {
        logger.info(`[LOCK] 🔄 Retry ${i + 1}/${maxRetries} for ${key}`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
    return false;
  }
}

export const lockManager = new LockManager();