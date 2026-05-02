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

```bash
ENDPOINT="${NERVE_CHANGELOG_URL:-https://nerve.salespatch.co.uk/api/ingest/changelog}"
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-nerve-secret: $NERVE_CHANGELOG_SECRET" \
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
