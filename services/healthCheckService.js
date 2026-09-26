import cron from 'node-cron';
import { getAllNodes, updateNodeStatus, getMetadata, updateReplicaStatus } from './metadataService.js';
import { pingNode, readFromNode, uploadToNode } from './nodeStorageService.js';
import { recoverFailedNode } from './recoveryService.js';
import eventBus from './eventBus.js';
import { isPersistentRuntime } from './runtime.js';

let cronTask = null;
let isChecking = false;

/**
 * Guards against concurrent ticks within a single warm instance. On serverless
 * that is the best we can do locally; the durable node-status state in metadata
 * still makes the 1-miss/3-miss rules converge across invocations.
 */
function alreadyRunning() {
  if (!isChecking) return false;
  if (global.__hellockHealthCheck) return true;
  global.__hellockHealthCheck = true;
  setTimeout(() => { global.__hellockHealthCheck = false; }, 10000);
  return true;
}

/**
 * Pings all nodes, updates health states, and triggers auto-recovery when needed.
 *
 * Rules strictly implemented:
 * - Rule 4: Ping every 10s. Mark "suspected" after 1 failure, "confirmed down" after 3 consecutive failures.
 * - Rule 5: Auto-recovery triggered when confirmed down.
 * - Rule 7: When a recovered node comes back online, run version reconciliation / read repair.
 */
export async function runHealthCheck() {
  if (alreadyRunning()) return;
  isChecking = true;

  try {
    const nodes = await getAllNodes();

    for (const [nodeId, node] of Object.entries(nodes)) {
      const isReachable = await pingNode(nodeId);

      if (isReachable) {
        // Node is responding
        const previousStatus = node.status;
        const hadFailures = node.consecutiveFailures > 0;

        if (hadFailures || previousStatus === 'suspected' || previousStatus === 'confirmed_down') {
          // Node just came back online!
          const newStatus = node.role === 'standby' ? 'standby' : 'healthy';

          await updateNodeStatus(nodeId, {
            status: newStatus,
            consecutiveFailures: 0,
            simulatedFailure: false,
            lastPing: new Date().toISOString()
          });

          eventBus.emitEvent('NODE_RECOVERED', {
            message: `Node ${nodeId} is back online! Transitioned from [${previousStatus}] to [${newStatus}]`,
            nodeId,
            status: newStatus
          });

          // Rule 7: Version Reconciliation & Read Repair
          // If node was previously down, check its files for old versions
          if (previousStatus === 'confirmed_down' || previousStatus === 'suspected') {
            await reconcileRecoveredNode(nodeId);
          }
        } else {
          // Normal healthy heartbeat
          await updateNodeStatus(nodeId, {
            lastPing: new Date().toISOString()
          });
        }
      } else {
        // Node ping failed!
        const nextFailures = (node.consecutiveFailures || 0) + 1;

        if (nextFailures < 3) {
          // 1 or 2 failures: Mark "suspected" (potential brief network partition)
          const newStatus = 'suspected';
          await updateNodeStatus(nodeId, {
            status: newStatus,
            consecutiveFailures: nextFailures,
            lastPing: new Date().toISOString()
          });

          eventBus.emitEvent('NODE_SUSPECTED', {
            message: `⚠️ Node ${nodeId} ping failed (${nextFailures}/3). Status: SUSPECTED (network partition / unstable).`,
            nodeId,
            consecutiveFailures: nextFailures,
            status: newStatus
          });
        } else {
          // 3 or more consecutive failures: Mark "confirmed down" and trigger auto-recovery!
          const wasAlreadyConfirmed = node.status === 'confirmed_down';

          await updateNodeStatus(nodeId, {
            status: 'confirmed_down',
            consecutiveFailures: nextFailures,
            lastPing: new Date().toISOString()
          });

          if (!wasAlreadyConfirmed) {
            eventBus.emitEvent('NODE_CONFIRMED_DOWN', {
              message: `🚨 Node ${nodeId} has failed 3 consecutive pings! Status: CONFIRMED DOWN. Triggering auto-recovery to standby...`,
              nodeId,
              consecutiveFailures: nextFailures,
              status: 'confirmed_down'
            });

            // Trigger Rule 5: Auto-recovery to standby node
            try {
              await recoverFailedNode(nodeId);
            } catch (recErr) {
              console.error(`[RECOVERY_ERR] Auto-recovery failed for ${nodeId}:`, recErr);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[HEALTH_CHECK_ERR]', err);
  } finally {
    isChecking = false;
  }
}

/**
 * Rule 7: Read repair on a recovered node.
 * Scans files on the recovered node. If the cluster has a newer version,
 * overwrites the stale file with the latest version.
 */
async function reconcileRecoveredNode(nodeId) {
  try {
    const meta = await getMetadata();
    const files = Object.values(meta.files || {});

    for (const file of files) {
      const replica = file.replicas && file.replicas[nodeId];
      if (replica && replica.version < file.version) {
        // Stale version detected on recovered node! Find latest replica from healthy node
        const healthySurvivingNode = Object.entries(file.replicas)
          .find(([nid, rep]) => nid !== nodeId && rep.status === 'synced');

        if (healthySurvivingNode) {
          try {
            const latestBuffer = await readFromNode(healthySurvivingNode[0], file.fileId);
            await uploadToNode(nodeId, file.fileId, latestBuffer);
            await updateReplicaStatus(file.fileId, nodeId, 'synced', file.version);

            eventBus.emitEvent('READ_REPAIR_SUCCESS', {
              message: `Reconciled recovered ${nodeId}: updated "${file.filename}" from v${replica.version} -> v${file.version}`,
              nodeId,
              fileId: file.fileId,
              newVersion: file.version
            });
          } catch (e) {
            // ignore
          }
        }
      }
    }
  } catch (err) {
    console.error(`[RECONCILE_ERR] Failed reconciling ${nodeId}:`, err);
  }
}

/**
 * Starts the background health check cron job (every 10 seconds).
 *
 * This ONLY runs on a long-lived Node process. A serverless function is frozen
 * between invocations, so a timer registered here would never fire again. On
 * serverless the same `runHealthCheck()` is instead driven on demand by:
 *   - GET /api/status  (the admin panel polls this every 10s), and
 *   - the Netlify scheduled function at netlify.toml `[[scheduled_functions]]`,
 *     which keeps failover running even when nobody has the site open.
 */
export function startHealthCheckCron() {
  if (cronTask) return;

  if (!isPersistentRuntime()) {
    if (!global._vaultCronSkipped) {
      global._vaultCronSkipped = true;
      console.log(
        '[VAULT CRON] Serverless runtime - in-process cron disabled. ' +
        'Health checks run via /api/status polls and the Netlify scheduled function.'
      );
    }
    return;
  }

  // Run every 10 seconds: "*/10 * * * * *"
  cronTask = cron.schedule('*/10 * * * * *', async () => {
    await runHealthCheck();
  });

  console.log('[VAULT CRON] Background health check cron service active (10s interval).');
}

/**
 * Stops the background cron job.
 */
export function stopHealthCheckCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
}

// Auto-start on module evaluation in Node runtime (no-op on serverless)
if (!global._vaultCronStarted) {
  global._vaultCronStarted = true;
  startHealthCheckCron();
}
