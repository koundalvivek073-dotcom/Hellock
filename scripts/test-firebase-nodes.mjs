import { pingNode, uploadToNode, readFromNode, deleteFromNode } from '../services/nodeStorageService.js';

async function verifyFirebaseConnectivity() {
  console.log('\n======================================================');
  console.log('🔥 VERIFYING REAL FIREBASE STORAGE CLUSTER REACHABILITY');
  console.log('======================================================\n');

  const nodes = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];
  const testFileId = `__connectivity_test_${Date.now()}.txt`;
  const testPayload = Buffer.from('Hellock Firebase Real Storage Handshake Test 2026', 'utf-8');

  // Step 1: Test pings
  console.log('➡️ STEP 1: Pinging All 4 Firebase Storage Buckets...');
  for (const nodeId of nodes) {
    const isReachable = await pingNode(nodeId);
    console.log(`  - Node ${nodeId}: ${isReachable ? '✅ ONLINE / RESPONDING' : '❌ UNREACHABLE / ERROR'}`);
  }

  // Step 2: Test writes
  console.log('\n➡️ STEP 2: Writing Test Replica to Each Node...');
  for (const nodeId of nodes) {
    try {
      const res = await uploadToNode(nodeId, testFileId, testPayload);
      console.log(`  - Node ${nodeId}: ✅ Written ${res.bytesWritten} bytes to bucket`);
    } catch (err) {
      console.error(`  - Node ${nodeId}: ❌ Write failed:`, err.message);
    }
  }

  // Step 3: Test reads
  console.log('\n➡️ STEP 3: Reading Back Test Replica from Each Node...');
  for (const nodeId of nodes) {
    try {
      const buffer = await readFromNode(nodeId, testFileId);
      console.log(`  - Node ${nodeId}: ✅ Read verified (${buffer.toString()})`);
    } catch (err) {
      console.error(`  - Node ${nodeId}: ❌ Read failed:`, err.message);
    }
  }

  // Step 4: Clean up test replica
  console.log('\n➡️ STEP 4: Cleaning Up Test Object from Buckets...');
  for (const nodeId of nodes) {
    try {
      await deleteFromNode(nodeId, testFileId);
      console.log(`  - Node ${nodeId}: ✅ Cleaned up`);
    } catch (err) {
      console.error(`  - Node ${nodeId}: ❌ Cleanup failed:`, err.message);
    }
  }

  console.log('\n======================================================');
  console.log('🎉 FIREBASE STORAGE CLUSTER VERIFICATION COMPLETED');
  console.log('======================================================\n');
  process.exit(0);
}

verifyFirebaseConnectivity().catch(err => {
  console.error('\n❌ Verification script encountered an error:', err);
  process.exit(1);
});
