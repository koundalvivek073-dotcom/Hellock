import { NextResponse } from 'next/server';
import { getMetadata } from '@/services/metadataService';
import eventBus from '@/services/eventBus';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const meta = await getMetadata();
    const filesArray = Object.values(meta.files || {});

    // Compute actual per-node file counts & disk storage
    const nodeMetrics = {};
    const baseDir = path.join(process.cwd(), 'data', 'nodes');

    for (const [nodeId, node] of Object.entries(meta.nodes)) {
      const nodeDir = path.join(baseDir, nodeId);
      let diskBytes = 0;
      let diskFiles = 0;

      if (fs.existsSync(nodeDir)) {
        try {
          const files = fs.readdirSync(nodeDir).filter(f => !f.startsWith('.'));
          diskFiles = files.length;
          for (const f of files) {
            const stat = fs.statSync(path.join(nodeDir, f));
            diskBytes += stat.size;
          }
        } catch (e) {
          // ignore directory read error
        }
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
