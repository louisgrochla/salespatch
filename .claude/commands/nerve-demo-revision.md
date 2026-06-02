---
name: nerve-demo-revision
description: Re-push an edited demo (new photos / final touches) to NERVE as the new latest artefact, and log the change
---

Push a post-build demo edit ("v2 change") into NERVE so the warehouse — and the
public demo URL it serves — reflect what's actually on disk. Use after you've
edited `~/Desktop/salespatch-demos/<slug>/outputs/demo.html` following a sale
(new client photos, copy tweaks, final touches).

**Why this works with zero schema change:** `demo_artefacts` is idempotent on
`artefact_id`, and NERVE serves the *newest* artefact for a lead
(`demoArtefactStore.latestForLead`, ordered by `generated_at DESC`) on both the
public route `/api/public/demo/<slug>` and `/api/read/lead-bundle`. So re-posting
the edited HTML under a **fresh timestamped `artefact_id`** makes it the live demo
immediately, while every prior build/revision stays as an append-only audit row.
The `metadata` JSONB carries the revision reason, so nothing about the change is lost.

Arguments: `<slug>` then a short `<reason>`, optional `--changed a,b,c`.
Example: `/nerve-demo-revision chatty-patty "new client photos + final touches" --changed photos,hero,hours`

## Step 1 — re-push the edited demo as a new artefact

Reads the existing `outputs/demo-artefact.json` sidecar to carry forward
`lead_id`, `business_name`, `vertical`, `brief_id`, `aesthetic_positioning`,
`dominant_hex` and the prior metadata, then overlays revision fields and writes
the sidecar back so the supersedes-chain stays correct across repeated revisions.
The helper streams the (multi-MB) HTML from disk rather than via argv.

```bash
SLUG="<slug>"                         # e.g. chatty-patty
REASON="<why this revision>"          # e.g. new client photos + final touches
CHANGED="<csv or empty>"              # e.g. photos,hero,hours   (leave "" if unsure)

DEMO_DIR="$HOME/Desktop/salespatch-demos/$SLUG"
HTML="$DEMO_DIR/outputs/demo.html"
SIDECAR="$DEMO_DIR/outputs/demo-artefact.json"
HELPER="$HOME/.claude/scripts/nerve/post-ingest.sh"

[ -f "$HTML" ]   || { echo "no demo.html at $HTML — nothing to revise"; exit 1; }
[ -f "$HELPER" ] || { echo "post-ingest.sh missing — demo is on disk but cannot push"; exit 1; }

NEW_ID="$SLUG-demo-$(date -u +%Y%m%dT%H%M%SZ)"

python3 - "$HTML" "$SIDECAR" "$NEW_ID" "$SLUG" "$REASON" "$CHANGED" <<'PY'
import json, sys, re, datetime
html_path, sidecar_path, new_id, slug, reason, changed = sys.argv[1:7]
html = open(html_path, encoding="utf-8").read()
try:
    prior = json.load(open(sidecar_path, encoding="utf-8"))
except Exception:
    prior = {}
md = dict(prior.get("metadata") or {})
md.update({
    "revision": True,
    "revision_reason": reason,
    "changed_fields": [c.strip() for c in changed.split(",") if c.strip()],
    "supersedes": prior.get("artefact_id"),
})
art = {
    "artefact_id": new_id,
    "lead_id": prior.get("lead_id", slug),
    "business_name": prior.get("business_name", slug),
    "html_inline": html,
    "photo_count": len(re.findall(r"data:image/", html)),
    "source": "manual_revision",
    "metadata": md,
    "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
}
for k in ("brief_id", "vertical", "aesthetic_positioning", "dominant_hex"):
    if prior.get(k) is not None:
        art[k] = prior[k]
json.dump(art, open(sidecar_path, "w", encoding="utf-8"))
print(new_id)
PY

"$HELPER" /api/ingest/demo-artefact "$SIDECAR"
```

Expect `{"inserted":true,...}` in the response (a fresh `artefact_id` is never
deduped). If the helper returns non-2xx, surface it once (`400` ≈ HTML > 4MB,
`401` secret rotated, `503` secret missing) — the edit is still on disk; do not
retry inline.

## Step 2 — log the change (the "log everything" half)

Record the revision as a changelog entry so it's queryable later. Same
`x-nerve-secret` auth as `/nerve-quick`; defaults to prod NERVE.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ENV_FILE="$REPO_ROOT/apps/nerve/.env.local"
SECRET="${NERVE_CHANGELOG_SECRET:-}"
if [ -z "$SECRET" ] && [ -f "$ENV_FILE" ]; then
  SECRET=$(grep -E '^NERVE_CHANGELOG_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/^"//; s/"$//')
fi
ENDPOINT="${NERVE_CHANGELOG_URL:-https://nerve.salespatch.co.uk/api/ingest/changelog}"

if [ -z "$SECRET" ]; then
  echo "NERVE_CHANGELOG_SECRET not found — artefact pushed; paste the changelog entry below into /changelog manually." >&2
else
  curl -sS -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "x-nerve-secret: $SECRET" \
    --data @- <<'JSON'
{
  "project": "<slug>",
  "session_summary": "Demo revision for <slug>: <reason>",
  "what_changed": "- <changed area 1>\n- <changed area 2>",
  "why": "<post-sale client request / final touches>",
  "decisions_made": "",
  "problems_encountered": "",
  "current_state": "Revised demo is the latest artefact in NERVE; public /api/public/demo/<slug> now serves it.",
  "whats_next": "",
  "files_modified": ["~/Desktop/salespatch-demos/<slug>/outputs/demo.html"],
  "session_date": "<ISO 8601>",
  "tags": ["demo-revision", "post-sale", "<slug>"],
  "project_type": "sl_mas_pipeline",
  "phase_label": ""
}
JSON
fi
```

## Step 3 — append the run log

```bash
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$DEMO_DIR/logs"
printf '{"ts":"%s","stage":"demo-revision","slug":"%s","artefact_id":"%s","reason":"%s","posted":["demo-artefact","changelog"]}\n' \
  "$TS" "$SLUG" "$NEW_ID" "$REASON" >> "$DEMO_DIR/logs/run.jsonl"
```

Confirm by reporting the new `artefact_id`, the demo-artefact HTTP status, and the
changelog `id`. On any failure, output the formatted payload(s) so the founder can
post manually — the edited demo on disk is always source of truth.
