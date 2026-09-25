import fs from 'fs';
import path from 'path';
import { startAllNodes, NODE_CONFIGS, setNodeFailure, isNodeFailed } from './microNodeServer.js';
import { resolveNodeUrl } from './nodeTopology.js';

/**
 * ==============================================================================
 * HELLOCK: DISTRIBUTED STORAGE NODE SERVICE (HTTP REST CLUSTER)
 * ==============================================================================
 * Routes cluster physical I/O to 4 independent, isolated HTTP micro-nodes.
 * By default they all live on 127.0.0.1 (4001-4004), but every node URL is now
 * env-configurable — set NODE_A_URL / NODE_HOST / NODE_BIND_HOST to split the
 * cluster across real machines or containers. See services/nodeTopology.js.
 *
 * 100% Free, Zero Cloud Setup, No Credit Cards, Completely Offline-Resilient.
 * Provides authentic HTTP REST networking, socket timeouts, and process failure
 * simulation for high-impact hackathon demonstrations.
 * ==============================================================================
 */

export const NODE_IDS = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];
const BASE_NODES_DIR = path.join(process.cwd(), 'data', 'nodes');

// Auto-start the 4 microservices on module evaluation in Node runtime
if (typeof window === 'undefined') {
  startAllNodes().catch(err => console.error('[NODE_STORAGE] Node start error:', err));
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

export function ensureStorageDirs() {
  for (const nodeId of NODE_IDS) {
    const dir = path.join(BASE_NODES_DIR, nodeId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Abstracted write operation to an individual HTTP storage node.
 * Sends binary payload via HTTP POST to the node's dedicated port.
 * 
 * @param {string} nodeId - Target storage node ID ('nodeA', 'nodeB', 'nodeC', 'nodeD')
 * @param {string} fileId - Unique file identifier
 * @param {Buffer} buffer - File binary content
 * @returns {Promise<{nodeId: string, fileId: string, bytesWritten: number, timestamp: string, provider: string}>}
 */
export async function uploadToNode(nodeId, fileId, buffer) {
  if (isSimulatedFailed(nodeId)) {
    throw new Error(`[STORAGE_ERR] Node ${nodeId} is unreachable or partitioned (simulated failure).`);
  }

  const url = `${getNodeBaseUrl(nodeId)}/upload/${encodeURIComponent(fileId)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: buffer,
      duplex: 'half',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Node ${nodeId} returned HTTP ${res.status}: ${errText}`);
    }

    return {
      nodeId,
      fileId,
      bytesWritten: buffer.length,
      timestamp: new Date().toISOString(),
      provider: 'http-micro-node'
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`[TIMEOUT] Write to node ${nodeId} timed out after 4000ms`);
    }
    // Fallback if environment blocks localhost socket connections (e.g. sandbox restriction)
    if (err.code === 'EPERM' || err.cause?.code === 'EPERM') {
      const dir = path.join(BASE_NODES_DIR, nodeId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, fileId);
      await fs.promises.writeFile(filePath, buffer);
      return {
        nodeId,
        fileId,
        bytesWritten: buffer.length,
        timestamp: new Date().toISOString(),
        provider: 'local-disk-fallback'
      };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Abstracted read operation from an individual HTTP storage node.
 * Fetches bytes via HTTP GET from the node's dedicated port.
 * 
 * @param {string} nodeId - Target storage node ID
 * @param {string} fileId - Unique file identifier
 * @returns {Promise<Buffer>}
 */
export async function readFromNode(nodeId, fileId) {
  if (isSimulatedFailed(nodeId)) {
    throw new Error(`[STORAGE_ERR] Node ${nodeId} is unreachable or partitioned (simulated failure).`);
  }

  const url = `${getNodeBaseUrl(nodeId)}/download/${encodeURIComponent(fileId)}`;
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
    // Sandbox fallback
    if (err.code === 'EPERM' || err.cause?.code === 'EPERM') {
      const filePath = path.join(BASE_NODES_DIR, nodeId, fileId);
      if (fs.existsSync(filePath)) {
        return await fs.promises.readFile(filePath);
      }
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Abstracted delete operation on an individual HTTP storage node.
 * Sends HTTP DELETE to the node's dedicated port.
 * 
 * @param {string} nodeId 
 * @param {string} fileId 
 */
export async function deleteFromNode(nodeId, fileId) {
  try {
    const url = `${getNodeBaseUrl(nodeId)}/delete/${encodeURIComponent(fileId)}`;
    await fetch(url, { method: 'DELETE' });
  } catch (err) {
    // Sandbox fallback
    try {
      const filePath = path.join(BASE_NODES_DIR, nodeId, fileId);
      if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
    } catch (e) {}
  }
}

/**
 * Checks physical ping / network accessibility for a storage node.
 * Sends an HTTP GET request to /ping with a 3-second timeout.
 * 
 * @param {string} nodeId 
 * @returns {Promise<boolean>}
 */
export async function pingNode(nodeId) {
  if (isSimulatedFailed(nodeId)) {
    return false;
  }

  const url = `${getNodeBaseUrl(nodeId)}/ping`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch (err) {
    // Sandbox fallback: check if directory exists and node isn't failed
    if (err.code === 'EPERM' || err.cause?.code === 'EPERM') {
      const dir = path.join(BASE_NODES_DIR, nodeId);
      return fs.existsSync(dir);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Lists all fileIds present in an individual node's storage.
 * 
 * @param {string} nodeId 
 * @returns {Promise<string[]>}
 */
export async function listNodeFiles(nodeId) {
  try {
    const url = `${getNodeBaseUrl(nodeId)}/files`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    const dir = path.join(BASE_NODES_DIR, nodeId);
    if (!fs.existsSync(dir)) return [];
    const files = await fs.promises.readdir(dir);
    return files.filter(f => !f.startsWith('.'));
  }
}

/**
 * Demo feature: Intentionally corrupts bytes inside a replica on an individual node
 * to simulate silent bit rot, testing cryptographic SHA-256 self-healing.
 * 
 * @param {string} nodeId 
 * @param {string} fileId 
 */
export async function corruptNodeFile(nodeId, fileId) {
  try {
    const url = `${getNodeBaseUrl(nodeId)}/corrupt/${encodeURIComponent(fileId)}`;
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) return true;
  } catch (err) {}

  // Direct disk corruption fallback
  const filePath = path.join(BASE_NODES_DIR, nodeId, fileId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File ${fileId} not found on ${nodeId}`);
  }
  const data = await fs.promises.readFile(filePath);
  const corrupted = Buffer.from(data);
  if (corrupted.length > 0) corrupted[0] = corrupted[0] ^ 0xFF;
  await fs.promises.writeFile(filePath, corrupted);
  return true;
}
