#!/bin/sh
# Container entrypoint: boots the 4-node storage cluster AND the Next.js server.
# Without this, the container would serve the web UI while all 4 micro-nodes
# stayed dead, silently degrading Hellock into a single-process app.

# No `set -e`: the watchdog below intentionally handles non-zero exits itself.
set -u

echo "==================================================="
echo " HELLOCK — Distributed Object Storage"
echo " Booting 4-node storage cluster + web server"
echo "==================================================="

# 1. Start the storage node cluster in the background.
node scripts/start-nodes.mjs &
NODE_PID=$!

# Give the nodes a moment to bind their sockets before the web server
# starts health-checking / reading from them.
sleep 3

# 2. Start the web server in the foreground so it becomes the container's
#    main process and receives SIGTERM / Ctrl+C properly.
node_modules/.bin/next start -p "${PORT:-3000}" &
WEB_PID=$!

# 3. Watchdog: busybox `ash` (Alpine's sh) has no `wait -n`, so poll instead.
#    If either critical process dies, tear the whole container down — an
#    orchestrator should never see a half-dead cluster.
while kill -0 "$WEB_PID" 2>/dev/null && kill -0 "$NODE_PID" 2>/dev/null; do
  sleep 2
done

echo "[ENTRYPOINT] a critical process exited; shutting down the cluster."
kill -TERM "$WEB_PID" "$NODE_PID" 2>/dev/null || true
wait "$WEB_PID" 2>/dev/null || true
wait "$NODE_PID" 2>/dev/null || true
exit 1
