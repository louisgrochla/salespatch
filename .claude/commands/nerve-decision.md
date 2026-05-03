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
