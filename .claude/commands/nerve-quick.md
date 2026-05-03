---
name: nerve-quick
description: Log a quick changelog entry to NERVE for this session
---

Produce a brief changelog entry for this session and POST to NERVE.

Extract:
- **project**: infer from context
- **session_summary**: one sentence only
- **what_changed**: bullet list of changes, brief
- **files_modified**: all files touched
- **tags**: 3–5 tags
- **project_type**: infer from context — one of
  `nerve` / `salespatch` / `ios_app` / `sl_mas_pipeline` / `spit_out` / `other`
- **phase_label**: if applicable; otherwise leave blank
- **session_date**: now in ISO 8601

POST to the same endpoint as `nerve-log` with the same auth header.
All other fields (`why`, `decisions_made`, `problems_encountered`,
`current_state`, `whats_next`) set to empty string.

Auto-discovers the secret from `apps/nerve/.env.local` if not in env;
defaults endpoint to local NERVE.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ENV_FILE=""
for candidate in \
  "$REPO_ROOT/apps/nerve/.env.local" \
  "$REPO_ROOT/.claude/worktrees/nice-kare-edfa44/apps/nerve/.env.local"
do
  if [ -f "$candidate" ]; then ENV_FILE="$candidate"; break; fi
done

SECRET="$NERVE_CHANGELOG_SECRET"
if [ -z "$SECRET" ] && [ -n "$ENV_FILE" ]; then
  SECRET=$(grep -E '^NERVE_CHANGELOG_SECRET=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | sed -E 's/^"//; s/"$//')
fi
ENDPOINT="${NERVE_CHANGELOG_URL:-http://localhost:4400/api/ingest/changelog}"

if [ -z "$SECRET" ]; then
  echo "ERROR: NERVE_CHANGELOG_SECRET not found." >&2
  exit 1
fi

curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-nerve-secret: $SECRET" \
  --data @- <<'JSON'
{
  "project": "<…>",
  "session_summary": "<one sentence>",
  "what_changed": "- change 1\n- change 2",
  "why": "",
  "decisions_made": "",
  "problems_encountered": "",
  "current_state": "",
  "whats_next": "",
  "files_modified": ["…"],
  "session_date": "<ISO 8601>",
  "tags": ["…"],
  "project_type": "<…>",
  "phase_label": ""
}
JSON
```

Confirm receipt by reporting the returned `id`. On failure, output the
entry as formatted markdown fallback.
