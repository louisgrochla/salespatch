#!/usr/bin/env bash
# Run mobile-api in dev mode with the NERVE forward env vars baked in.
# Reads the NERVE secret from apps/nerve/.env.local so we never paste
# it into source control.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NERVE_ENV="$REPO_ROOT/apps/nerve/.env.local"

if [ ! -f "$NERVE_ENV" ]; then
  echo "ERROR: $NERVE_ENV not found — set up NERVE first." >&2
  exit 1
fi

# Pull SUPABASE_WEBHOOK_SECRET from NERVE's .env.local; that's the secret
# the route's verifySignature() expects.
SECRET=$(grep -E '^SUPABASE_WEBHOOK_SECRET=' "$NERVE_ENV" | head -1 | cut -d'=' -f2- | sed -E 's/^"//; s/"$//')
if [ -z "$SECRET" ]; then
  echo "ERROR: SUPABASE_WEBHOOK_SECRET not set in $NERVE_ENV" >&2
  exit 1
fi

export NERVE_PITCH_SECRET="$SECRET"
export NERVE_PITCH_URL="${NERVE_PITCH_URL:-http://localhost:4400/api/ingest/pitch}"

echo "→ NERVE forwarding: $NERVE_PITCH_URL"
echo "→ SECRET: ${SECRET:0:8}…"

cd "$REPO_ROOT/apps/mobile-api"
exec npm run dev
