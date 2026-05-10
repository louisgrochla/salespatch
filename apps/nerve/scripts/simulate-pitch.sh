#!/usr/bin/env bash
# Simulate a Supabase pitch webhook hitting NERVE — end-to-end test for
# the SL-MAS outcome ingestion path.
#
# Sends a Supabase-shaped INSERT envelope to /api/ingest/pitch with the
# right HMAC signature. NERVE upserts a PitchLog row, then in the same
# handler calls outcomeIngester.ingest() which writes outcomes locally
# and attaches them to the matching episode.
#
# Usage:
#   cd apps/nerve
#   bash scripts/simulate-pitch.sh summerhill-bake closed_now 350
#   bash scripts/simulate-pitch.sh marigold-florist rejected
#
# Args:
#   $1 — lead slug. Match the seeded fixture:
#        summerhill-bake | marigold-florist (the 2 pending ones)
#        or any of: source-barber, stoneham-cuts, fountain-st-barber,
#        kent-fade, riverside-cafe, glen-st-coffee, bridge-pantry, ace-bakery
#        (the 8 already-pitched ones — re-pitching them is idempotent
#        on pitchLog.id so will produce a new PitchLog but skip the
#        outcome ingest as a duplicate via external_id)
#   $2 — outcome enum. Valid:
#        closed_now | closed_followup | rejected | follow_up | not_pitched
#   $3 — agreed_price_gbp (optional, default 350)
#
# Env (loaded from .env.local if present):
#   SUPABASE_WEBHOOK_SECRET — required, used to sign the request body
#   NERVE_URL — optional, defaults to https://nerve.salespatch.co.uk
#
# Set NERVE_URL=http://localhost:4400 to test against local dev.

set -euo pipefail

LEAD="${1:?lead slug required — e.g. summerhill-bake}"
OUTCOME="${2:?outcome required — closed_now | closed_followup | rejected | follow_up | not_pitched}"
PRICE="${3:-350}"

# Load production env from .env.local (gives us SUPABASE_WEBHOOK_SECRET)
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${SUPABASE_WEBHOOK_SECRET:-}" ]; then
  echo "ERROR: SUPABASE_WEBHOOK_SECRET not set." >&2
  echo "Either source .env.local or export it manually." >&2
  exit 1
fi

URL="${NERVE_URL:-https://nerve.salespatch.co.uk}/api/ingest/pitch"

# Map seeded slug → business name + sector. Names must match exactly so
# OutcomeIngester's business_name+date fallback catches the seeded decision.
case "$LEAD" in
  source-barber)        BIZ="Source Barber";        SECTOR="health" ;;
  stoneham-cuts)        BIZ="Stoneham Cuts";        SECTOR="health" ;;
  fountain-st-barber)   BIZ="Fountain St Barber";   SECTOR="health" ;;
  kent-fade)            BIZ="Kent Fade";            SECTOR="health" ;;
  riverside-cafe)       BIZ="Riverside Cafe";       SECTOR="hospitality" ;;
  glen-st-coffee)       BIZ="Glen St Coffee";       SECTOR="hospitality" ;;
  bridge-pantry)        BIZ="Bridge Pantry";        SECTOR="hospitality" ;;
  ace-bakery)           BIZ="Ace Bakery";           SECTOR="hospitality" ;;
  summerhill-bake)      BIZ="Summerhill Bakehouse"; SECTOR="hospitality" ;;
  marigold-florist)     BIZ="Marigold Florist";     SECTOR="retail" ;;
  *)                    BIZ="$LEAD";                SECTOR="other" ;;
esac

# pitchId — used as outcome external_id, so re-runs of the same pitch
# are idempotent. Including epoch seconds means each script invocation
# produces a fresh PitchLog row.
PITCH_ID="simulate-${LEAD}-$(date +%s)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# Compact single-line JSON — server must HMAC the exact body it receives.
# Pretty-printing here would be nicer but adds risk of trailing whitespace
# changing the signature.
PAYLOAD=$(cat <<JSON
{"type":"INSERT","table":"pitches","record":{"id":"${PITCH_ID}","business_name":"${BIZ}","sector":"${SECTOR}","outcome":"${OUTCOME}","consent_to_record":true,"decision_maker_present":true,"demo_shown":true,"interest_level":"warm","demo_reaction":"loved","agreed_price":${PRICE},"payment_method":"paid_now","pitch_duration":120,"objections":[],"notes":"simulate-pitch.sh","date":"${TIMESTAMP}"}}
JSON
)

# HMAC-SHA256 of the raw body. macOS openssl prepends "(stdin)= " to the
# hex digest; sed strips that.
SIGNATURE="sha256=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SUPABASE_WEBHOOK_SECRET" -hex | sed 's/^.*= //' | tr -d ' \n')"

echo "→ POST ${URL}"
echo "  pitch_id : ${PITCH_ID}"
echo "  lead     : ${LEAD}  (\"${BIZ}\")"
echo "  outcome  : ${OUTCOME}"
echo "  price    : £${PRICE}"
echo ""

RESPONSE_FILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-supabase-signature: ${SIGNATURE}" \
  --data-binary "$PAYLOAD")

echo "← HTTP ${HTTP_CODE}"
cat "$RESPONSE_FILE"
echo ""
echo ""
rm -f "$RESPONSE_FILE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✓ ingest accepted"
  echo "  Now check:"
  echo "    https://nerve.salespatch.co.uk/pipeline/episodes (look for ${LEAD})"
  echo "    https://nerve.salespatch.co.uk/pipeline (close-rate updates)"
else
  echo "✗ ingest rejected (HTTP ${HTTP_CODE})"
  echo "  Common causes:"
  echo "    401 — SUPABASE_WEBHOOK_SECRET in .env.local doesn't match Vercel"
  echo "    400 — payload validation failed; check 'outcome' enum spelling"
  echo "    500 — server-side error; check Vercel function logs"
  exit 1
fi
