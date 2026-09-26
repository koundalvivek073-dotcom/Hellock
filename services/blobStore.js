/**
 * ==============================================================================
 * HELLOCK: DURABLE BLOB LAYER
 * ==============================================================================
 * Every storage node ultimately needs a place to put bytes. Historically that
 * was always `data/nodes/<nodeId>/` on local disk, which works on a persistent
 * host but silently loses data on Netlify/Vercel (read-only bundle, wiped on
 * every cold start).
 *
 * This module picks the best available backend ONCE, at import time:
 *
 *   1. "disk"          - the local filesystem. Correct for `next start`,
 *      Docker, Render, Railway, a VPS.
 *   2. "netlify-blobs" - @netlify/blobs, durable and shared across all
 *      concurrent function instances. Used on serverless, where the bundle's
 *      filesystem is read-only and reset on every cold start.
 *   3. "memory"        - last-resort ephemeral map, so a serverless deploy with
 *      no blob store configured still functions (warm invocations) instead of
 *      erroring out. /api/status reports `durable: false` in this case.
 *
 * Nothing above this module knows which backend won.
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { canUseLocalDisk, isServerless } from './runtime.js';

const requireFromHere = createRequire(import.meta.url);

/* -------------------------------------------------------------------------- */
/* Filesystem backend                                                          */
/* -------------------------------------------------------------------------- */

function createDiskStore(baseDir) {
  const dirFor = (nodeId) => path.join(baseDir, nodeId);

  const ensure = (nodeId) => {
    const dir = dirFor(nodeId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  return {
    kind: 'disk',
    durable: true,
    async write(nodeId, fileId, buffer) {
      await fs.promises.writeFile(path.join(ensure(nodeId), fileId), buffer);
    },
    async read(nodeId, fileId) {
      const filePath = path.join(dirFor(nodeId), fileId);
      if (!fs.existsSync(filePath)) return null;
      return fs.promises.readFile(filePath);
    },
    async remove(nodeId, fileId) {
      const filePath = path.join(dirFor(nodeId), fileId);
      if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
    },
    async list(nodeId) {
      const dir = dirFor(nodeId);
      if (!fs.existsSync(dir)) return [];
      const entries = await fs.promises.readdir(dir);
      return entries.filter((f) => !f.startsWith('.'));
    },
    async usage(nodeId) {
      const dir = dirFor(nodeId);
      if (!fs.existsSync(dir)) return { files: 0, bytes: 0 };
      const entries = (await fs.promises.readdir(dir)).filter((f) => !f.startsWith('.'));
      let bytes = 0;
      for (const entry of entries) {
        try {
          bytes += (await fs.promises.stat(path.join(dir, entry))).size;
        } catch (e) {
          /* file vanished mid-scan; ignore */
        }
      }
      return { files: entries.length, bytes };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Netlify Blobs backend                                                       */
/* -------------------------------------------------------------------------- */

function createBlobsStore() {
  let blobs;
  try {
    // Optional peer dependency; absent unless `npm i @netlify/blobs` was run.
    blobs = requireFromHere('@netlify/blobs');
  } catch (e) {
    return null;
  }

  const getStore = (nodeId) =>
    blobs.getStore({ name: `hellock-node-${nodeId}`, consistency: 'strong' });

  return {
    kind: 'netlify-blobs',
    durable: true,
    async write(nodeId, fileId, buffer) {
      await getStore(nodeId).set(fileId, buffer, { type: 'application/octet-stream' });
    },
    async read(nodeId, fileId) {
      const entry = await getStore(nodeId).get(fileId, { type: 'buffer' });
      if (!entry) return null;
      return Buffer.isBuffer(entry) ? entry : Buffer.from(entry);
    },
    async remove(nodeId, fileId) {
      try {
        await getStore(nodeId).delete(fileId);
      } catch (e) {
        /* already gone */
      }
    },
    async list(nodeId) {
      const out = [];
      try {
        for await (const entry of getStore(nodeId).list()) out.push(entry.key);
      } catch (e) {
        return out;
      }
      return out;
    },
    async usage(nodeId) {
      let files = 0;
      let bytes = 0;
      try {
        for await (const entry of getStore(nodeId).list()) {
          files += 1;
          bytes += entry.size || 0;
        }
      } catch (e) {
        /* partial stats are fine */
      }
      return { files, bytes };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* In-memory backend                                                           */
/* -------------------------------------------------------------------------- */

function createMemoryStore() {
  const map = new Map();
  const bucket = (nodeId) => {
    if (!map.has(nodeId)) map.set(nodeId, new Map());
    return map.get(nodeId);
  };

  return {
    kind: 'memory',
    durable: false,
    async write(nodeId, fileId, buffer) {
      bucket(nodeId).set(fileId, Buffer.from(buffer));
    },
    async read(nodeId, fileId) {
      const value = bucket(nodeId).get(fileId);
      return value ? Buffer.from(value) : null;
    },
    async remove(nodeId, fileId) {
      bucket(nodeId).delete(fileId);
    },
    async list(nodeId) {
      return Array.from(bucket(nodeId).keys());
    },
    async usage(nodeId) {
      const entries = bucket(nodeId);
      let bytes = 0;
      for (const value of entries.values()) bytes += value.length;
      return { files: entries.size, bytes };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

function pickStore() {
  const forced = (process.env.HELLOCK_BLOB_STORE || '').trim().toLowerCase();
  const diskDir = path.join(process.cwd(), 'data', 'nodes');

  if (forced === 'memory') return createMemoryStore();
  if (forced === 'disk' && canUseLocalDisk()) return createDiskStore(diskDir);
  if (forced === 'netlify-blobs') return createBlobsStore() || createMemoryStore();

  if (canUseLocalDisk()) return createDiskStore(diskDir);

  return createBlobsStore() || createMemoryStore();
}

// Singleton for the lifetime of the process / warm lambda container.
const store = pickStore();

export const BLOB_STORE_KIND = store.kind;
export const BLOB_STORE_DURABLE = store.durable;

export function isDurableStore() {
  return store.durable;
}

export function storeInfo() {
  return { kind: store.kind, durable: store.durable, serverless: isServerless() };
}

export async function putBlob(nodeId, fileId, buffer) {
  await store.write(nodeId, fileId, buffer);
}

export async function getBlob(nodeId, fileId) {
  return store.read(nodeId, fileId);
}

export async function deleteBlob(nodeId, fileId) {
  await store.remove(nodeId, fileId);
}

export async function listBlobs(nodeId) {
  return store.list(nodeId);
}

export async function blobUsage(nodeId) {
  return store.usage(nodeId);
}
