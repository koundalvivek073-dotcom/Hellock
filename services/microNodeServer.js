import http from 'http';
import fs from 'fs';
import path from 'path';
import { getNodeTopology, resolveNodeUrl, isDistributedDeployment } from './nodeTopology.js';

/**
 * ==============================================================================
 * HELLOCK: DISTRIBUTED STORAGE MICRO-NODE CLUSTER
 * ==============================================================================
 * Powers 4 independent HTTP storage microservices simulating a real distributed
 * cluster running on dedicated network ports:
 *   - Node A: http://127.0.0.1:4001
 *   - Node B: http://127.0.0.1:4002
 *   - Node C: http://127.0.0.1:4003
 *   - Node D: http://127.0.0.1:4004 (Standby Failover Target)
 *
 * 100% Free, Zero Cloud Setup, No Credit Cards, Completely Offline-Resilient.
 * Provides authentic HTTP REST networking, socket timeouts, and process failure
 * simulation for high-impact hackathon demonstrations.
 *
 * The bind address and advertised URL are now env-configurable, so this same
 * cluster can be split across 4 real machines / containers. See nodeTopology.js.
 * ==============================================================================
 */

export const NODE_BIND_HOST = process.env.NODE_BIND_HOST || '127.0.0.1';

export const NODE_CONFIGS = {
  nodeA: { id: 'nodeA', port: 4001, name: 'Storage Node A' },
  nodeB: { id: 'nodeB', port: 4002, name: 'Storage Node B' },
  nodeC: { id: 'nodeC', port: 4003, name: 'Storage Node C' },
  nodeD: { id: 'nodeD', port: 4004, name: 'Storage Node D (Standby)' },
};

// Attach the env-resolved advertised URL to each config so every existing
// consumer (status API, dashboards, start-nodes banner) stays unchanged.
for (const [id, cfg] of Object.entries(NODE_CONFIGS)) {
  cfg.url = resolveNodeUrl(id, cfg.port);
  cfg.external = isDistributedDeployment();
}

export const BASE_NODES_DIR = path.join(process.cwd(), 'data', 'nodes');

// In-memory simulation states per node
const nodeStates = {
  nodeA: { failed: false },
  nodeB: { failed: false },
  nodeC: { failed: false },
  nodeD: { failed: false },
};

export function setNodeFailure(nodeId, isFailed) {
  if (nodeStates[nodeId]) {
    nodeStates[nodeId].failed = Boolean(isFailed);
  }
}

export function isNodeFailed(nodeId) {
  return Boolean(nodeStates[nodeId]?.failed);
}

/**
 * Creates an HTTP server for an individual storage node.
 * @param {string} nodeId - 'nodeA' | 'nodeB' | 'nodeC' | 'nodeD'
 * @param {number} port - Network port
 */
export function createNodeServer(nodeId, port) {
  const nodeDir = path.join(BASE_NODES_DIR, nodeId);
  if (!fs.existsSync(nodeDir)) {
    fs.mkdirSync(nodeDir, { recursive: true });
  }

  const server = http.createServer(async (req, res) => {
    // Set standard CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;

    // Failure simulation: if node is partitioned/failed, reject requests
    if (isNodeFailed(nodeId) && pathname !== '/simulate-failure') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: `[NETWORK_PARTITION] Node ${nodeId} is unreachable or partitioned.`,
        nodeId,
        status: 'unreachable'
      }));
      return;
    }

    try {
      // 1. Health Ping: GET /ping or GET /health
      if (req.method === 'GET' && (pathname === '/ping' || pathname === '/health')) {
        const files = await fs.promises.readdir(nodeDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          nodeId,
          port,
          fileCount: files.filter(f => !f.startsWith('.')).length,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // 2. Upload: POST /upload/:fileId
      if (req.method === 'POST' && pathname.startsWith('/upload/')) {
        const fileId = decodeURIComponent(pathname.replace('/upload/', ''));
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const filePath = path.join(nodeDir, fileId);
        await fs.promises.writeFile(filePath, buffer);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          nodeId,
          fileId,
          bytesWritten: buffer.length,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // 3. Download: GET /download/:fileId
      if (req.method === 'GET' && pathname.startsWith('/download/')) {
        const fileId = decodeURIComponent(pathname.replace('/download/', ''));
        const filePath = path.join(nodeDir, fileId);

        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `File not found on ${nodeId}`, fileId }));
          return;
        }

        const data = await fs.promises.readFile(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.length
        });
        res.end(data);
        return;
      }

      // 4. Delete: DELETE /delete/:fileId
      if (req.method === 'DELETE' && pathname.startsWith('/delete/')) {
        const fileId = decodeURIComponent(pathname.replace('/delete/', ''));
        const filePath = path.join(nodeDir, fileId);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, nodeId, fileId }));
        return;
      }

      // 5. List Files: GET /files
      if (req.method === 'GET' && pathname === '/files') {
        const files = await fs.promises.readdir(nodeDir);
        const validFiles = files.filter(f => !f.startsWith('.'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ nodeId, files: validFiles }));
        return;
      }

      // 6. Corrupt Replica: POST /corrupt/:fileId
      if (req.method === 'POST' && pathname.startsWith('/corrupt/')) {
        const fileId = decodeURIComponent(pathname.replace('/corrupt/', ''));
        const filePath = path.join(nodeDir, fileId);

        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `File ${fileId} not found on ${nodeId}` }));
          return;
        }

        const data = await fs.promises.readFile(filePath);
        const corrupted = Buffer.from(data);
        if (corrupted.length > 0) {
          corrupted[0] = corrupted[0] ^ 0xFF; // Invert first byte
        }
        await fs.promises.writeFile(filePath, corrupted);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, nodeId, fileId, corrupted: true }));
        return;
      }

      // 7. Toggle Failure State: POST /simulate-failure
      if (req.method === 'POST' && pathname === '/simulate-failure') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch (e) {}

        const targetState = typeof body.failed === 'boolean' ? body.failed : !isNodeFailed(nodeId);
        setNodeFailure(nodeId, targetState);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          nodeId,
          failed: targetState,
          status: targetState ? 'offline' : 'online'
        }));
        return;
      }

      // Unknown endpoint
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found', path: pathname }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  return server;
}

/**
 * Starts node servers in-process if not already listening.
 *
 * If NODE_ID is set (single-node container), only that node is started so each
 * storage node can live in its own container. Otherwise all 4 boot together,
 * which is the local single-process dev mode.
 */
export async function startAllNodes() {
  if (global._hellockMicroNodesStarted) {
    return;
  }
  global._hellockMicroNodesStarted = true;
  global._hellockMicroNodes = global._hellockMicroNodes || {};

  const onlyId = (process.env.NODE_ID || '').trim();
  if (onlyId && !NODE_CONFIGS[onlyId]) {
    console.warn(`[NODE_CLUSTER] NODE_ID="${onlyId}" is unknown; starting all nodes instead.`);
  }

  for (const [nodeId, cfg] of Object.entries(NODE_CONFIGS)) {
    if (onlyId && NODE_CONFIGS[onlyId] && nodeId !== onlyId) continue;
    if (global._hellockMicroNodes[nodeId]) continue;

    const server = createNodeServer(nodeId, cfg.port);
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Already started by an external runner or another worker; that's fine
        console.log(`[NODE_CLUSTER] Port ${cfg.port} for ${nodeId} already active.`);
      } else {
        console.error(`[NODE_CLUSTER_ERR] Node ${nodeId} error:`, err);
      }
    });

    try {
      server.listen(cfg.port, NODE_BIND_HOST, () => {
        console.log(`[NODE_CLUSTER] ${cfg.name} listening on http://${NODE_BIND_HOST}:${cfg.port} (advertised: ${cfg.url})`);
      });
      global._hellockMicroNodes[nodeId] = server;
    } catch (err) {
      // ignore EADDRINUSE
    }
  }
}

/**
 * Stops all node servers.
 */
export async function stopAllNodes() {
  if (global._hellockMicroNodes) {
    for (const [nodeId, server] of Object.entries(global._hellockMicroNodes)) {
      try {
        server.close();
      } catch (e) {}
    }
    global._hellockMicroNodes = {};
  }
  global._hellockMicroNodesStarted = false;
}
