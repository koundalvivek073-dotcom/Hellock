import { Mutex } from 'async-mutex';
import { readMetadataRaw, writeMetadataRaw, metaStoreInfo } from './metadataStore.js';

const metaMutex = new Mutex();

const DEFAULT_METADATA = {
  files: {},
  nodes: {
    nodeA: {
      id: "nodeA",
      name: "Storage Node A",
      role: "primary",
      status: "healthy",
      consecutiveFailures: 0,
      lastPing: null,
      simulatedFailure: false
    },
    nodeB: {
      id: "nodeB",
      name: "Storage Node B",
      role: "primary",
      status: "healthy",
      consecutiveFailures: 0,
      lastPing: null,
      simulatedFailure: false
    },
    nodeC: {
      id: "nodeC",
      name: "Storage Node C",
      role: "primary",
      status: "healthy",
      consecutiveFailures: 0,
      lastPing: null,
      simulatedFailure: false
    },
    nodeD: {
      id: "nodeD",
      name: "Storage Node D (Standby)",
      role: "standby",
      status: "standby",
      consecutiveFailures: 0,
      lastPing: null,
      simulatedFailure: false
    }
  },
  stats: {
    totalUploads: 0,
    totalRecoveries: 0,
    totalIntegrityChecks: 0
  }
};

/**
 * Exposes which metadata backend is active, for /api/status and /admin.
 */
export function metadataStoreInfo() {
  return metaStoreInfo();
}

async function _readRawMetadata() {
  try {
    const parsed = await readMetadataRaw();
    if (!parsed) return JSON.parse(JSON.stringify(DEFAULT_METADATA));
    return {
      files: parsed.files || {},
      nodes: { ...DEFAULT_METADATA.nodes, ...(parsed.nodes || {}) },
      stats: { ...DEFAULT_METADATA.stats, ...(parsed.stats || {}) }
    };
  } catch (err) {
    console.error('[METADATA_ERR] Error reading metadata:', err);
    return JSON.parse(JSON.stringify(DEFAULT_METADATA));
  }
}

async function _writeRawMetadata(meta) {
  await writeMetadataRaw(meta);
  return meta;
}

/**
 * Loads entire metadata structure safely.
 */
export async function getMetadata() {
  return await metaMutex.runExclusive(async () => {
    return await _readRawMetadata();
  });
}

/**
 * Saves entire metadata structure.
 */
export async function saveMetadata(meta) {
  return await metaMutex.runExclusive(async () => {
    return await _writeRawMetadata(meta);
  });
}

/**
 * Get a specific file's metadata.
 */
export async function getFileMetadata(fileId) {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    return meta.files[fileId] || null;
  });
}

/**
 * Get all files.
 */
export async function getAllFilesMetadata() {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    return Object.values(meta.files || {});
  });
}

/**
 * Retrieves all files accessible by a specific user:
 * - Files where owner === userEmail
 * - Files where authorizedAccounts includes userEmail
 * @param {string} userEmail 
 */
export async function getUserAccessibleFiles(userEmail) {
  const normalized = (userEmail || '').trim().toLowerCase();
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    const files = Object.values(meta.files || {});

    return files.filter(f => {
      const owner = (f.owner || '').toLowerCase();
      if (owner === normalized) return true;
      const authorized = (f.authorizedAccounts || []).map(a => a.toLowerCase());
      return authorized.includes(normalized);
    });
  });
}

/**
 * Creates or updates a file record.
 */
export async function setFileMetadata(fileId, fileData) {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    const existing = meta.files[fileId] || {};

    meta.files[fileId] = {
      fileId,
      filename: fileData.filename || existing.filename || 'unnamed',
      size: fileData.size !== undefined ? fileData.size : (existing.size || 0),
      mimeType: fileData.mimeType || existing.mimeType || 'application/octet-stream',
      hash: fileData.hash || existing.hash,
      version: fileData.version !== undefined ? fileData.version : (existing.version || 1),
      owner: (fileData.owner || existing.owner || 'demo@vault.local').toLowerCase(),
      ownerName: fileData.ownerName || existing.ownerName || 'Vault User',
      authorizedAccounts: [
        ...new Set([
          ...(existing.authorizedAccounts || []),
          ...(fileData.authorizedAccounts || [])
        ])
      ],
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      replicas: {
        nodeA: { status: 'missing', version: 0, lastVerified: null },
        nodeB: { status: 'missing', version: 0, lastVerified: null },
        nodeC: { status: 'missing', version: 0, lastVerified: null },
        nodeD: { status: 'missing', version: 0, lastVerified: null },
        ...(existing.replicas || {}),
        ...(fileData.replicas || {})
      }
    };

    await _writeRawMetadata(meta);
    return meta.files[fileId];
  });
}

/**
 * Transactional atomic update helper:
 * Simulates Firestore's runTransaction(async (transaction) => { ... })
 * to guarantee atomic updates without race conditions.
 * @param {string} fileId 
 * @param {(currentFile: object) => object} updateFn 
 */
export async function updateFileVersion(fileId, updateFn) {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    const current = meta.files[fileId];
    if (!current) throw new Error(`File ${fileId} not found in metadata`);

    const updated = updateFn({ ...current });
    updated.updatedAt = new Date().toISOString();
    meta.files[fileId] = updated;

    await _writeRawMetadata(meta);
    return meta.files[fileId];
  });
}

/**
 * Update the replica status for a specific node and file atomically.
 * @param {string} fileId 
 * @param {string} nodeId 
 * @param {'synced' | 'stale' | 'missing' | 'corrupted'} status 
 * @param {number} version 
 */
export async function updateReplicaStatus(fileId, nodeId, status, version = null) {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    if (!meta.files || !meta.files[fileId]) return null;

    if (!meta.files[fileId].replicas) {
      meta.files[fileId].replicas = {};
    }

    const currentReplica = meta.files[fileId].replicas[nodeId] || { version: 0 };
    meta.files[fileId].replicas[nodeId] = {
      ...currentReplica,
      status,
      version: version !== null ? version : currentReplica.version,
      lastVerified: new Date().toISOString()
    };
    meta.files[fileId].updatedAt = new Date().toISOString();

    await _writeRawMetadata(meta);
    return meta.files[fileId];
  });
}

/**
 * Grants file access to an authorized Google account.
 * Only the file owner can grant access.
 */
export async function shareFileWithUser(fileId, requesterEmail, targetEmail) {
  const reqNorm = (requesterEmail || '').toLowerCase();
  const targetNorm = (targetEmail || '').trim().toLowerCase();

  if (!targetNorm || !targetNorm.includes('@')) {
    throw new Error('Please enter a valid Google email address.');
  }

  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    const file = meta.files[fileId];
    if (!file) throw new Error(`File ${fileId} not found.`);

    if (file.owner && file.owner.toLowerCase() !== reqNorm) {
      throw new Error('Unauthorized: Only the file owner can share this file.');
    }

    if (!file.authorizedAccounts) {
      file.authorizedAccounts = [];
    }

    if (!file.authorizedAccounts.includes(targetNorm)) {
      file.authorizedAccounts.push(targetNorm);
      file.updatedAt = new Date().toISOString();
      await _writeRawMetadata(meta);
    }

    return file;
  });
}

/**
 * Revokes file access from an authorized Google account.
 */
export async function revokeFileSharing(fileId, requesterEmail, targetEmail) {
  const reqNorm = (requesterEmail || '').toLowerCase();
  const targetNorm = (targetEmail || '').trim().toLowerCase();

  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    const file = meta.files[fileId];
    if (!file) throw new Error(`File ${fileId} not found.`);

    if (file.owner && file.owner.toLowerCase() !== reqNorm) {
      throw new Error('Unauthorized: Only the file owner can modify sharing.');
    }

    if (file.authorizedAccounts) {
      file.authorizedAccounts = file.authorizedAccounts.filter(e => e.toLowerCase() !== targetNorm);
      file.updatedAt = new Date().toISOString();
      await _writeRawMetadata(meta);
    }

    return file;
  });
}

/**
 * Get all nodes.
 */
export async function getAllNodes() {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    return meta.nodes;
  });
}

/**
 * Update an individual node's status and tracking fields atomically.
 */
export async function updateNodeStatus(nodeId, updates) {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    if (meta.nodes && meta.nodes[nodeId]) {
      meta.nodes[nodeId] = {
        ...meta.nodes[nodeId],
        ...updates,
        lastPing: updates.lastPing || new Date().toISOString()
      };
      await _writeRawMetadata(meta);
      return meta.nodes[nodeId];
    }
    return null;
  });
}

/**
 * Rebalancing logic: Selects the healthiest and least-loaded nodes for replication.
 */
export async function getBestUploadNodes(requiredReplicas = 3) {
  const meta = await getMetadata();
  const nodes = meta.nodes;
  const files = Object.values(meta.files || {});

  const fileCounts = { nodeA: 0, nodeB: 0, nodeC: 0, nodeD: 0 };
  for (const f of files) {
    for (const [nid, rep] of Object.entries(f.replicas || {})) {
      if (rep.status === 'synced') {
        fileCounts[nid] = (fileCounts[nid] || 0) + 1;
      }
    }
  }

  const availableCandidates = Object.values(nodes).filter(
    n => n.status !== 'confirmed_down' && n.status !== 'suspected'
  );

  availableCandidates.sort((a, b) => {
    if (a.role === 'primary' && b.role === 'standby') {
      const healthyPrimaries = availableCandidates.filter(c => c.role === 'primary').length;
      if (healthyPrimaries >= requiredReplicas) return -1;
    }
    if (a.role === 'standby' && b.role === 'primary') {
      const healthyPrimaries = availableCandidates.filter(c => c.role === 'primary').length;
      if (healthyPrimaries >= requiredReplicas) return 1;
    }

    const countA = fileCounts[a.id] || 0;
    const countB = fileCounts[b.id] || 0;
    return countA - countB;
  });

  const selectedNodeIds = availableCandidates.slice(0, requiredReplicas).map(n => n.id);

  if (selectedNodeIds.length < 2) {
    throw new Error(
      `Insufficient healthy nodes available for write quorum (${selectedNodeIds.length} available, minimum 2 required).`
    );
  }

  return selectedNodeIds;
}

/**
 * Increment global stats counter atomically.
 */
export async function incrementStat(statName) {
  return await metaMutex.runExclusive(async () => {
    const meta = await _readRawMetadata();
    if (meta.stats && meta.stats[statName] !== undefined) {
      meta.stats[statName] += 1;
      await _writeRawMetadata(meta);
    }
  });
}
