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
/* Disk backend                                                                */
/* -------------------------------------------------------------------------- */

function createDiskMetaStore() {
  const ensure = () => {
    const dir = path.dirname(META_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(META_FILE)) {
      fs.writeFileSync(META_FILE, JSON.stringify({ files: {}, nodes: {}, stats: {} }, null, 2));
    }
  };

  return {
    kind: 'disk',
    durable: true,
    async read() {
      ensure();
      try {
        const raw = await fs.promises.readFile(META_FILE, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.error('[METADATA_ERR] Error reading metadata.json:', err);
        return null;
      }
    },
    async write(data) {
      ensure();
      // Atomic replace: write a temp file then rename, so a crash mid-write
      // cannot truncate the cluster's source of truth.
      const tmp = `${META_FILE}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.promises.rename(tmp, META_FILE);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Netlify Blobs backend                                                       */
/* -------------------------------------------------------------------------- */

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
        return entry ?? null;
      } catch (err) {
        console.error('[METADATA_ERR] Error reading metadata blob:', err);
        return null;
      }
    },
    async write(data) {
      await getStore().setJSON(META_KEY, data);
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
