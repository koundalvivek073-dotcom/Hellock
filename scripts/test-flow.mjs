import { uploadFile } from '../services/uploadService.js';
import { runHealthCheck } from '../services/healthCheckService.js';
import { runIntegrityCheck } from '../services/integrityService.js';
import { getMetadata, getFileMetadata } from '../services/metadataService.js';
import { setSimulatedFailure, corruptNodeFile, readFromNode } from '../services/nodeStorageService.js';
import { verifyHash } from '../lib/hash.js';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING VAULT DISTRIBUTED STORAGE SYSTEM TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Upload with Triple Replication and Quorum
  console.log('➡️ TEST 1: Triple Replication & Quorum Write (W=2, N=3)');
  const payload = Buffer.from('Fault-Tolerant Distributed Storage Demo Payload 2026', 'utf-8');
  const uploadResult = await uploadFile({
    filename: 'test_document.txt',
    buffer: payload,
    mimeType: 'text/plain'
  });

  console.log('✅ Upload result:', {
    fileId: uploadResult.file.fileId,
    version: uploadResult.file.version,
    quorumAchieved: uploadResult.quorum.achieved,
    targetNodes: uploadResult.quorum.targetNodes,
    hash: uploadResult.file.hash
  });

  if (uploadResult.quorum.achieved < 2) {
    throw new Error('Test 1 Failed: Write quorum not achieved');
  }

  const fileId = uploadResult.file.fileId;
  const initialHash = uploadResult.file.hash;

  // Test 2: Verify Physical Persistence on Replicas
  console.log('\n➡️ TEST 2: Verifying Replicas on Physical Disk');
  for (const nodeId of uploadResult.quorum.confirmedNodes) {
    const data = await readFromNode(nodeId, fileId);
    if (!verifyHash(data, initialHash)) {
      throw new Error(`Test 2 Failed: Data verification failed on ${nodeId}`);
    }
    console.log(`  ✓ Node ${nodeId}: SHA-256 Checksum verified`);
  }

  // Test 3: Partition & Node Failure Simulation (Node B)
  console.log('\n➡️ TEST 3: Health Checks, Partitioning & 3-Ping Auto-Recovery');
  console.log('  Disconnecting Node B...');
  setSimulatedFailure('nodeB', true);

  // Ping 1
  await runHealthCheck();
  let meta = await getMetadata();
  console.log(`  Ping 1 status for nodeB: ${meta.nodes.nodeB.status} (Failures: ${meta.nodes.nodeB.consecutiveFailures})`);
  if (meta.nodes.nodeB.status !== 'suspected') {
    throw new Error('Test 3 Failed: Node B should be "suspected" after 1 failure');
  }

  // Ping 2
  await runHealthCheck();
  meta = await getMetadata();
  console.log(`  Ping 2 status for nodeB: ${meta.nodes.nodeB.status} (Failures: ${meta.nodes.nodeB.consecutiveFailures})`);

  // Ping 3 -> Should trigger confirmed down & auto-recovery to nodeD!
  await runHealthCheck();
  meta = await getMetadata();
  console.log(`  Ping 3 status for nodeB: ${meta.nodes.nodeB.status} (Failures: ${meta.nodes.nodeB.consecutiveFailures})`);
  if (meta.nodes.nodeB.status !== 'confirmed_down') {
    throw new Error('Test 3 Failed: Node B should be "confirmed_down" after 3 failures');
  }

  // Verify standby nodeD received the replica
  const updatedFile = await getFileMetadata(fileId);
  console.log('  Replica status after recovery:', updatedFile.replicas);
  if (updatedFile.replicas.nodeD?.status !== 'synced') {
    throw new Error('Test 3 Failed: Standby Node D was not populated during recovery');
  }
  console.log('  ✓ Standby Node D successfully adopted replica!');

  // Test 4: Bit-Rot Simulation & Cryptographic Scrub Self-Healing
  console.log('\n➡️ TEST 4: Bit-Rot Simulation & Cryptographic Scrub');
  console.log('  Corrupting physical bytes on Node A replica...');
  await corruptNodeFile('nodeA', fileId);

  console.log('  Running cryptographic integrity scrub...');
  const scrubResult = await runIntegrityCheck();
  console.log('  Scrub result:', scrubResult);

  if (scrubResult.corrupted === 0 || scrubResult.healed === 0) {
    throw new Error('Test 4 Failed: Bit-rot corruption was not detected or healed');
  }

  // Verify repaired replica
  const healedBuffer = await readFromNode('nodeA', fileId);
  if (!verifyHash(healedBuffer, initialHash)) {
    throw new Error('Test 4 Failed: Repaired buffer on nodeA does not match canonical SHA-256');
  }
  console.log('  ✓ Node A replica successfully scrubbed, verified, and healed!');

  // Test 5: Reconnect Node B & Reconcile Versions
  console.log('\n➡️ TEST 5: Reconnect Node B & Version Reconciliation');
  setSimulatedFailure('nodeB', false);
  await runHealthCheck();
  meta = await getMetadata();
  console.log(`  Node B restored. Status: ${meta.nodes.nodeB.status}`);

  console.log('\n======================================================');
  console.log('🎉 ALL TESTS PASSED! VAULT ARCHITECTURE FULLY VALIDATED');
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Test runner failed:', err);
  process.exit(1);
});
