import { NextResponse } from 'next/server';
import { runHealthCheck } from '@/services/healthCheckService';
import { storageRuntimeInfo } from '@/services/nodeStorageService';
import { metadataStoreInfo } from '@/services/metadataService';

/**
 * ==============================================================================
 * HELLOCK: SCHEDULED HEALTH CHECK
 * ==============================================================================
 * On a persistent host `node-cron` ticks every 10s inside services/
 * healthCheckService.js. A serverless function is frozen between invocations,
 * so that timer can never fire. This route is the serverless equivalent,
 * registered in netlify.toml under `[[scheduled_functions]]` and invoked by
 * Netlify's scheduler (minimum practical cadence: every 1 minute).
 *
 * It performs exactly the same detection / SUSPECTED / CONFIRMED_DOWN /
 * auto-recovery work as the in-process cron tick, so failover and bit-rot
 * self-healing keep working on Netlify even when nobody has /admin open.
 * Note that Netlify's minimum scheduled cadence is 1 minute, not 10 seconds:
 * a partition is therefore confirmed after 1 missed scheduled run rather than
 * 3 back-to-back pings. /api/status still runs a tick inline, so an open admin
 * panel retains the full 10s / 3-miss demo fidelity.
 *
 * Deploying to Render/Railway/Docker/VPS? This route is harmless - the in-process
 * cron is running there and this just adds one extra tick.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request) {
  const startedAt = Date.now();

  try {
    await runHealthCheck();

    return NextResponse.json({
      ok: true,
      triggeredBy: 'scheduled-function',
      durationMs: Date.now() - startedAt,
      runtime: {
        storage: storageRuntimeInfo(),
        metadata: metadataStoreInfo()
      }
    });
  } catch (err) {
    console.error('[VAULT_CRON] Scheduled health check failed:', err);
    return NextResponse.json(
      { ok: false, error: err.message, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
