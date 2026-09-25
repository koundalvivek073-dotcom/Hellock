import { startAllNodes, NODE_CONFIGS, NODE_BIND_HOST } from '../services/microNodeServer.js';
import { isDistributedDeployment } from '../services/nodeTopology.js';

console.log('\n================================================================');
console.log('🚀 LAUNCHING HELLOCK 4-NODE DISTRIBUTED STORAGE CLUSTER');
console.log('================================================================');
console.log(`   Bind host: ${NODE_BIND_HOST}`);
if (isDistributedDeployment()) {
  console.log('   Mode: DISTRIBUTED — nodes resolve to remote hosts via env vars');
} else {
  console.log('   Mode: LOCAL — all nodes on loopback (set NODE_*_URL to distribute)');
}

await startAllNodes();

console.log('\n✅ 4 Real HTTP Storage Nodes are ONLINE:');
for (const [nodeId, cfg] of Object.entries(NODE_CONFIGS)) {
  console.log(`   📡 ${cfg.name.padEnd(26)} -> ${cfg.url}`);
}
console.log('\nReady for distributed replication, quorum writes, and fault injection.');
console.log('Press Ctrl+C to stop the storage cluster.\n');
