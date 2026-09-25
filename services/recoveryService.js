import {
  getMetadata,
  getFileMetadata,
  updateReplicaStatus,
  incrementStat
} from './metadataService.js';
import { readFromNode, uploadToNode } from './nodeStorageService.js';
import { verifyHash } from '../lib/hash.js';
import eventBus from './eventBus.js';
import lockService from './lockService.js';

const STANDBY_NODE = process.env.STANDBY_NODE || 'nodeD';

/**
 * Recovers all replicas lost when a node is confirmed down.
 * Reads verified replicas from surviving healthy nodes and clones them
 * onto the standby node (nodeD).
 * 
 * @param {string} failedNodeId 
 * @returns {Promise<object>} Summary of recovered files
 */
export async function recoverFailedNode(failedNodeId) {
  eventBus.emitEvent('RECOVERY_START', {
    message: `Initiating cluster auto-recovery for confirmed down node: ${failedNodeId}. Target standby node: ${STANDBY_NODE}`,
    failedNodeId,
    targetNodeId: STANDBY_NODE
  });

  const meta = await getMetadata();
  const files = Object.values(meta.files || {});
  const affectedFiles = files.filter(f => {
    const rep = f.replicas && f.replicas[failedNodeId];
    return rep && (rep.status === 'synced' || rep.status === 'stale');
  });

  if (affectedFiles.length === 0) {
    eventBus.emitEvent('RECOVERY_COMPLETE', {
      message: `No files were stored on ${failedNodeId}. Standby node ${STANDBY_NODE} remains ready.`,
      failedNodeId,
      recoveredCount: 0
    });
    return { recoveredCount: 0, files: [] };
  }

  const recoveryResults = [];

  for (const file of affectedFiles) {
    await lockService.withLock(file.fileId, async () => {
      // Find surviving healthy node holding this file
      const survivingNodes = Object.entries(file.replicas || {})
        .filter(([nid, rep]) => nid !== failedNodeId && rep.status === 'synced')
        .map(([nid]) => nid);

      if (survivingNodes.length === 0) {
        eventBus.emitEvent('RECOVERY_FAILED', {
          message: `CRITICAL: Data loss on file "${file.filename}" (${file.fileId}). No healthy surviving replicas found!`,
          fileId: file.fileId,
          filename: file.filename
        });
        return;
      }

      // Read from first available healthy surviving node
      let retrievedBuffer = null;
      let sourceNode = null;

      for (const candidateNode of survivingNodes) {
        try {
          const buffer = await readFromNode(candidateNode, file.fileId);
          if (verifyHash(buffer, file.hash)) {
            retrievedBuffer = buffer;
            sourceNode = candidateNode;
            break;
          }
        } catch (e) {
          // try next surviving node
        }
      }

      if (!retrievedBuffer) {
        eventBus.emitEvent('RECOVERY_FAILED', {
          message: `CRITICAL: Surviving replicas for "${file.filename}" failed integrity verification during recovery.`,
          fileId: file.fileId
        });
        return;
      }

      // Visual beam animation event: Source node -> Standby node (nodeD)
      eventBus.emitEvent('RECOVERY_TRANSFER_START', {
        message: `Transferring replica of "${file.filename}" from ${sourceNode} -> ${STANDBY_NODE}`,
        fileId: file.fileId,
        filename: file.filename,
        sourceNodeId: sourceNode,
        targetNodeId: STANDBY_NODE
      });

      try {
        // Write replica to standby node
        await uploadToNode(STANDBY_NODE, file.fileId, retrievedBuffer);

        // Update metadata: mark standby node as synced, failed node as missing
        await updateReplicaStatus(file.fileId, STANDBY_NODE, 'synced', file.version);
        await updateReplicaStatus(file.fileId, failedNodeId, 'missing', 0);

        await incrementStat('totalRecoveries');

        eventBus.emitEvent('RECOVERY_TRANSFER_COMPLETE', {
          message: `Replica restored! Standby ${STANDBY_NODE} now holds verified copy of "${file.filename}" (v${file.version})`,
          fileId: file.fileId,
          filename: file.filename,
          sourceNodeId: sourceNode,
          targetNodeId: STANDBY_NODE
        });

        recoveryResults.push({
          fileId: file.fileId,
          filename: file.filename,
          sourceNode,
          targetNode: STANDBY_NODE,
          success: true
        });
      } catch (writeErr) {
        eventBus.emitEvent('RECOVERY_FAILED', {
          message: `Failed writing replica to standby ${STANDBY_NODE}: ${writeErr.message}`,
          fileId: file.fileId,
          targetNodeId: STANDBY_NODE,
          error: writeErr.message
        });
      }
    });
  }

  eventBus.emitEvent('RECOVERY_COMPLETE', {
    message: `Cluster recovery completed. ${recoveryResults.length}/${affectedFiles.length} replicas successfully cloned to ${STANDBY_NODE}`,
    failedNodeId,
    targetNodeId: STANDBY_NODE,
    recoveredCount: recoveryResults.length
  });

  return {
    recoveredCount: recoveryResults.length,
    results: recoveryResults
  };
}

/**
 * Heals a specific corrupted or missing replica on a specific node
 * by copying from a known good healthy replica.
 * 
 * @param {string} fileId 
 * @param {string} badNodeId 
 */
export async function healCorruptedReplica(fileId, badNodeId) {
  return await lockService.withLock(fileId, async () => {
    const file = await getFileMetadata(fileId);
    if (!file) throw new Error(`File ${fileId} not found in metadata`);

    // Find a healthy node holding this file
    const goodNodes = Object.entries(file.replicas || {})
      .filter(([nid, rep]) => nid !== badNodeId && rep.status === 'synced')
      .map(([nid]) => nid);

    if (goodNodes.length === 0) {
      throw new Error(`Cannot heal ${fileId}: No other healthy replicas exist.`);
    }

    let goodBuffer = null;
    let sourceNode = null;

    for (const nid of goodNodes) {
      try {
        const buffer = await readFromNode(nid, fileId);
        if (verifyHash(buffer, file.hash)) {
          goodBuffer = buffer;
          sourceNode = nid;
          break;
        }
      } catch (e) {
        // try next
      }
    }

    if (!goodBuffer) {
      throw new Error(`Cannot heal ${fileId}: Surviving replicas failed verification.`);
    }

    eventBus.emitEvent('RECOVERY_TRANSFER_START', {
      message: `Healing corrupted file "${file.filename}" on ${badNodeId} using healthy replica from ${sourceNode}`,
      fileId,
      filename: file.filename,
      sourceNodeId: sourceNode,
      targetNodeId: badNodeId
    });

    await uploadToNode(badNodeId, fileId, goodBuffer);
    await updateReplicaStatus(fileId, badNodeId, 'synced', file.version);
    await incrementStat('totalRecoveries');

    eventBus.emitEvent('RECOVERY_TRANSFER_COMPLETE', {
      message: `Healed! "${file.filename}" on ${badNodeId} restored and verified matching hash ${file.hash.substring(0, 10)}...`,
      fileId,
      filename: file.filename,
      sourceNodeId: sourceNode,
      targetNodeId: badNodeId
    });

    return { fileId, healedNode: badNodeId, sourceNode };
  });
}
