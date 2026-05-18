---
description: Scaffold a new lead folder for a UK business. Creates ~/Desktop/salespatch-demos/[slug]/{photos,outputs,logs}/ and opens the photos folder in Finder so you can drag images in. Run this BEFORE the spec-site-brief skill.
argument-hint: [business name, e.g. "Bandit Bakery" or "Mario's Deli"]
---

You are setting up the working folder for a new spec-site lead.

The argument is the business name. Convert it to a URL-safe slug:

- Lowercase, hyphenated, no punctuation.
- "Bandit Bakery" → `bandit-bakery`
- "Mario's Deli & Café" → `marios-deli-cafe`
- "St. John Bakery" → `st-john-bakery`

## Canonical identity check (F1)

Before scaffolding the folder, consult the NERVE canonical identity table. This is what catches "I already pitched a variation of this name last week and forgot":

```bash
NAME_ENC=$(python3 -c "from urllib.parse import quote; print(quote('<Business Name>'))")
~/.claude/scripts/nerve/get-ingest.sh /api/read/business-identity/lookup "name=$NAME_ENC"
```

- If the response has `"found": true`, STOP. Print the canonical slug + first/last seen timestamps from the response, and ask the user whether they really want to re-scaffold. Don't continue without explicit confirmation.
- If the response is `"found": false`, proceed.
- If the helper fails (NERVE down), warn but proceed — the local folder scan in `/lead-hunter` is the second line of defence.

## Scaffold

Then run a single Bash command that does all of the following:

1. Create the folder structure: `~/Desktop/salespatch-demos/[slug]/photos/`, `~/Desktop/salespatch-demos/[slug]/outputs/`, `~/Desktop/salespatch-demos/[slug]/logs/`.
2. Touch an empty `~/Desktop/salespatch-demos/[slug]/logs/run.jsonl` so subsequent stages can append.
3. Append a single JSON line to `run.jsonl` recording the scaffold event:
   ```
   {"ts":"<ISO 8601 UTC>","stage":"new-lead","slug":"<slug>","business_name":"<original name>"}
   ```
4. On macOS, open the photos folder in Finder (`open ~/Desktop/salespatch-demos/[slug]/photos`) so the user can drag images straight in. Do not run `open` if not on macOS.

Do all of that in one `mkdir -p` plus a small shell pipeline, no Python, no scripts, just bash.

After the command runs, output exactly this, in this order, no preamble:

1. `✓ Lead folder ready: ~/Desktop/salespatch-demos/[slug]/`
2. `Drop photos into: ~/Desktop/salespatch-demos/[slug]/photos/`
3. `Then run the spec-site-brief skill (just paste the business name + location into chat).`

Do not say anything else. The whole point of this command is to be fast.
