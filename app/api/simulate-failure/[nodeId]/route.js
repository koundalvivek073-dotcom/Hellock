import { NextResponse } from 'next/server';
import { setSimulatedFailure, isSimulatedFailed } from '@/services/nodeStorageService';
import { updateNodeStatus, getMetadata } from '@/services/metadataService';
import { runHealthCheck } from '@/services/healthCheckService';
import eventBus from '@/services/eventBus';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { nodeId } = params;

  try {
    const meta = await getMetadata();
    const node = meta.nodes[nodeId];

    if (!node) {
      return NextResponse.json({ error: `Invalid node ID: ${nodeId}` }, { status: 404 });
    }

    let targetState = null;
    try {
      const body = await request.json();
      if (body.action === 'fail') targetState = true;
      if (body.action === 'recover') targetState = false;
    } catch (e) {
      // no body, default to toggle
    }

    if (targetState === null) {
      targetState = !isSimulatedFailed(nodeId);
    }

    // Set simulated failure flag
    setSimulatedFailure(nodeId, targetState);

    await updateNodeStatus(nodeId, {
      simulatedFailure: targetState
    });

    eventBus.emitEvent('SIMULATE_FAILURE_TOGGLED', {
      message: `Manual demo trigger: Node ${nodeId} simulated failure state set to [${targetState ? 'DISCONNECTED / FAILING' : 'ONLINE / RECOVERED'}]`,
      nodeId,
      simulatedFailure: targetState
    });

    // Run health check tick immediately to demonstrate instant partition/failure detection
    await runHealthCheck();

    const updatedMeta = await getMetadata();
    return NextResponse.json({
      success: true,
      nodeId,
      simulatedFailure: targetState,
      node: updatedMeta.nodes[nodeId]
    });
  } catch (err) {
    console.error('[API_SIMULATE_FAILURE_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
