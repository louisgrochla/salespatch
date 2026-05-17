---
name: nerve-note
description: POST a note to NERVE — free-form markdown context for the founder and future agents
---

Capture a note in NERVE. Notes are mutable scratch + lead-specific
context — distinct from `DECISIONS.md` (terse, committed) and
`CHANGELOG/` (per-change). Use when you've learned something the next
session (human or agent) will want to know: per-lead follow-ups,
system gotchas, "remember this".

Required fields:
- **title**: one-line headline (≤200 chars)
- **scope**: `lead` | `system` | `pitch` | `research` | `other`
- **body**: markdown

Optional:
- **relatedSlug**: canonical lead slug (e.g. `the-tartan-pig`) — required
  in practice when scope=lead, otherwise the note can't be queried by
  lead later
- **tags**: array of strings for grouping
- **phaseLabel**: usually omit; the endpoint derives from current date

Uses the same `x-nerve-secret` auth as `/nerve-log` and `/nerve-quick`.
Upsert semantics: re-running with the same (relatedSlug, title) updates
the existing note in place rather than creating a duplicate.

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
ENDPOINT="${NERVE_NOTES_URL:-${NERVE_CHANGELOG_URL%/api/ingest/changelog}/api/ingest/notes}"
ENDPOINT="${ENDPOINT:-http://localhost:4400/api/ingest/notes}"

if [ -z "$SECRET" ]; then
  echo "ERROR: NERVE_CHANGELOG_SECRET not found." >&2
  exit 1
fi

curl -sS -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-nerve-secret: $SECRET" \
  --data @- <<'JSON'
{
  "title": "<one-line headline>",
  "scope": "<lead|system|pitch|research|other>",
  "relatedSlug": "<slug or null>",
  "body": "<markdown body>",
  "tags": ["…"]
}
JSON
```

Confirm receipt by reporting the returned `id` and `action`
(`inserted` or `updated`). On failure, output the note as formatted
markdown fallback so the founder can paste into `/notes/new` manually.
