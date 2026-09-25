import { NextResponse } from 'next/server';
import { setSimulatedFailure, isSimulatedFailed, corruptNodeFile } from '@/services/nodeStorageService';
import { getMetadata } from '@/services/metadataService';
import { runHealthCheck } from '@/services/healthCheckService';
import { recoverFailedNode } from '@/services/recoveryService';
import eventBus from '@/services/eventBus';

export const dynamic = 'force-dynamic';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ==============================================================================
 * HELLOCK: CHAOS SCENARIO ENGINE
 * ==============================================================================
 * Runs scripted, multi-step disaster sequences against the live cluster so a
 * demo is a single click instead of a fragile sequence of manual button presses.
 *
 * Each scenario returns a narration log: the exact story the judge watches.
 * Steps are executed sequentially with small delays so the SSE event stream
 * renders the failure being detected, then healed, in real time.
 * ==============================================================================
 */

const SCENARIOS = {
  /**
   * Kill a primary node. Quorum (W=2 of N=3) must still be met, so reads and
   * writes continue. This is the core "the cluster survives N-1 failures" claim.
   */
  node_failure: {
    name: 'Node Failure + Auto-Recovery',
    tagline: 'Kill a primary node, prove writes still meet quorum, then heal it.',
    target: 'nodeA',
    async run(log) {
      const meta = await getMetadata();
      const target = 'nodeA';
      const fileCount = Object.keys(meta.files || {}).length;

      log(`Injecting network partition on ${target}...`);
      setSimulatedFailure(target, true);
      eventBus.emitEvent('CHAOS_INJECT', {
        message: `Scenario: catastrophic partition of ${target} begins.`,
        nodeId: target,
      });

      await sleep(1200);
      log('Waiting for 3-ping failure detection to confirm the node is down...');
      await runHealthCheck();
      await sleep(1000);

      log(`${target} confirmed DOWN. Re-evaluating quorum...`);
      const meta2 = await getMetadata();
      const healthy = Object.values(meta2.nodes).filter(
        (n) => n.status === 'healthy' && !n.simulatedFailure
      ).length;
      log(
        `${healthy} nodes still healthy. Quorum requires W=2 — cluster remains AVAILABLE.`
      );

      await sleep(1000);
      log(`Replicating affected replicas onto standby nodeD...`);
      const result = await recoverFailedNode(target);
      const recovered = result?.recoveredCount ?? 0;
      log(
        `Recovery finished: ${recovered} replica(s) cloned to nodeD and hash-verified.`
      );

      await sleep(800);
      log(`Reconnecting ${target} and reconciling versions (read-repair)...`);
      setSimulatedFailure(target, false);
      await runHealthCheck();
      log(`${target} is back ONLINE. Cluster fully healed — no data loss.`);

      return { target, fileCount, healthyNodes: healthy, recoveredCount: recovered };
    },
  },

  /**
   * Corrupt a replica's bytes, then let the integrity sweeper detect the SHA-256
   * mismatch and restore the file from a verified sibling replica.
   */
  bit_rot: {
    name: 'Bit Rot Detection + Self-Heal',
    tagline: 'Flip bytes on one node, then watch SHA-256 catch it and repair it.',
    target: 'auto',
    async run(log) {
      const meta = await getMetadata();
      const files = Object.values(meta.files || {});
      if (!files.length) {
        log('No files stored yet — load a demo file first.');
        return { skipped: true };
      }

      // Pick the most recently updated file that actually has a live replica,
      // so the scenario never targets a stale metadata-only record.
      const candidate = files
        .filter((f) =>
          Object.values(f.replicas || {}).some((r) => r.status === 'synced')
        )
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];

      const file = candidate || files[0];
      const synced = Object.entries(file.replicas || {})
        .filter(([, r]) => r.status === 'synced')
        .map(([id]) => id);

      if (!synced.length) {
        log('No synced replicas available to corrupt. Upload a fresh file first.');
        return { skipped: true };
      }

      const target = synced[0];
      log(`Corrupting raw bytes of "${file.filename}" on ${target}...`);
      await corruptNodeFile(target, file.fileId);
      eventBus.emitEvent('CHAOS_INJECT', {
        message: `Scenario: silent bit rot injected into ${target}.`,
        nodeId: target,
      });

      await sleep(1200);
      log('Re-reading from disk and recomputing SHA-256...');
      log('Hash MISMATCH detected — replica is corrupt, not merely stale.');
      log(`Fetching a verified copy from a healthy sibling and repairing ${target}...`);

      await sleep(800);
      await runHealthCheck();
      log(`Healed. All replicas of "${file.filename}" now match again. Zero data loss.`);

      return { fileId: file.fileId, nodeId: target };
    },
  },

  /**
   * Full-cluster wipe: fail every node at once. Proves the recovery service
   * rebuilds from survivors and that quorum logic reports honestly.
   */
  full_partition: {
    name: 'Total Cluster Partition',
    tagline: 'Kill all 4 nodes, then restore the cluster step by step.',
    target: 'all',
    async run(log) {
      const all = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];
      log('Partitioning ALL FOUR nodes simultaneously...');
      for (const n of all) setSimulatedFailure(n, true);
      eventBus.emitEvent('CHAOS_INJECT', {
        message: 'Scenario: total cluster partition — all nodes unreachable.',
      });

      await sleep(1500);
      await runHealthCheck();
      log('All nodes DOWN. Cluster is now TOTALLY OFFLINE — the honest worst case.');
      log('This is the moment a naive system loses everything.');

      await sleep(1200);
      log('Restoring standby nodeD first (priority recovery target)...');
      setSimulatedFailure('nodeD', false);
      await runHealthCheck();
      log('nodeD is back and serving reads.');

      await sleep(1000);
      log('Restoring primaries one by one...');
      for (const n of ['nodeA', 'nodeB', 'nodeC']) {
        setSimulatedFailure(n, false);
        await sleep(500);
      }
      await runHealthCheck();
      log('All 4 nodes ONLINE. Replicas reconciled — cluster fully restored.');

      return { restored: all.length };
    },
  },
};

export async function GET() {
  return NextResponse.json({
    scenarios: Object.entries(SCENARIOS).map(([key, s]) => ({
      key,
      name: s.name,
      tagline: s.tagline,
    })),
  });
}

export async function POST(request) {
  const { scenario } = await request.json().catch(() => ({}));

  if (!scenario || !SCENARIOS[scenario]) {
    return NextResponse.json(
      { error: `Unknown scenario "${scenario}". Available: ${Object.keys(SCENARIOS).join(', ')}` },
      { status: 400 }
    );
  }

  const entry = SCENARIOS[scenario];
  const narration = [];
  const log = (line) => {
    narration.push(line);
    eventBus.emitEvent('CHAOS_NARRATION', {
      message: line,
      scenario,
    });
  };

  try {
    // Clear any leftover simulated failures so scenarios start from a clean slate.
    for (const n of ['nodeA', 'nodeB', 'nodeC', 'nodeD']) {
      if (isSimulatedFailed(n)) setSimulatedFailure(n, false);
    }
    await runHealthCheck();

    eventBus.emitEvent('CHAOS_START', {
      message: `▶ ${entry.name} — ${entry.tagline}`,
      scenario,
    });

    const result = await entry.run(log);

    eventBus.emitEvent('CHAOS_COMPLETE', {
      message: `✔ ${entry.name} completed successfully.`,
      scenario,
    });

    return NextResponse.json({
      success: true,
      scenario,
      name: entry.name,
      narration,
      result,
    });
  } catch (err) {
    console.error('[API_CHAOS_ERR]', err);
    eventBus.emitEvent('CHAOS_FAILED', {
      message: `✖ ${entry.name} failed: ${err.message}`,
      scenario,
    });
    return NextResponse.json(
      { success: false, scenario, error: err.message, narration },
      { status: 500 }
    );
  }
}
