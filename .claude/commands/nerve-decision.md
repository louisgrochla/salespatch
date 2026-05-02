---
name: nerve-decision
description: Log a specific decision to NERVE immediately without ending the session
---

Ask the user: **"What decision do you want to log?"**

Wait for their response describing the decision.

Then POST to NERVE `/api/ingest/changelog` with:
- `session_summary`: `"Decision log: " + brief description`
- `what_changed`: `"N/A — decision record only"`
- `why`: the user's description of the decision
- `decisions_made`: the user's full description
- `project_type`: infer from context
- `tags`: `["decision", "architecture"]` plus any relevant tags from
  the user's description (e.g. `database`, `auth`, `ios`, `pricing`)
- `project`: infer from context
- `session_date`: now in ISO 8601
- all other fields (`problems_encountered`, `current_state`,
  `whats_next`, `files_modified`, `phase_label`) empty

```bash
ENDPOINT="${NERVE_CHANGELOG_URL:-https://nerve.salespatch.co.uk/api/ingest/changelog}"
curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-nerve-secret: $NERVE_CHANGELOG_SECRET" \
  --data @- <<'JSON'
{
  "project": "<…>",
  "session_summary": "Decision log: <brief>",
  "what_changed": "N/A — decision record only",
  "why": "<user's description>",
  "decisions_made": "<user's full description>",
  "problems_encountered": "",
  "current_state": "",
  "whats_next": "",
  "files_modified": [],
  "session_date": "<ISO 8601>",
  "tags": ["decision", "architecture"],
  "project_type": "<…>",
  "phase_label": ""
}
JSON
```

Confirm receipt by reporting the returned `id`. **Do not end the
session** — this command is mid-flight and the user wants to keep
working. Continue from wherever the conversation was before the
command was invoked.
