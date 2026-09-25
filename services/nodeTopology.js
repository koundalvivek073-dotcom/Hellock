/**
 * ==============================================================================
 * HELLOCK: NODE TOPOLOGY CONFIGURATION (env-driven)
 * ==============================================================================
 * Previously every node URL was hardcoded to http://127.0.0.1:<port>, which
 * meant the cluster could only ever talk to itself on one machine. This module
 * makes the topology externally configurable so the SAME codebase can run as:
 *
 *   1. Local dev / single container  -> all nodes on 127.0.0.1 (default)
 *   2. docker-compose "real" cluster -> one container per node, each on its
 *      own host, addressed by service name (NODE_A_URL=http://node-a:4001)
 *   3. Kubernetes / any orchestrator -> injected env vars per pod
 *
 * Resolution order for a node URL (first match wins):
 *   - Explicit per-node env var, e.g. NODEA_URL / NODE_A_URL
 *   - Base host override, e.g. NODE_HOST=10.0.0.5 (keeps per-node ports)
 *   - Fallback to the local loopback default
 *
 * NOTE: no `import` of node builtins here on purpose — this file is imported by
 * both server runtime and build-time tooling, and must stay environment-agnostic.
 * ==============================================================================
 */

/** Default loopback ports, matching the historical hardcoded behaviour. */
export const DEFAULT_NODE_PORTS = {
  nodeA: 4001,
  nodeB: 4002,
  nodeC: 4003,
  nodeD: 4004,
};

export const NODE_IDS = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];

export const NODE_NAMES = {
  nodeA: 'Storage Node A',
  nodeB: 'Storage Node B',
  nodeC: 'Storage Node C',
  nodeD: 'Storage Node D (Standby)',
};

/**
 * Env var suffixes checked per node, in priority order.
 * e.g. for `nodeA` we accept NODEA_URL, NODE_A_URL, then NODEA_HOST/PORT.
 */
const ENV_SUFFIXES = {
  nodeA: ['NODEA', 'NODE_A'],
  nodeB: ['NODEB', 'NODE_B'],
  nodeC: ['NODEC', 'NODE_C'],
  nodeD: ['NODED', 'NODE_D'],
};

function env(name) {
  const v = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  return v && String(v).trim() !== '' ? String(v).trim() : undefined;
}

/** Normalises "host:port", "http://host:port", "host" into a bare host. */
function extractHost(value) {
  return value.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').split(':')[0];
}

/** Normalises into a full origin, defaulting the scheme to http. */
function normaliseUrl(value, defaultPort) {
  let out = String(value).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(out)) {
    out = `http://${out}`;
  }
  // Append the port if the user gave a bare host (no port present).
  try {
    const parsed = new URL(out);
    if (!parsed.port) parsed.port = String(defaultPort);
    return parsed.origin;
  } catch {
    return `http://${extractHost(out)}:${defaultPort}`;
  }
}

/**
 * Resolves the reachable base URL for a given node.
 * @param {string} nodeId - 'nodeA' | 'nodeB' | 'nodeC' | 'nodeD'
 * @param {number} fallbackPort - the locally bound port
 * @returns {string} e.g. "http://10.0.0.5:4001"
 */
export function resolveNodeUrl(nodeId, fallbackPort) {
  const port = fallbackPort ?? DEFAULT_NODE_PORTS[nodeId];
  const suffixes = ENV_SUFFIXES[nodeId] || [];

  // 1. Explicit per-node URL
  for (const s of suffixes) {
    const direct = env(`${s}_URL`);
    if (direct) return normaliseUrl(direct, port);
  }

  // 2. Per-node host (and optional port)
  for (const s of suffixes) {
    const host = env(`${s}_HOST`);
    if (host) {
      const perNodePort = env(`${s}_PORT`);
      return normaliseUrl(`${host}:${perNodePort || port}`, port);
    }
  }

  // 3. Shared host override for all nodes (keeps distinct per-node ports)
  const sharedHost = env('NODE_HOST');
  if (sharedHost) return normaliseUrl(`${sharedHost}:${port}`, port);

  // 4. Local loopback default (current behaviour, fully backwards compatible)
  return `http://127.0.0.1:${port}`;
}

/**
 * Returns the full topology: per-node id, name, port, and resolved URL.
 * @returns {Record<string, {id:string,name:string,port:number,url:string,external:boolean}>}
 */
export function getNodeTopology() {
  const out = {};
  for (const id of NODE_IDS) {
    const port = DEFAULT_NODE_PORTS[id];
    const url = resolveNodeUrl(id, port);
    out[id] = {
      id,
      name: NODE_NAMES[id],
      port,
      url,
      // true when this node lives somewhere other than our own loopback
      external: !/^https?:\/\/127\.0\.0\.1:/.test(url) && !/^https?:\/\/localhost:/.test(url),
    };
  }
  return out;
}

/** True when at least one node is remote, i.e. a genuinely distributed deployment. */
export function isDistributedDeployment() {
  return Object.values(getNodeTopology()).some((n) => n.external);
}

export default getNodeTopology;
