import { NextResponse } from 'next/server';
import { getFileMetadata, updateReplicaStatus } from '@/services/metadataService';
import { readFromNode, uploadToNode } from '@/services/nodeStorageService';
import { verifyHash, calculateHash } from '@/lib/hash';
import eventBus from '@/services/eventBus';
import { requireUserOrDemo } from '@/services/authService';
import { hasFileAccess } from '@/services/shareService';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { fileId } = params;

  try {
    const user = await requireUserOrDemo(request);
    const { searchParams } = new URL(request.url);
    const effectiveEmail = searchParams.get('user') || user.email;

    const file = await getFileMetadata(fileId);
    if (!file) {
      return NextResponse.json({ error: `File not found: ${fileId}` }, { status: 404 });
    }

    // Access control: verify requesting user owns or has been granted access to this file
    if (!hasFileAccess(file, effectiveEmail)) {
      return NextResponse.json(
        { error: 'Access denied: You do not have permission to download this file.' },
        { status: 403 }
      );
    }

    // Try reading from synced nodes first, then any node
    const candidateNodes = Object.entries(file.replicas || {})
      .sort((a, b) => {
        if (a[1].status === 'synced' && b[1].status !== 'synced') return -1;
        if (a[1].status !== 'synced' && b[1].status === 'synced') return 1;
        return 0;
      })
      .map(([nodeId]) => nodeId);

    let retrievedBuffer = null;
    let successfulNode = null;
    const attemptedErrors = [];

    for (const nodeId of candidateNodes) {
      try {
        const buffer = await readFromNode(nodeId, fileId);
        // Verify checksum
        if (verifyHash(buffer, file.hash)) {
          retrievedBuffer = buffer;
          successfulNode = nodeId;
          break;
        } else {
          attemptedErrors.push(`${nodeId}: checksum mismatch (corruption detected)`);
          await updateReplicaStatus(fileId, nodeId, 'corrupted');
          eventBus.emitEvent('CORRUPTION_DETECTED', {
            message: `Read check detected corruption on ${nodeId} for file "${file.filename}"`,
            fileId,
            nodeId
          });
        }
      } catch (err) {
        attemptedErrors.push(`${nodeId}: ${err.message}`);
      }
    }

    if (!retrievedBuffer) {
      return NextResponse.json({
        error: `Could not retrieve file ${fileId} from any replica node.`,
        attemptedErrors
      }, { status: 503 });
    }

    eventBus.emitEvent('FILE_DOWNLOADED', {
      message: `File "${file.filename}" successfully retrieved from ${successfulNode} (failover checked: ${attemptedErrors.length > 0 ? attemptedErrors.join('; ') : 'none'})`,
      fileId,
      servedByNode: successfulNode
    });

    // Rule 7: Read Repair (opportunistic background repair)
    // If any other node is marked stale or missing, replicate the verified buffer to it
    (async () => {
      for (const [nodeId, replica] of Object.entries(file.replicas || {})) {
        if (nodeId !== successfulNode && (replica.status === 'stale' || replica.version < file.version)) {
          try {
            await uploadToNode(nodeId, fileId, retrievedBuffer);
            await updateReplicaStatus(fileId, nodeId, 'synced', file.version);
            eventBus.emitEvent('READ_REPAIR_SUCCESS', {
              message: `Read-repair updated stale replica on ${nodeId} to v${file.version} for "${file.filename}"`,
              fileId,
              nodeId,
              version: file.version
            });
          } catch (err) {
            // Node might still be down, ignore
          }
        }
      }
    })();

    // Return binary response with download headers
    return new Response(retrievedBuffer, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
        'Content-Length': retrievedBuffer.length.toString(),
        'ETag': `"${file.hash}"`,
        'X-Served-By-Node': successfulNode,
        'X-File-Version': file.version.toString()
      }
    });
  } catch (err) {
    console.error('[API_DOWNLOAD_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
