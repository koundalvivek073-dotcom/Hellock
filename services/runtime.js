/**
 * ==============================================================================
 * HELLOCK: RUNTIME CAPABILITY DETECTION
 * ==============================================================================
 * The same codebase has to boot in two very different environments:
 *
 *   1. "persistent"  - a long-lived Node process (local `npm run dev`, Docker,
 *      Render, Railway, Fly.io, a VPS). Here we are allowed to open TCP
 *      listeners, write to local disk, and run an in-process cron loop.
 *
 *   2. "serverless"  - Netlify Functions / Vercel. A single short-lived,
 *      stateless invocation. We CANNOT:
 *        - bind auxiliary ports (4001-4004) and be reached over them,
 *        - rely on the local filesystem persisting (read-only + wiped),
 *        - keep a cron timer alive between requests.
 *
 * Every service asks this module instead of sniffing the environment itself, so
 * there is exactly one place that decides "am I allowed to do process-y things".
 * ==============================================================================
 */

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function env(name) {
  const v = process.env?.[name];
  return v && String(v).trim() !== '' ? String(v).trim() : undefined;
}

/**
 * True while `next build` is running.
 *
 * This matters because Netlify/Vercel run the build on the same platform that
 * serves the site, so NETLIFY=true / VERCEL=1 are set during `next build` too.
 * Without this check the app would conclude "serverless" at build time and:
 *   - skip the disk backend in favour of Netlify Blobs (unavailable in a build
 *     worker -> the store falls back to memory, or the write fails),
 *   - auto-start the node-cron loops at module evaluation, keeping the build
 *     process alive forever so the build times out and Netlify publishes
 *     nothing (every route then 404s).
 *
 * `next build` sets NODE_ENV=production for the whole build, so it cannot be
 * used to detect this. NEXT_PHASE is the reliable signal.
 */
export function isBuildPhase() {
  if (env('NEXT_PHASE') === 'phase-production-build') return true;
  // Next 14 also exposes this flag to the build workers.
  return TRUTHY.has((env('NEXT_BUILD_PHASE') || '').toLowerCase());
}

/**
 * True when the process is running on a serverless/edge function platform
 * (Netlify Functions, Vercel). Detection is based on the platform-injected
 * env vars, which are the documented contract of both runtimes.
 *
 * During `next build` this deliberately returns false: the build is a
 * short-lived, single-shot process that must behave like a plain Node process
 * (write to its own disk, bind nothing, exit cleanly). Note that this makes the
 * build use the DISK backend, which is correct: `data/nodes` and
 * `data/metadata.json` are build inputs, not build outputs, and they are never
 * bundled into the Netlify Function. At runtime NEXT_PHASE is unset, so
 * isServerless() is true again and Netlify Blobs is selected as intended.
 */
export function isServerless() {
  if (isBuildPhase()) return false;
  if (TRUTHY.has((env('HELLOCK_SERVERLESS') || '').toLowerCase())) return true;
  if (env('NETLIFY') === 'true' || env('NETLIFY_LOCAL') === 'true') return true;
  if (env('VERCEL') === '1' || env('VERCEL_ENV')) return true;
  if (env('AWS_LAMBDA_FUNCTION_NAME')) return true;
  return false;
}

/**
 * True when a long-lived Node process is available: local dev, Docker, or any
 * traditional host running `next start` / `npm start`.
 */
export function isPersistentRuntime() {
  return !isServerless();
}

/**
 * When true, the app intentionally runs with the in-process TCP micro-node
 * cluster. Defaults to "yes, unless we're on serverless". Set
 * HELLOCK_ENABLE_MICRO_NODES=false to disable the listeners even on a
 * persistent host (e.g. to run against remote object storage everywhere).
 */
export function microNodesEnabled() {
  // Never bind TCP ports while building: the ports are useless to a build and
  // an open listener prevents the process from exiting.
  if (isBuildPhase()) return false;

  const override = (env('HELLOCK_ENABLE_MICRO_NODES') || '').toLowerCase();
  if (override === 'false' || override === '0' || override === 'no' || override === 'off') {
    return false;
  }
  return isPersistentRuntime();
}

/**
 * True when the local filesystem is a safe place to keep durable state.
 * On serverless the bundle is read-only and reset on every cold start, so the
 * app must use a durable backend instead.
 */
export function canUseLocalDisk() {
  return isPersistentRuntime();
}

/** Short human-readable label used in /api/status and the admin panel. */
export function runtimeLabel() {
  if (isServerless()) return 'serverless';
  return 'persistent';
}
