import { Readable } from 'stream';
import {
  startAllNodes,
  NODE_CONFIGS,
  createNodeRequestHandler,
  setNodeFailure,
  isNodeFailed,
} from './microNodeServer.js';
import { resolveNodeUrl } from './nodeTopology.js';
import { microNodesEnabled, runtimeLabel } from './runtime.js';
import {
  blobUsage,
  isDurableStore,
  storeInfo,
} from './blobStore.js';

/**
 * ==============================================================================
 * HELLOCK: DISTRIBUTED STORAGE NODE SERVICE
 * ==============================================================================
 * Routes cluster physical I/O to 4 independent, isolated storage nodes. Each
 * node speaks the exact same tiny HTTP REST protocol (`/ping`, `/upload/:id`,
 * `/download/:id`, `/delete/:id`, `/files`, `/corrupt/:id`), but the transport
 * differs by runtime:
 *
 *   - Persistent host (local `next dev`, Docker, Render, Railway, VPS):
 *     real sockets on 127.0.0.1:4001-4004, started by microNodeServer.
 *   - Serverless (Netlify, Vercel): those ports cannot be bound or reached, so
 *     the very same handler runs in-process via a Request/Response shim. Callers
 *     see no behavioural difference; only the wire is gone.
 *
 * The node URL for each node is env-configurable (NODE_A_URL, NODE_HOST, ...),
 * so the cluster can also be split across real machines. See nodeTopology.js.
 *
 * Durability is handled by services/blobStore.js: disk on a persistent host,
 * Netlify Blobs on serverless.
 * ==============================================================================
 */

export const NODE_IDS = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];

// Auto-start the 4 microservices on a persistent runtime. No-op on serverless,
// where the in-process transport is used instead.
if (typeof window === 'undefined') {
  startAllNodes().catch((err) => console.error('[NODE_STORAGE] Node start error:', err));
}

export function getNodeBaseUrl(nodeId) {
  const cfg = NODE_CONFIGS[nodeId];
  if (!cfg) throw new Error(`[STORAGE_ERR] Unknown node ID: "${nodeId}"`);
  // Prefer the env-resolved advertised URL so remote nodes are reachable;
  // fall back to the resolved value if a config predates this field.
  return cfg.url || resolveNodeUrl(nodeId, cfg.port);
}

export function setSimulatedFailure(nodeId, isFailed) {
  setNodeFailure(nodeId, isFailed);
}

export function isSimulatedFailed(nodeId) {
  return isNodeFailed(nodeId);
}

/**
 * True when calls to this node should go out over a real socket. When false,
 * the in-process transport is used.
 */
export function useHttpTransport(nodeId) {
  if (!microNodesEnabled()) return false;
  const cfg = NODE_CONFIGS[nodeId];
  if (!cfg) return false;
  // An explicitly remote node (NODE_A_URL=...) always needs the wire.
  return !cfg.external;
}

/** Describes the active storage configuration for /api/status and /admin. */
export function storageRuntimeInfo() {
  return {
    runtime: runtimeLabel(),
    transport: microNodesEnabled() ? 'http-micro-node' : 'in-process',
    blobStore: storeInfo(),
    durable: isDurableStore(),
    nodes: Object.fromEntries(
      NODE_IDS.map((id) => [
        id,
        {
          url: getNodeBaseUrl(id),
          port: NODE_CONFIGS[id]?.port,
          external: Boolean(NODE_CONFIGS[id]?.external),
          transport: useHttpTransport(id) ? 'http' : 'in-process',
        },
      ])
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* In-process transport                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Minimal ServerResponse shim so a plain request handler can be invoked without
 * binding a socket. Implements only what the node handlers actually use.
 */
class InProcessResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.finished = false;
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  writeHead(status, headers) {
    this.statusCode = status;
    if (headers) this.headers = { ...this.headers, ...headers };
    return this;
  }

  write(chunk) {
    if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  }

  end(chunk) {
    if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    this.finished = true;
    return this;
  }

  body() {
    return Buffer.concat(this.chunks);
  }

  json() {
    try {
      return JSON.parse(this.body().toString('utf-8'));
    } catch (e) {
      return null;
    }
  }
}

/**
 * Invokes a node's HTTP handler directly, bypassing the network entirely.
 * @returns {Promise<{status:number, headers:object, body:Buffer}>}
 */
async function callNodeInProcess(nodeId, method, pathname, body) {
  const cfg = NODE_CONFIGS[nodeId];
  const handler = createNodeRequestHandler(nodeId, cfg?.port ?? 0);

  const req = Readable.from(body ? [Buffer.isBuffer(body) ? body : Buffer.from(body)] : []);
  req.method = method;
  req.url = pathname;
  req.headers = { host: 'in-process', 'content-type': 'application/octet-stream' };

  const res = new InProcessResponse();
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, body: res.body() };
}

function throwForStatus(nodeId, result, what) {
  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Node ${nodeId} ${what} failed with HTTP ${result.status}: ${result.body.toString('utf-8')}`
    );
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Public node operations                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Abstracted write operation to an individual storage node.
 * @param {string} nodeId - Target storage node ID ('nodeA', 'nodeB', 'nodeC', 'nodeD')
 * @param {string} fileId - Unique file identifier
 * @param {Buffer} buffer - File binary content
 */
export async function uploadToNode(nodeId, fileId, buffer) {
  if (isSimulatedFailed(nodeId)) {
    throw new Error(`[STORAGE_ERR] Node ${nodeId} is unreachable or partitioned (simulated failure).`);
  }

  const encoded = encodeURIComponent(fileId);
  const payload = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (!useHttpTransport(nodeId)) {
    const result = await callNodeInProcess(nodeId, 'POST', `/upload/${encoded}`, payload);
    throwForStatus(nodeId, result, 'write');
    return {
      nodeId,
      fileId,
      bytesWritten: payload.length,
      timestamp: new Date().toISOString(),
      provider: 'in-process-node',
    };
  }

  const url = `${getNodeBaseUrl(nodeId)}/upload/${encoded}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: payload,
      duplex: 'half',
      headers: { 'Content-Type': 'application/octet-stream' },
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Node ${nodeId} returned HTTP ${res.status}: ${errText}`);
    }

    return {
      nodeId,
      fileId,
      bytesWritten: payload.length,
      timestamp: new Date().toISOString(),
      provider: 'http-micro-node',
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`[TIMEOUT] Write to node ${nodeId} timed out after 4000ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Abstracted read operation from an individual storage node.
 * @returns {Promise<Buffer>}
 */
export async function readFromNode(nodeId, fileId) {
  if (isSimulatedFailed(nodeId)) {
    throw new Error(`[STORAGE_ERR] Node ${nodeId} is unreachable or partitioned (simulated failure).`);
  }

  const encoded = encodeURIComponent(fileId);

  if (!useHttpTransport(nodeId)) {
    const result = await callNodeInProcess(nodeId, 'GET', `/download/${encoded}`);
    if (result.status === 404) {
      throw new Error(`File ${fileId} not found on ${nodeId}`);
    }
    throwForStatus(nodeId, result, 'read');
    return result.body;
  }

  const url = `${getNodeBaseUrl(nodeId)}/download/${encoded}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Node ${nodeId} read failed with HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`[TIMEOUT] Read from node ${nodeId} timed out after 4000ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Abstracted delete operation on an individual storage node.
 */
export async function deleteFromNode(nodeId, fileId) {
  if (isSimulatedFailed(nodeId)) return;

  const encoded = encodeURIComponent(fileId);

  if (!useHttpTransport(nodeId)) {
    try {
      await callNodeInProcess(nodeId, 'DELETE', `/delete/${encoded}`);
    } catch (err) {
      /* best effort: a missing replica is not an error */
    }
    return;
  }

  try {
    await fetch(`${getNodeBaseUrl(nodeId)}/delete/${encoded}`, { method: 'DELETE' });
  } catch (err) {
    /* best effort */
  }
}

/**
 * Checks physical ping / network accessibility for a storage node.
 * @returns {Promise<boolean>}
 */
export async function pingNode(nodeId) {
  if (isSimulatedFailed(nodeId)) {
    return false;
  }

  if (!useHttpTransport(nodeId)) {
    try {
      const result = await callNodeInProcess(nodeId, 'GET', '/ping');
      return result.status >= 200 && result.status < 300;
    } catch (err) {
      return false;
    }
  }

  const url = `${getNodeBaseUrl(nodeId)}/ping`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Lists all fileIds present in an individual node's storage.
 * @returns {Promise<string[]>}
 */
export async function listNodeFiles(nodeId) {
  if (!useHttpTransport(nodeId)) {
    try {
      const result = await callNodeInProcess(nodeId, 'GET', '/files');
      if (result.status < 200 || result.status >= 300) return [];
      return result.json()?.files || [];
    } catch (err) {
      return [];
    }
  }

  try {
    const res = await fetch(`${getNodeBaseUrl(nodeId)}/files`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    return [];
  }
}

/**
 * Per-node disk/blob usage, reported on the /admin telemetry cards.
 * Asks the node itself (so the byte count comes from whichever backend that
 * node uses) and falls back to a local read if the node is unreachable.
 * @returns {Promise<{files:number, bytes:number}>}
 */
export async function getNodeUsage(nodeId) {
  try {
    if (!useHttpTransport(nodeId)) {
      return blobUsage(nodeId);
    }
    const res = await fetch(`${getNodeBaseUrl(nodeId)}/files`);
    if (res.ok) {
      const data = await res.json();
      return { files: (data.files || []).length, bytes: data.bytes || 0 };
    }
  } catch (err) {
    /* fall through to local read */
  }
  return blobUsage(nodeId);
}

/**
 * Demo feature: Intentionally corrupts bytes inside a replica on an individual
 * node to simulate silent bit rot, testing cryptographic SHA-256 self-healing.
 */
export async function corruptNodeFile(nodeId, fileId) {
  const encoded = encodeURIComponent(fileId);

  if (!useHttpTransport(nodeId)) {
    const result = await callNodeInProcess(nodeId, 'POST', `/corrupt/${encoded}`);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`File ${fileId} not found on ${nodeId}`);
    }
    return true;
  }

  const res = await fetch(`${getNodeBaseUrl(nodeId)}/corrupt/${encoded}`, { method: 'POST' });
  if (res.ok) return true;
  throw new Error(`File ${fileId} not found on ${nodeId}`);
}
