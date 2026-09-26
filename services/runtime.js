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
 * True when the process is running on a serverless/edge function platform
 * (Netlify Functions, Vercel). Detection is based on the platform-injected
 * env vars, which are the documented contract of both runtimes.
 */
export function isServerless() {
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
