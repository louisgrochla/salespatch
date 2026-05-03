---
name: nerve-log
description: Compact this session into a structured changelog entry and send it to NERVE
---

Review the entire conversation in this session. Produce a structured
changelog entry capturing everything that was discussed, built, decided,
and changed. Then POST it to NERVE immediately.

Extract the following from the session:

**project**: The name of the project being worked on in this session.
Infer from the working directory, repo name, branch, and what was
edited.

**session_summary**: 2–3 sentence plain-English summary of what this
session accomplished overall.

**what_changed**: Detailed description of every specific change made.
List each change clearly. If code was written, describe what it does.
If a schema changed, describe what changed. Be specific enough that
someone reading this in 6 months understands exactly what happened.

**why**: The reasoning behind the changes made in this session. What
requirement, problem, or decision drove the work.

**decisions_made**: Every architectural, design, or implementation
decision made during this session. Include options that were considered
and rejected and why.

**problems_encountered**: Every error, bug, conflict, or unexpected
issue encountered. Include how each was resolved or whether it remains
outstanding.

**current_state**: What is now working that was not working at the
start of this session. The delta — what changed in capability.

**whats_next**: Any outstanding items, follow-on work, known issues,
or next steps mentioned or implied during the session.

**files_modified**: Every file that was created, edited, or deleted
during this session. Full paths from project root.

**tags**: 3–8 descriptive tags summarising the nature of the work
e.g. `database`, `auth`, `ui`, `api`, `embedding`, `rag`, `schema`,
`bugfix`, `feature`, `refactor`, `deployment`, `ios`, `webhook`.

**project_type**: One of:
`nerve` / `salespatch` / `ios_app` / `sl_mas_pipeline` / `spit_out` / `other`.

**phase_label**: Current SL-MAS phase if relevant — e.g.
`phase_1_manual_beta`, `phase_2_automated`, `phase_3_public_launch`.
Leave blank if not applicable; NERVE will derive one from session_date.

**session_date**: Current date and time in ISO 8601 (e.g.
`2026-05-03T14:30:00Z`).

Once extracted, POST to NERVE. The endpoint URL and secret come from
environment variables — do NOT hardcode them. Default endpoint is
`https://nerve.salespatch.co.uk/api/ingest/changelog`; if
`NERVE_CHANGELOG_URL` is set, use that instead (useful for local
testing against `http://localhost:4400/api/ingest/changelog`).

Use this curl from the Bash tool. The block below auto-discovers the
secret from `apps/nerve/.env.local` if it isn't already in the shell
environment, so the command works locally with zero shell setup. When
deployed to prod, set `NERVE_CHANGELOG_SECRET` in the shell (or Vercel
env for the server side).

```bash
# Discover repo root + endpoint + secret.
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
  echo "ERROR: NERVE_CHANGELOG_SECRET not set in env and not found in $ENV_FILE" >&2
  echo "Falling back to printing the entry as markdown — please save manually." >&2
  exit 1
fi

curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-nerve-secret: $SECRET" \
  --data @- <<'JSON'
{
  "project": "<project>",
  "session_summary": "<…>",
  "what_changed": "<…>",
  "why": "<…>",
  "decisions_made": "<…>",
  "problems_encountered": "<…>",
  "current_state": "<…>",
  "whats_next": "<…>",
  "files_modified": ["…"],
  "session_date": "<ISO 8601>",
  "tags": ["…"],
  "project_type": "<…>",
  "phase_label": "<…or empty>"
}
JSON
```

Confirm the entry was received with a `200` response. Report the entry
id returned (`{"ok":true,"id":"…"}`) and confirm it is now live in
NERVE.

If the POST fails (non-200, network error, missing
`NERVE_CHANGELOG_SECRET`), output the full structured entry as
formatted markdown so it can be manually saved. Never silently lose a
session.
