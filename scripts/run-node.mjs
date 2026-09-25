/**
 * ==============================================================================
 * HELLOCK: SINGLE STORAGE NODE RUNNER
 * ==============================================================================
 * Boots exactly ONE storage micro-node as a standalone process/container, so the
 * cluster can be split across 4 separate machines (see docker-compose.yml).
 *
 * Usage:
 *   node scripts/run-node.mjs                 # boots all 4 (local dev default)
 *   NODE_ID=nodeB node scripts/run-node.mjs    # boots only Node B
 *   NODE_ID=nodeB NODE_BIND_HOST=0.0.0.0 node scripts/run-node.mjs
 *
 * In a distributed deployment each container sets NODE_ID and exposes its node
 * on the shared port (4001), while the web tier addresses it by service name
 * via NODE_*_URL. See services/nodeTopology.js.
 * ==============================================================================
 */
import { startAllNodes, NODE_CONFIGS, NODE_BIND_HOST } from '../services/microNodeServer.js';

const requestedId = (process.env.NODE_ID || '').trim();

console.log('\n================================================================');
if (requestedId) {
  console.log(`🚀 LAUNCHING HELLOCK STORAGE NODE: ${requestedId}`);
  console.log('================================================================');
  console.log(`   Bind host : ${NODE_BIND_HOST}`);
  console.log(`   Port      : ${NODE_CONFIGS[requestedId]?.port ?? 'unknown'}`);
  console.log(`   Container : this process is one node of the distributed cluster.`);
  console.log('\nThe web tier reaches this node via its NODE_*_URL env var.\n');
} else {
  console.log('🚀 LAUNCHING HELLOCK 4-NODE DISTRIBUTED STORAGE CLUSTER (local mode)');
  console.log('================================================================');
  console.log(`   Bind host: ${NODE_BIND_HOST}`);
  console.log('   Tip: set NODE_ID=nodeA..nodeD to run a single node per container.\n');
}

await startAllNodes();

console.log('✅ Online nodes:');
for (const [nodeId, cfg] of Object.entries(NODE_CONFIGS)) {
  if (requestedId && nodeId !== requestedId) continue;
  console.log(`   📡 ${cfg.name.padEnd(26)} -> ${cfg.url}`);
}
console.log('\nPress Ctrl+C to stop.\n');

// Keep the process alive; the http servers hold the event loop open, but be
// explicit so a silent exit can't look like a crash to an orchestrator.
process.stdin.resume();
