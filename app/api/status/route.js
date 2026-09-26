import { NextResponse } from 'next/server';
import { getMetadata, metadataStoreInfo } from '@/services/metadataService';
import { storageRuntimeInfo, getNodeUsage } from '@/services/nodeStorageService';
import { runHealthCheck } from '@/services/healthCheckService';
import { isServerless, runtimeLabel } from '@/services/runtime';
import eventBus from '@/services/eventBus';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // On serverless there is no background cron, so the admin panel's own
    // 10s poll is what drives detection, suspension, and auto-recovery.
    // On a persistent host the cron already handles this and this is a no-op
    // fast path (the in-process re-entrancy guard short-circuits it).
    if (isServerless()) {
      await runHealthCheck();
    }

    const meta = await getMetadata();
    const filesArray = Object.values(meta.files || {});

    // Compute actual per-node file counts & stored bytes from the active
    // blob store (disk on a persistent host, Netlify Blobs on serverless).
    const nodeMetrics = {};

    for (const [nodeId, node] of Object.entries(meta.nodes)) {
      let diskBytes = 0;
      let diskFiles = 0;

      try {
        const usage = await getNodeUsage(nodeId);
        diskFiles = usage?.files || 0;
        diskBytes = usage?.bytes || 0;
      } catch (e) {
        // ignore usage read error; metrics degrade to zero rather than 500ing
      }

      nodeMetrics[nodeId] = {
        ...node,
        diskFiles,
        diskBytes,
        diskBytesFormatted: formatBytes(diskBytes)
      };
    }

    return NextResponse.json({
      nodes: nodeMetrics,
      files: filesArray,
      stats: meta.stats,
      recentEvents: eventBus.getHistory().slice(0, 50),
      runtime: {
        mode: runtimeLabel(),
        storage: storageRuntimeInfo(),
        metadata: metadataStoreInfo()
      },
      config: {
        replicationFactor: parseInt(process.env.REPLICATION_FACTOR || '3', 10),
        writeQuorum: parseInt(process.env.WRITE_QUORUM || '2', 10),
        standbyNode: process.env.STANDBY_NODE || 'nodeD',
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS || '10', 10)
      }
    });
  } catch (err) {
    console.error('[API_STATUS_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
