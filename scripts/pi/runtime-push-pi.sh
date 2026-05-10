#!/usr/bin/env bash
# Push the OpenClaw Core Runtime (Node, port 4317) to the Pi and restart its
# systemd unit. Companion to mc-push-pi.sh which handles the Mission Control
# Next.js app on port 3001.
#
# Usage:
#   bash scripts/pi/runtime-push-pi.sh                # default deploy
#   PI_HOST=openclaw@pi400 bash scripts/pi/runtime-push-pi.sh
#
# What it does:
#   1. Builds locally (tsc → dist/)
#   2. Rsyncs source + dist to Pi, EXCLUDING data/ so mvp.sqlite is untouched
#   3. Runs `npm install` on Pi (production deps)
#   4. Idempotently appends MISSION_CONTROL_API_TOKEN + OUTCOME_INGEST_SECRET
#      to runtime.env if missing (32-byte hex, generated on Pi)
#   5. Restarts core-runtime.service
#   6. Health-checks port 4317
#
# What it does NOT do:
#   - Touch data/mvp.sqlite (preserved)
#   - Touch existing env vars
#   - Enable Tailscale Funnel (separate step — `tailscale funnel --bg 4317`)

set -euo pipefail

LOCAL_REPO="${LOCAL_REPO:-/Users/Avii/Desktop/klaude-repo}"
PI_HOST="${PI_HOST:-openclaw@100.93.24.14}"
REMOTE_REPO="${REMOTE_REPO:-/home/openclaw/klaude-repo}"
RUNTIME_PORT="${RUNTIME_PORT:-4317}"
ENV_FILE="${ENV_FILE:-/home/openclaw/.config/openclaw/runtime.env}"
SSH_OPTS="${SSH_OPTS:--o ServerAliveInterval=20 -o ServerAliveCountMax=6 -o ConnectTimeout=10}"

ssh_run() {
  # shellcheck disable=SC2086
  ssh ${SSH_OPTS} "${PI_HOST}" "$@"
}

echo "[1/6] Building locally"
cd "${LOCAL_REPO}"
npm run build > /tmp/runtime-push-build.log 2>&1
echo "    build ok ($(wc -l < /tmp/runtime-push-build.log) lines, full log /tmp/runtime-push-build.log)"

echo "[2/6] Syncing repo to ${PI_HOST}:${REMOTE_REPO} (preserving data/)"
rsync -az --info=progress2 \
  --exclude '.git' \
  --exclude '.env.local' \
  --exclude 'apps/mission-control/.env.local' \
  --exclude 'apps/nerve/node_modules' \
  --exclude 'apps/nerve/.next' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'coverage' \
  --exclude 'data/' \
  --exclude 'mission-control.db*' \
  "${LOCAL_REPO}/" "${PI_HOST}:${REMOTE_REPO}/"

echo "[3/6] Installing production deps on Pi"
ssh_run "cd '${REMOTE_REPO}' && npm install --omit=dev"

echo "[4/6] Ensuring runtime.env has the new SL-MAS secrets"
ssh_run "
  set -e
  ENV_FILE='${ENV_FILE}'
  added=()
  if ! grep -q '^MISSION_CONTROL_API_TOKEN=' \"\$ENV_FILE\"; then
    echo 'MISSION_CONTROL_API_TOKEN='\"\$(openssl rand -hex 32)\" >> \"\$ENV_FILE\"
    added+=('MISSION_CONTROL_API_TOKEN')
  fi
  if ! grep -q '^OUTCOME_INGEST_SECRET=' \"\$ENV_FILE\"; then
    echo 'OUTCOME_INGEST_SECRET='\"\$(openssl rand -hex 32)\" >> \"\$ENV_FILE\"
    added+=('OUTCOME_INGEST_SECRET')
  fi
  if [ \${#added[@]} -gt 0 ]; then
    echo 'added: '\"\${added[*]}\"
  else
    echo 'env already complete'
  fi
"

echo "[5/6] Restarting core-runtime.service"
ssh_run "systemctl --user restart core-runtime.service && sleep 3 && systemctl --user --no-pager --full status core-runtime.service | sed -n '1,12p'"

echo "[6/6] Health check"
ssh_run "
  ss -ltnp 2>/dev/null | grep ':${RUNTIME_PORT}' || echo 'WARNING: nothing listening on ${RUNTIME_PORT}'
  curl -sS -m 5 http://127.0.0.1:${RUNTIME_PORT}/api/health || echo 'WARNING: /api/health did not respond'
"

cat <<'EOF'

✓ Runtime push complete.

Next steps (you run these):
  1. Read the secrets back from the Pi (one-time, to set on Vercel):
       ssh openclaw@100.93.24.14 'grep -E "^(MISSION_CONTROL_API_TOKEN|OUTCOME_INGEST_SECRET)=" /home/openclaw/.config/openclaw/runtime.env'

  2. Enable Tailscale Funnel for port 4317:
       ssh openclaw@100.93.24.14 'tailscale funnel --bg 4317'
       ssh openclaw@100.93.24.14 'tailscale funnel status'

  3. Set Vercel env vars on the NERVE project (use the value from step 1):
       RUNTIME_URL = https://pi400.<your-tailnet>.ts.net (from Funnel status)
       MISSION_CONTROL_API_TOKEN = <from step 1>
       OUTCOME_INGEST_SECRET = <from step 1>

  4. Trigger NERVE redeploy on Vercel.

  5. Visit https://nerve.salespatch.co.uk/pipeline.

EOF
