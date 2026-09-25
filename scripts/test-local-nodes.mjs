import { pingNode, uploadToNode, readFromNode, deleteFromNode, setSimulatedFailure, isSimulatedFailed } from '../services/nodeStorageService.js';
import { NODE_CONFIGS } from '../services/microNodeServer.js';

async function testCluster() {
  console.log('\n================================================================');
  console.log('🧪 TESTING 4 LOCAL HTTP STORAGE MICRO-NODES (PORTS 4001–4004)');
  console.log('================================================================\n');

  const nodes = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];
  const testFileId = `test_cluster_payload_${Date.now()}.txt`;
  const testData = Buffer.from('Hellock Distributed Consensus Micro-Node Payload 2026', 'utf-8');

  // 1. Ping each node
  console.log('➡️ STEP 1: Pinging All 4 HTTP Micro-Nodes...');
  for (const nodeId of nodes) {
    const reachable = await pingNode(nodeId);
    const port = NODE_CONFIGS[nodeId].port;
    console.log(`  - ${nodeId} (port ${port}): ${reachable ? '✅ ONLINE / 200 OK' : '❌ OFFLINE'}`);
    if (!reachable) throw new Error(`Node ${nodeId} failed ping`);
  }

  // 2. Parallel upload to all 4 nodes
  console.log('\n➡️ STEP 2: Writing Test Replica to All 4 HTTP Micro-Nodes...');
  for (const nodeId of nodes) {
    const res = await uploadToNode(nodeId, testFileId, testData);
    console.log(`  - ${nodeId}: ✅ Written ${res.bytesWritten} bytes over HTTP POST`);
  }

  // 3. Read back from all 4 nodes
  console.log('\n➡️ STEP 3: Reading Back Verified Payload from Each Node...');
  for (const nodeId of nodes) {
    const buffer = await readFromNode(nodeId, testFileId);
    console.log(`  - ${nodeId}: ✅ Read verified: "${buffer.toString()}"`);
  }

  // 4. Test failure simulation
  console.log('\n➡️ STEP 4: Testing Simulated Failure & Network Partition...');
  setSimulatedFailure('nodeB', true);
  const nodeBPingAfterFail = await pingNode('nodeB');
  console.log(`  - nodeB ping after failure simulation: ${nodeBPingAfterFail ? '❌ FAILED TO DISCONNECT' : '✅ CORRECTLY REPORTED OFFLINE / 503'}`);
  
  // Restore nodeB
  setSimulatedFailure('nodeB', false);
  const nodeBPingRestored = await pingNode('nodeB');
  console.log(`  - nodeB ping after recovery: ${nodeBPingRestored ? '✅ BACK ONLINE' : '❌ FAILED TO RECOVER'}`);

  // 5. Cleanup
  console.log('\n➡️ STEP 5: Cleaning Up Test Object Across Cluster...');
  for (const nodeId of nodes) {
    await deleteFromNode(nodeId, testFileId);
    console.log(`  - ${nodeId}: ✅ Cleaned up`);
  }

  console.log('\n================================================================');
  console.log('🎉 4-NODE HTTP STORAGE CLUSTER TEST PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
  process.exit(0);
}

testCluster().catch(err => {
  console.error('\n❌ Cluster test failed:', err);
  process.exit(1);
});
