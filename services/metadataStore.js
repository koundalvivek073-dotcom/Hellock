/**
 * ==============================================================================
 * HELLOCK: METADATA PERSISTENCE LAYER
 * ==============================================================================
 * `data/metadata.json` was the single source of truth for file records, node
 * status, and cluster stats. That only works on a host with a writable,
 * persistent filesystem. On Netlify/Vercel the function bundle is read-only and
 * reset on every cold start, so the metadata silently reset to defaults and
 * every uploaded file appeared to vanish.
 *
 * Backends, selected once at import time (override with HELLOCK_META_STORE):
 *
 *   1. "disk"          - data/metadata.json. Correct for `next start`, Docker,
 *      Render, Railway, a VPS.
 *   2. "netlify-blobs" - a single durable blob shared by every concurrent
 *      function instance. This is the serverless default.
 *   3. "memory"        - ephemeral fallback so a serverless deploy with no blob
 *      store still boots instead of throwing.
 *
 * Writes use a read-modify-write against a single serialized key, so the
 * existing per-file mutex in metadataService.js remains sufficient.
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { canUseLocalDisk, isServerless } from './runtime.js';

const requireFromHere = createRequire(import.meta.url);

const META_KEY = 'metadata.json';
const META_FILE = path.join(process.cwd(), 'data', 'metadata.json');

/* -------------------------------------------------------------------------- */
/* Disk backend with Distributed Snapshot Replication & Disaster Recovery     */
/* -------------------------------------------------------------------------- */

const STORAGE_NODES = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];
const NODES_BASE_DIR = path.join(process.cwd(), 'data', 'nodes');

function getSnapshotPaths() {
  return STORAGE_NODES.map(nodeId => ({
    nodeId,
    path: path.join(NODES_BASE_DIR, nodeId, '.metadata_snapshot.json')
  }));
}

async function recoverFromSnapshots() {
  let bestSnapshot = null;
  let bestRevision = -1;
  let bestSource = null;

  for (const item of getSnapshotPaths()) {
    try {
      if (fs.existsSync(item.path)) {
        const content = await fs.promises.readFile(item.path, 'utf-8');
        const parsed = JSON.parse(content);
        const rev = parsed._revision || 0;
        const fileCount = Object.keys(parsed.files || {}).length;

        // Pick snapshot with highest revision, or most files if revisions tie
        if (rev > bestRevision || (rev === bestRevision && (!bestSnapshot || fileCount > Object.keys(bestSnapshot.files || {}).length))) {
          bestSnapshot = parsed;
          bestRevision = rev;
          bestSource = item.nodeId;
        }
      }
    } catch (e) {
      // Ignore corrupted individual snapshot candidate
    }
  }

  if (bestSnapshot) {
    console.warn(`[METADATA_DISASTER_RECOVERY] Restored metadata from ${bestSource} snapshot (revision ${bestRevision})!`);
    try {
      await fs.promises.writeFile(META_FILE, JSON.stringify(bestSnapshot, null, 2));
    } catch (writeErr) {
      console.error('[METADATA_DISASTER_RECOVERY] Failed rewriting recovered metadata to META_FILE:', writeErr);
    }
    return bestSnapshot;
  }

  return null;
}

function createDiskMetaStore() {
  const ensure = () => {
    const dir = path.dirname(META_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(META_FILE)) {
      fs.writeFileSync(META_FILE, JSON.stringify({ files: {}, nodes: {}, stats: {}, _revision: 1, _lastUpdated: new Date().toISOString() }, null, 2));
    }
  };

  return {
    kind: 'disk',
    durable: true,
    async read() {
      ensure();
      try {
        const raw = await fs.promises.readFile(META_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // If file is valid JSON and has valid structure, return it
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (err) {
        console.error('[METADATA_ERR] Primary metadata.json is corrupted or unreadable. Initiating Disaster Recovery:', err.message);
      }

      // Trigger automatic Disaster Recovery from distributed storage node snapshots
      const recovered = await recoverFromSnapshots();
      if (recovered) return recovered;

      return null;
    },
    async write(data) {
      ensure();
      // Track atomic revision and timestamp for cluster consistency
      data._revision = (data._revision || 0) + 1;
      data._lastUpdated = new Date().toISOString();

      const serialized = JSON.stringify(data, null, 2);

      // 1. Atomic replace of primary metadata file
      const tmp = `${META_FILE}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await fs.promises.writeFile(tmp, serialized);
      try {
        await fs.promises.rename(tmp, META_FILE);
      } catch (renameErr) {
        // Windows fallback if rename conflicts
        await fs.promises.copyFile(tmp, META_FILE);
        await fs.promises.unlink(tmp).catch(() => {});
      }

      // 2. Replicate metadata snapshot across all active storage nodes (eliminates SPOF)
      for (const item of getSnapshotPaths()) {
        try {
          const nodeDir = path.dirname(item.path);
          if (fs.existsSync(nodeDir)) {
            await fs.promises.writeFile(item.path, serialized);
          }
        } catch (snapErr) {
          // Non-blocking snapshot replication failure
        }
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Netlify Blobs backend with Replicated Snapshot Backup                       */
/* -------------------------------------------------------------------------- */

const META_BACKUP_KEY = 'metadata_snapshot_backup.json';

function createBlobsMetaStore() {
  let blobs;
  try {
    blobs = requireFromHere('@netlify/blobs');
  } catch (e) {
    return null;
  }

  const getStore = () => blobs.getStore({ name: 'hellock-metadata', consistency: 'strong' });

  return {
    kind: 'netlify-blobs',
    durable: true,
    async read() {
      try {
        const entry = await getStore().get(META_KEY, { type: 'json' });
        if (entry) return entry;
      } catch (err) {
        console.error('[METADATA_ERR] Error reading metadata blob, checking replicated snapshot backup:', err);
      }

      // Disaster recovery fallback to replicated snapshot backup blob
      try {
        const backupEntry = await getStore().get(META_BACKUP_KEY, { type: 'json' });
        if (backupEntry) {
          console.warn('[METADATA_DISASTER_RECOVERY] Restored metadata from replicated Netlify Blob backup!');
          return backupEntry;
        }
      } catch (backupErr) {
        console.error('[METADATA_ERR] Backup metadata blob also unreadable:', backupErr);
      }

      return null;
    },
    async write(data) {
      data._revision = (data._revision || 0) + 1;
      data._lastUpdated = new Date().toISOString();
      await getStore().setJSON(META_KEY, data);
      // Replicate backup snapshot asynchronously
      getStore().setJSON(META_BACKUP_KEY, data).catch(() => {});
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Memory backend                                                             */
/* -------------------------------------------------------------------------- */

function createMemoryMetaStore() {
  let cache = null;
  return {
    kind: 'memory',
    durable: false,
    async read() {
      return cache ? JSON.parse(JSON.stringify(cache)) : null;
    },
    async write(data) {
      cache = JSON.parse(JSON.stringify(data));
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

function pickStore() {
  const forced = (process.env.HELLOCK_META_STORE || '').trim().toLowerCase();

  if (forced === 'memory') return createMemoryMetaStore();
  if (forced === 'disk' && canUseLocalDisk()) return createDiskMetaStore();
  if (forced === 'netlify-blobs') return createBlobsMetaStore() || createMemoryMetaStore();

  if (canUseLocalDisk()) return createDiskMetaStore();

  return createBlobsMetaStore() || createMemoryMetaStore();
}

const store = pickStore();

export const META_STORE_KIND = store.kind;
export const META_STORE_DURABLE = store.durable;

export function metaStoreInfo() {
  return { kind: store.kind, durable: store.durable, serverless: isServerless() };
}

export async function readMetadataRaw() {
  return store.read();
}

export async function writeMetadataRaw(data) {
  return store.write(data);
}
