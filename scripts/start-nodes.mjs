import { startAllNodes, NODE_CONFIGS } from '../services/microNodeServer.js';

console.log('\n================================================================');
console.log('🚀 LAUNCHING HELLOCK 4-NODE DISTRIBUTED STORAGE CLUSTER');
console.log('================================================================');

await startAllNodes();

console.log('\n✅ 4 Real HTTP Storage Nodes are ONLINE:');
for (const [nodeId, cfg] of Object.entries(NODE_CONFIGS)) {
  console.log(`   📡 ${cfg.name.padEnd(26)} -> http://127.0.0.1:${cfg.port}`);
}
console.log('\nReady for distributed replication, quorum writes, and fault injection.');
console.log('Press Ctrl+C to stop the storage cluster.\n');
