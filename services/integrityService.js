import cron from 'node-cron';
import { getMetadata, updateReplicaStatus, incrementStat } from './metadataService.js';
import { readFromNode } from './nodeStorageService.js';
import { calculateHash } from '../lib/hash.js';
import { healCorruptedReplica } from './recoveryService.js';
import eventBus from './eventBus.js';

let integrityCron = null;
let isRunningIntegrity = false;

/**
 * Executes a full cryptographic scrub across all storage nodes.
 * Re-hashes every physical replica and compares against the canonical
 * SHA-256 master hash in metadata. Automatically triggers healing on any
 * detected corruption or missing replica.
 * 
 * @returns {Promise<object>} Audit summary
 */
export async function runIntegrityCheck() {
  if (isRunningIntegrity) {
    return { status: 'in_progress', message: 'Integrity check already in progress' };
  }
  isRunningIntegrity = true;

  eventBus.emitEvent('INTEGRITY_CHECK_START', {
    message: 'Starting cryptographic integrity scrub across all storage node replicas...',
  });

  const results = {
    totalChecked: 0,
    verified: 0,
    corrupted: 0,
    missing: 0,
    healed: 0,
    details: []
  };

  try {
    const meta = await getMetadata();
    const files = Object.values(meta.files || {});

    for (const file of files) {
      for (const [nodeId, replica] of Object.entries(file.replicas || {})) {
        // Only inspect nodes that are supposed to have a synced replica
        if (replica.status === 'synced') {
          results.totalChecked++;
          let buffer = null;

          try {
            buffer = await readFromNode(nodeId, file.fileId);
          } catch (readErr) {
            // File is missing on disk or node is down
            results.missing++;
            await updateReplicaStatus(file.fileId, nodeId, 'missing');

            eventBus.emitEvent('REPLICA_MISSING', {
              message: `Replica missing for "${file.filename}" on ${nodeId}! Triggering self-healing...`,
              fileId: file.fileId,
              nodeId
            });

            // Attempt healing from another node
            try {
              await healCorruptedReplica(file.fileId, nodeId);
              results.healed++;
            } catch (healErr) {
              console.error(`[HEAL_ERR] Failed healing missing file on ${nodeId}:`, healErr.message);
            }

            results.details.push({
              fileId: file.fileId,
              filename: file.filename,
              nodeId,
              status: 'missing'
            });
            continue;
          }

          // Compute fresh SHA-256 hash from physical disk data
          const physicalHash = calculateHash(buffer);

          if (physicalHash.toLowerCase() === file.hash.toLowerCase()) {
            results.verified++;
            await updateReplicaStatus(file.fileId, nodeId, 'synced', file.version);

            eventBus.emitEvent('INTEGRITY_VERIFIED', {
              message: `Verified: "${file.filename}" on ${nodeId} matches master SHA-256 (${physicalHash.substring(0, 10)}...)`,
              fileId: file.fileId,
              filename: file.filename,
              nodeId,
              hash: physicalHash
            });

            results.details.push({
              fileId: file.fileId,
              filename: file.filename,
              nodeId,
              status: 'verified',
              hash: physicalHash
            });
          } else {
            // Corruption detected!
            results.corrupted++;
            await updateReplicaStatus(file.fileId, nodeId, 'corrupted');

            eventBus.emitEvent('CORRUPTION_DETECTED', {
              message: `🚨 CORRUPTION DETECTED: "${file.filename}" on ${nodeId} failed checksum! Master: ${file.hash.substring(0, 10)}... vs Disk: ${physicalHash.substring(0, 10)}... Triggering automatic recovery...`,
              fileId: file.fileId,
              filename: file.filename,
              nodeId,
              expectedHash: file.hash,
              actualHash: physicalHash
            });

            // Trigger Rule 6 automatic repair
            try {
              await healCorruptedReplica(file.fileId, nodeId);
              results.healed++;
            } catch (healErr) {
              console.error(`[HEAL_ERR] Auto-healing failed for ${file.fileId} on ${nodeId}:`, healErr.message);
            }

            results.details.push({
              fileId: file.fileId,
              filename: file.filename,
              nodeId,
              status: 'corrupted_and_healed',
              expectedHash: file.hash,
              actualHash: physicalHash
            });
          }
        }
      }
    }

    await incrementStat('totalIntegrityChecks');

    eventBus.emitEvent('INTEGRITY_CHECK_COMPLETE', {
      message: `Integrity check scrub finished: ${results.verified} verified, ${results.corrupted} corrupted, ${results.missing} missing, ${results.healed} self-healed.`,
      summary: results
    });

    return results;
  } catch (err) {
    console.error('[INTEGRITY_CHECK_ERR]', err);
    throw err;
  } finally {
    isRunningIntegrity = false;
  }
}

/**
 * Starts periodic integrity check cron (runs every 60 seconds).
 */
export function startIntegrityCron() {
  if (integrityCron) return;

  // Run every minute
  integrityCron = cron.schedule('0 * * * * *', async () => {
    await runIntegrityCheck();
  });

  console.log('[VAULT CRON] Periodic integrity verification cron service active (60s interval).');
}

// Auto-start on module load
if (!global._vaultIntegrityCronStarted) {
  global._vaultIntegrityCronStarted = true;
  startIntegrityCron();
}
