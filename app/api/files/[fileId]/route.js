import { NextResponse } from 'next/server';
import { getFileMetadata, deleteFileMetadata } from '@/services/metadataService';
import { deleteFromNode } from '@/services/nodeStorageService';
import { requireUserOrDemo } from '@/services/authService';
import eventBus from '@/services/eventBus';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const { fileId } = params;

  try {
    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId parameter' }, { status: 400 });
    }

    const file = await getFileMetadata(fileId);
    if (!file) {
      return NextResponse.json({ error: `File not found: ${fileId}` }, { status: 404 });
    }

    // Ownership check
    const user = await requireUserOrDemo(request);
    const userEmail = (user?.email || '').trim().toLowerCase();
    const ownerEmail = (file.owner || '').trim().toLowerCase();

    // Allow owner or demo administrator
    if (ownerEmail && userEmail && ownerEmail !== userEmail && !userEmail.includes('admin') && !userEmail.includes('demo')) {
      return NextResponse.json(
        { error: 'Unauthorized: Only the file owner can delete this file.' },
        { status: 403 }
      );
    }

    // Delete replica from all 4 storage nodes (best-effort across the cluster)
    const nodeIds = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];
    const deletePromises = nodeIds.map(async (nodeId) => {
      try {
        await deleteFromNode(nodeId, fileId);
      } catch (err) {
        console.warn(`[DELETE_NODE_WARN] Failed to delete ${fileId} on ${nodeId}:`, err.message);
      }
    });
    await Promise.allSettled(deletePromises);

    // Remove from metadata store
    await deleteFileMetadata(fileId);

    // Emit cluster event for live SSE subscribers and audit logs
    eventBus.emitEvent('FILE_DELETED', {
      message: `File "${file.filename}" permanently deleted from all replica nodes by ${user.name || user.email}`,
      fileId,
      filename: file.filename,
      deletedBy: user.email
    });

    return NextResponse.json({
      success: true,
      message: `File "${file.filename}" deleted successfully from cluster.`
    });
  } catch (err) {
    console.error('[API_DELETE_FILE_ERR]', err);
    return NextResponse.json({ error: err.message || 'Failed to delete file' }, { status: 500 });
  }
}
