import { Mutex } from 'async-mutex';

/**
 * FileLockService ensures that simultaneous writes/updates to the same file
 * are serialized and queued using per-file mutexes, preventing race conditions
 * and corrupted versioning during concurrent uploads or recovery operations.
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
   * Runs an asynchronous callback while holding an exclusive lock for fileId.
   * @template T
   * @param {string} fileId 
   * @param {() => Promise<T>} callback 
   * @returns {Promise<T>}
   */
  async withLock(fileId, callback) {
    const mutex = this.getMutex(fileId);
    return await mutex.runExclusive(callback);
  }

  /**
   * Checks if a file write lock is currently busy.
   * @param {string} fileId 
   * @returns {boolean}
   */
  isLocked(fileId) {
    const mutex = this.mutexMap.get(fileId);
    return mutex ? mutex.isLocked() : false;
  }
}

// Global singleton instance across Next.js API calls
const globalLockService = global._vaultLockService || new LockService();
if (process.env.NODE_ENV !== 'production') {
  global._vaultLockService = globalLockService;
}

export default globalLockService;
