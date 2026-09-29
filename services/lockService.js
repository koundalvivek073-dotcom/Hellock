import { Mutex } from 'async-mutex';
import fs from 'fs';
import path from 'path';
import { canUseLocalDisk } from './runtime.js';

const LOCKS_DIR = path.join(process.cwd(), 'data', '.locks');
const STALE_LOCK_TIMEOUT_MS = 15000;
const MAX_LOCK_WAIT_MS = 8000;

function ensureLocksDir() {
  if (!fs.existsSync(LOCKS_DIR)) {
    try {
      fs.mkdirSync(LOCKS_DIR, { recursive: true });
    } catch (_) {}
  }
}

function sanitizeId(fileId) {
  return String(fileId || 'lock').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * FileLockService ensures that simultaneous writes/updates to the same file
 * are serialized and queued using per-file mutexes and cross-process filesystem locks,
 * preventing race conditions and corrupted versioning during concurrent uploads or recovery operations.
 */
class LockService {
  constructor() {
    this.mutexMap = new Map();
  }

  /**
   * Retrieves or creates a mutex for a specific fileId.
   * @param {string} fileId 
   * @returns {Mutex}
   */
  getMutex(fileId) {
    if (!this.mutexMap.has(fileId)) {
      this.mutexMap.set(fileId, new Mutex());
    }
    return this.mutexMap.get(fileId);
  }

  /**
   * Acquires a cross-process filesystem lock if local disk is available.
   * @param {string} fileId 
   * @returns {Promise<() => Promise<void>>} Release function
   */
  async acquireFsLock(fileId) {
    if (!canUseLocalDisk()) {
      return async () => {};
    }

    ensureLocksDir();
    const lockPath = path.join(LOCKS_DIR, `${sanitizeId(fileId)}.lock`);
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_LOCK_WAIT_MS) {
      try {
        const payload = JSON.stringify({ pid: process.pid, time: Date.now(), fileId });
        await fs.promises.writeFile(lockPath, payload, { flag: 'wx' });
        
        // Return release handle
        return async () => {
          try {
            await fs.promises.unlink(lockPath);
          } catch (_) {}
        };
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Check for stale lock
          try {
            const raw = await fs.promises.readFile(lockPath, 'utf-8');
            const data = JSON.parse(raw);
            if (Date.now() - (data.time || 0) > STALE_LOCK_TIMEOUT_MS) {
              await fs.promises.unlink(lockPath).catch(() => {});
              continue;
            }
          } catch (_) {
            // Unreadable lock file, clean up and retry
            await fs.promises.unlink(lockPath).catch(() => {});
            continue;
          }

          // Backoff before next attempt
          await new Promise(r => setTimeout(r, 60 + Math.random() * 40));
        } else {
          // Non-critical FS error, proceed with in-memory lock only
          return async () => {};
        }
      }
    }

    // Fallback if timeout reached: proceed with in-process lock to avoid permanent deadlock
    return async () => {
      try { await fs.promises.unlink(lockPath); } catch (_) {}
    };
  }

  /**
   * Runs an asynchronous callback while holding an exclusive lock for fileId
   * across both local thread mutex and cross-process filesystem locks.
   * @template T
   * @param {string} fileId 
   * @param {() => Promise<T>} callback 
   * @returns {Promise<T>}
   */
  async withLock(fileId, callback) {
    const mutex = this.getMutex(fileId);
    return await mutex.runExclusive(async () => {
      const releaseFsLock = await this.acquireFsLock(fileId);
      try {
        return await callback();
      } finally {
        await releaseFsLock();
      }
    });
  }

  /**
   * Checks if a file write lock is currently busy.
   * @param {string} fileId 
   * @returns {boolean}
   */
  isLocked(fileId) {
    const mutex = this.mutexMap.get(fileId);
    if (mutex && mutex.isLocked()) return true;

    if (canUseLocalDisk()) {
      const lockPath = path.join(LOCKS_DIR, `${sanitizeId(fileId)}.lock`);
      return fs.existsSync(lockPath);
    }

    return false;
  }
}

// Global singleton instance across Next.js API calls
const globalLockService = global._vaultLockService || new LockService();
if (process.env.NODE_ENV !== 'production') {
  global._vaultLockService = globalLockService;
}

export default globalLockService;
