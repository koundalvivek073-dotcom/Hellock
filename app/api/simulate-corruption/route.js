import { NextResponse } from 'next/server';
import { corruptNodeFile } from '@/services/nodeStorageService';
import { getMetadata } from '@/services/metadataService';
import eventBus from '@/services/eventBus';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    let { nodeId, fileId } = body;

    const meta = await getMetadata();
    const files = Object.values(meta.files || {});

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded yet to corrupt.' }, { status: 400 });
    }

    // Default to first file and first available node
    if (!fileId) {
      fileId = files[0].fileId;
    }

    const targetFile = meta.files[fileId];
    if (!targetFile) {
      return NextResponse.json({ error: `File not found: ${fileId}` }, { status: 404 });
    }

    if (!nodeId) {
      // Pick first synced node
      const syncedNodes = Object.entries(targetFile.replicas || {})
        .filter(([, rep]) => rep.status === 'synced')
        .map(([nid]) => nid);

      if (syncedNodes.length === 0) {
        return NextResponse.json({ error: 'No synced replicas found for this file.' }, { status: 400 });
      }
      nodeId = syncedNodes[0];
    }

    await corruptNodeFile(nodeId, fileId);

    eventBus.emitEvent('BIT_ROT_SIMULATED', {
      message: `Demo trigger: Byte flipped inside disk file for "${targetFile.filename}" on node ${nodeId} to simulate bit rot.`,
      fileId,
      filename: targetFile.filename,
      nodeId
    });

    return NextResponse.json({
      success: true,
      message: `Simulated bit rot corruption on ${nodeId} for file "${targetFile.filename}"`,
      fileId,
      nodeId
    });
  } catch (err) {
    console.error('[API_CORRUPT_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
