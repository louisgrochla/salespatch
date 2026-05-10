#!/usr/bin/env bash
# scripts/nerve/simulate-ingest.sh
#
# Hits the SL-MAS ingest endpoints on a NERVE deployment with HMAC-signed
# test payloads. Currently covers A1 (composer-iteration), A2 (site-brief +
# brand-analysis), A4 (lead-profile), A6 (spend). Prints HTTP status +
# response body for each.
#
# Usage:
#   scripts/nerve/simulate-ingest.sh                 # production (default)
#   NERVE_BASE_URL=http://localhost:4400 scripts/nerve/simulate-ingest.sh
#
# Secret resolution order:
#   1. $OUTCOME_INGEST_SECRET from environment
#   2. OUTCOME_INGEST_SECRET line in apps/nerve/.env.local
#
# Test IDs are stamped with a UTC timestamp + the literal "verify-" prefix
# so they are obvious in the database. Cleanup SQL is printed at the end.

set -euo pipefail

NERVE_BASE_URL="${NERVE_BASE_URL:-https://nerve.salespatch.co.uk}"

# Resolve secret
if [ -z "${OUTCOME_INGEST_SECRET:-}" ]; then
  ENV_FILE="$(cd "$(dirname "$0")/../.." && pwd)/apps/nerve/.env.local"
  if [ -f "$ENV_FILE" ]; then
    OUTCOME_INGEST_SECRET="$(grep -E '^OUTCOME_INGEST_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  fi
fi
if [ -z "${OUTCOME_INGEST_SECRET:-}" ]; then
  echo "ERROR: OUTCOME_INGEST_SECRET not set and not found in apps/nerve/.env.local" >&2
  exit 1
fi

STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

LEAD_ID="verify-lead-$STAMP"
ITER_ID="verify-iter-$STAMP"
BRIEF_ID="verify-brief-$STAMP"
ANALYSIS_ID="verify-analysis-$STAMP"

echo "Target: $NERVE_BASE_URL"
echo "Stamp:  $STAMP"
echo

sign_and_post() {
  local path="$1"
  local body="$2"
  local sig
  sig="sha256=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$OUTCOME_INGEST_SECRET" -hex | awk '{print $NF}')"
  local response
  response=$(curl -sS -o /tmp/_nerve_resp -w "%{http_code}" \
    -X POST "$NERVE_BASE_URL$path" \
    -H "Content-Type: application/json" \
    -H "X-Ingest-Signature: $sig" \
    --data-raw "$body" || echo "000")
  echo "→ POST $path"
  echo "  HTTP $response"
  echo "  Body $(cat /tmp/_nerve_resp)"
  echo
}

# ── A4 lead-profile ──────────────────────────────────────────────────────
LEAD_BODY=$(cat <<JSON
{
  "lead_id": "$LEAD_ID",
  "business_name": "Verify Test Cafe",
  "business_type": "cafe",
  "vertical": "hospitality",
  "postcode": "AB10",
  "address": "1 Verify Street, Aberdeen, AB10 1AU",
  "instagram_handle": "verify_test",
  "instagram_followers": 1234,
  "google_rating": 4.8,
  "google_review_count": 42,
  "qualification_score": 0.85,
  "qualifier_verdict": "qualified",
  "qualification_reasons": ["test row from simulate-ingest.sh"],
  "metadata": { "source": "simulate-ingest.sh", "stamp": "$STAMP" },
  "profiled_at": "$ISO"
}
JSON
)
sign_and_post "/api/ingest/lead-profile" "$LEAD_BODY"

# ── Regression: lead-profile with explicit nulls on optional numeric fields.
# Previously the validator rejected JSON null with "X must be number in [0,N]";
# guards against that bug returning. Different lead_id so the upsert path
# is exercised cleanly.
LEAD_NULL_BODY=$(cat <<JSON
{
  "lead_id": "$LEAD_ID-nulls",
  "business_name": "Verify Test Cafe — null fields",
  "vertical": "hospitality",
  "google_rating": null,
  "google_review_count": null,
  "qualification_score": null,
  "qualifier_verdict": null,
  "metadata": { "source": "simulate-ingest.sh", "stamp": "$STAMP", "regression": "null-validators" },
  "profiled_at": "$ISO"
}
JSON
)
sign_and_post "/api/ingest/lead-profile" "$LEAD_NULL_BODY"

# ── A6 spend-ledger ──────────────────────────────────────────────────────
SPEND_BODY=$(cat <<JSON
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4",
  "agent_id": "simulate-ingest",
  "lead_id": "$LEAD_ID",
  "vertical": "hospitality",
  "cost_usd": 0.0042,
  "input_tokens": 100,
  "output_tokens": 50,
  "total_tokens": 150,
  "request_kind": "verification_probe",
  "success": true,
  "metadata": { "source": "simulate-ingest.sh", "stamp": "$STAMP" },
  "occurred_at": "$ISO"
}
JSON
)
sign_and_post "/api/ingest/spend" "$SPEND_BODY"

# ── A1 composer-iteration ────────────────────────────────────────────────
ITER_BODY=$(cat <<JSON
{
  "iteration_id": "$ITER_ID",
  "lead_id": "$LEAD_ID",
  "business_name": "Verify Test Cafe",
  "vertical": "hospitality",
  "html_output": "<!DOCTYPE html><html><body>verify probe $STAMP</body></html>",
  "edit_kind": "ai_generate",
  "editor_notes": "test row from simulate-ingest.sh",
  "metadata": { "source": "simulate-ingest.sh", "stamp": "$STAMP" }
}
JSON
)
sign_and_post "/api/ingest/composer-iteration" "$ITER_BODY"

# ── A2 site-brief ────────────────────────────────────────────────────────
BRIEF_BODY=$(cat <<JSON
{
  "brief_id": "$BRIEF_ID",
  "lead_id": "$LEAD_ID",
  "business_name": "Verify Test Cafe",
  "business_type": "cafe",
  "vertical": "hospitality",
  "postcode": "AB10",
  "address": "1 Verify Street, Aberdeen, AB10 1AU",
  "owner_name": "Verify Owner",
  "verdict": "PROCEED",
  "verdict_reason": "test row from simulate-ingest.sh",
  "google_rating": 4.8,
  "google_review_count": 42,
  "instagram_handle": "verify_test",
  "instagram_followers": 1234,
  "years_trading": "since 2024",
  "awards_press": ["Test Press 2026"],
  "diagnosis": "Test diagnosis from simulate-ingest.sh",
  "pitch_angle": "One-line test pitch angle.",
  "test_of_success": "Owner says: yes that is exactly the problem.",
  "blueprint_sections": [
    { "name": "Hero", "intent": "Open with the headline and CTA." },
    { "name": "Visit", "intent": "Address, hours, map." }
  ],
  "brief_markdown": "# Verify Test Brief\\n\\nGenerated by simulate-ingest.sh at $STAMP.",
  "source": "manual_skill",
  "metadata": { "source": "simulate-ingest.sh", "stamp": "$STAMP" },
  "generated_at": "$ISO"
}
JSON
)
sign_and_post "/api/ingest/site-brief" "$BRIEF_BODY"

# ── A2 brand-analysis ────────────────────────────────────────────────────
ANALYSIS_BODY=$(cat <<JSON
{
  "analysis_id": "$ANALYSIS_ID",
  "lead_id": "$LEAD_ID",
  "brief_id": "$BRIEF_ID",
  "dominant_hex": "#0E0E10",
  "dominant_pct": 70,
  "neutral_hex": "#D9D2C5",
  "neutral_pct": 20,
  "accent_hex": "#C9A24A",
  "accent_pct": 10,
  "display_font": "Abril Fatface",
  "display_fallback": "serif",
  "body_font": "Inter",
  "body_fallback": "sans-serif",
  "mono_font": "Space Mono",
  "mono_fallback": "monospace",
  "logo_description": "Test medallion logo, asset-only.",
  "logo_kind": "asset_only",
  "voice_adjectives": ["all-caps", "factual", "no-nonsense"],
  "voice_quotes": ["CUSTOM AND WALK IN TATTOO STUDIO IN ABERDEEN"],
  "positioning_reference": "Sang Bleu London editorial",
  "positioning_rationale": "Multi-discipline serious studio.",
  "asset_notes": ["Lift the medallion as transparent PNG"],
  "analysis_markdown": "## Test analysis\\n\\nFrom simulate-ingest.sh at $STAMP.",
  "source": "manual_skill",
  "metadata": { "source": "simulate-ingest.sh", "stamp": "$STAMP" },
  "analyzed_at": "$ISO"
}
JSON
)
sign_and_post "/api/ingest/brand-analysis" "$ANALYSIS_BODY"

echo "── Cleanup SQL (run against NERVE Postgres if you want the test rows gone) ──"
cat <<SQL
DELETE FROM "brand_analyses" WHERE analysis_id = '$ANALYSIS_ID';
DELETE FROM "site_briefs" WHERE brief_id = '$BRIEF_ID';
DELETE FROM "composer_iterations" WHERE iteration_id = '$ITER_ID';
DELETE FROM "spend_ledger" WHERE lead_id = '$LEAD_ID';
DELETE FROM "lead_profiles" WHERE lead_id IN ('$LEAD_ID', '$LEAD_ID-nulls');
SQL
