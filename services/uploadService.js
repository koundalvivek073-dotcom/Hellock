import crypto from 'crypto';
import { calculateHash } from '../lib/hash.js';
import lockService from './lockService.js';
import eventBus from './eventBus.js';
import { uploadToNode } from './nodeStorageService.js';
import {
  getFileMetadata,
  setFileMetadata,
  updateReplicaStatus,
  getBestUploadNodes,
  incrementStat
} from './metadataService.js';

const REPLICATION_FACTOR = parseInt(process.env.REPLICATION_FACTOR || '3', 10);
const WRITE_QUORUM = parseInt(process.env.WRITE_QUORUM || '2', 10);

/**
 * Uploads a file with fault-tolerant parallel replication and durability quorum.
 * 
 * Rules strictly implemented:
 * - Rule 1: Parallel write to 3 nodes.
 * - Rule 2: Quorum durability: returns success once 2 of 3 confirm; 3rd completes in background.
 * - Rule 3: Per-file concurrency lock via async-mutex.
 * - Rule 6: SHA-256 hashing.
 * - Rule 7: Version increments on update.
 * 
 * @param {object} params
 * @param {string} params.filename
 * @param {Buffer} params.buffer
 * @param {string} [params.mimeType]
 * @param {string} [params.fileId]
 * @returns {Promise<object>} Upload confirmation result
 */
export async function uploadFile({ filename, buffer, mimeType = 'application/octet-stream', fileId, owner = 'demo@hellock.local', ownerName = 'Hellock User' }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Upload buffer cannot be empty.');
  }

  // Maximum buffer guardrail to prevent RAM exhaustion and serverless timeout crashes
  const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || `${50 * 1024 * 1024}`, 10);
  if (buffer.length > MAX_UPLOAD_SIZE) {
    const maxMb = Math.round(MAX_UPLOAD_SIZE / (1024 * 1024));
    throw new Error(`Upload payload (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowable cluster buffer size of ${maxMb}MB.`);
  }

  // Derive stable or random file ID
  const effectiveFileId = fileId || `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Acquire per-file lock to serialize concurrent uploads to the exact same fileId
  return await lockService.withLock(effectiveFileId, async () => {
    const startTime = Date.now();
    const hash = calculateHash(buffer);

    // Rule 11: 2MB block/chunk partitioning for fine-grained integrity verification
    const CHUNK_SIZE = 2 * 1024 * 1024;
    const chunks = [];
    for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
      const slice = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
      chunks.push({
        chunkIndex: chunks.length,
        offset,
        size: slice.length,
        hash: calculateHash(slice)
      });
    }

    // Check existing metadata for versioning (Rule 7)
    const existing = await getFileMetadata(effectiveFileId);
    const newVersion = existing ? (existing.version || 1) + 1 : 1;

    // Select candidate nodes based on health & load rebalancing (Rule 9)
    const targetNodeIds = await getBestUploadNodes(REPLICATION_FACTOR);

    eventBus.emitEvent('UPLOAD_START', {
      message: `Initiating upload for "${filename}" (v${newVersion}) by ${owner} across [${targetNodeIds.join(', ')}] with quorum W=${WRITE_QUORUM} (${chunks.length} block chunks)`,
      fileId: effectiveFileId,
      filename,
      owner,
      version: newVersion,
      hash: hash.substring(0, 12) + '...',
      size: buffer.length,
      chunks: chunks.length,
      targetNodes: targetNodeIds
    });

    // Prepare initial metadata record
    const initialReplicas = {
      nodeA: { status: 'missing', version: 0, lastVerified: null },
      nodeB: { status: 'missing', version: 0, lastVerified: null },
      nodeC: { status: 'missing', version: 0, lastVerified: null },
      nodeD: { status: 'missing', version: 0, lastVerified: null },
    };

    await setFileMetadata(effectiveFileId, {
      filename,
      size: buffer.length,
      mimeType,
      hash,
      version: newVersion,
      owner,
      ownerName,
      chunks,
      chunkCount: chunks.length,
      chunkSize: CHUNK_SIZE,
      replicas: initialReplicas
    });

    // Parallel writes with Quorum coordination (Rule 1 & Rule 2)
    const successfulNodes = [];
    const failedNodes = [];

    // Create a promise for each target node write
    const writePromises = targetNodeIds.map(nodeId => {
      return (async () => {
        try {
          await uploadToNode(nodeId, effectiveFileId, buffer);
          successfulNodes.push(nodeId);
          await updateReplicaStatus(effectiveFileId, nodeId, 'synced', newVersion);

          eventBus.emitEvent('NODE_WRITE_CONFIRMED', {
            message: `Node ${nodeId} confirmed write for "${filename}" (v${newVersion})`,
            nodeId,
            fileId: effectiveFileId
          });

          return { nodeId, success: true };
        } catch (err) {
          failedNodes.push({ nodeId, error: err.message });
          await updateReplicaStatus(effectiveFileId, nodeId, 'missing', 0);

          eventBus.emitEvent('NODE_WRITE_FAILED', {
            message: `Node ${nodeId} failed write: ${err.message}`,
            nodeId,
            fileId: effectiveFileId,
            error: err.message
          });

          return { nodeId, success: false, error: err.message };
        }
      })();
    });

    // Quorum Promise: Resolves as soon as WRITE_QUORUM nodes succeed
    const quorumPromise = new Promise((resolve, reject) => {
      let resolved = false;

      writePromises.forEach(p => {
        p.then(() => {
          if (!resolved && successfulNodes.length >= WRITE_QUORUM) {
            resolved = true;
            resolve({
              confirmedCount: successfulNodes.length,
              nodes: [...successfulNodes]
            });
          }
        });
      });

      // If all promises settle and quorum wasn't met, reject
      Promise.allSettled(writePromises).then(() => {
        if (!resolved) {
          if (successfulNodes.length >= WRITE_QUORUM) {
            resolve({
              confirmedCount: successfulNodes.length,
              nodes: [...successfulNodes]
            });
          } else {
            reject(new Error(
              `Quorum failure: only ${successfulNodes.length}/${WRITE_QUORUM} writes succeeded. Failed nodes: ${failedNodes.map(f => f.nodeId).join(', ')}`
            ));
          }
        }
      });
    });

    // Wait for Quorum to be achieved (immediate client acknowledgment)
    const quorumResult = await quorumPromise;
    const durationMs = Date.now() - startTime;

    await incrementStat('totalUploads');

    eventBus.emitEvent('QUORUM_REACHED', {
      message: `Quorum satisfied for "${filename}" (${successfulNodes.length}/${WRITE_QUORUM} confirmed in ${durationMs}ms). 3rd write finishing in background.`,
      fileId: effectiveFileId,
      filename,
      confirmedNodes: quorumResult.nodes,
      durationMs
    });

    // Let the remaining background writes finish without blocking response
    Promise.allSettled(writePromises).then(() => {
      eventBus.emitEvent('UPLOAD_SUCCESS', {
        message: `Upload lifecycle finalized for "${filename}" (synced on [${successfulNodes.join(', ')}])`,
        fileId: effectiveFileId,
        syncedNodes: [...successfulNodes]
      });
    });

    const updatedRecord = await getFileMetadata(effectiveFileId);

    return {
      success: true,
      file: updatedRecord,
      quorum: {
        required: WRITE_QUORUM,
        achieved: quorumResult.confirmedCount,
        targetNodes: targetNodeIds,
        confirmedNodes: quorumResult.nodes,
        durationMs
      }
    };
  });
}
