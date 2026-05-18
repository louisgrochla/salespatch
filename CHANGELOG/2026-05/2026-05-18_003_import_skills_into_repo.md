# Import SL-MAS skills + slash-commands into the repo

**Date:** 2026-05-18
**Scope:** Move the pipeline skills (spec-site-brief) + the five SL-MAS
slash commands (build-demo, grab-photos, lead-hunter, lead-json, new-lead)
from `~/.claude/` into the repo so future edits are reviewable, diff-able,
and rolled back via git. Foundation for three follow-up PRs that modify
these skills.
**Branch:** `chore/import-skills-into-repo`
**Base branch:** `main`
**Pairs with:** none directly. Unblocks `feat/spec-brief-feature-opportunities`,
`feat/logo-and-mobile-intelligence`, `feat/nerve-decision-capture-embeddings`
(planned next, all touch these skill files).

## What changed

### Files

- **New** `skills/spec-site-brief/SKILL.md` — verbatim copy of
  `~/.claude/skills/spec-site-brief/SKILL.md` as of 2026-05-17. 52 KB.
- **New** `.claude/commands/build-demo.md` — copy from
  `~/.claude/commands/build-demo.md`. 55 KB.
- **New** `.claude/commands/grab-photos.md` — copy. 5.8 KB.
- **New** `.claude/commands/lead-hunter.md` — copy. 30 KB.
- **New** `.claude/commands/lead-json.md` — copy. 15 KB.
- **New** `.claude/commands/new-lead.md` — copy. 2.5 KB.
- **New** `scripts/setup-skills.sh` — one-time per-machine symlink setup.
  Idempotent. Moves any pre-existing local file into a timestamped
  `~/.claude/.skills-backup/` directory before linking, so a local-only
  edit isn't silently lost.
- **Modified** `CLAUDE.md` — adds a "Skills and slash-commands (tracked
  in this repo)" section pointing at the new locations + setup script.

### Not included

- `~/.claude/skills/humanizer` is intentionally NOT imported — it's a
  generic skill, not part of the SL-MAS pipeline.
- The `.claude/commands/` directory already contained the NERVE-side
  meta commands (`nerve-decision`, `finish`, `nerve-log`, `nerve-note`,
  `nerve-quick`, `handoff`); those are unchanged.

## Why

Three planned PRs (`feat/spec-brief-feature-opportunities`,
`feat/logo-and-mobile-intelligence`,
`feat/nerve-decision-capture-embeddings`) all need to modify the SL-MAS
skill prompts. With the skill files only living in `~/.claude/`, those
changes would have no review trail, no rollback, no version history.
Importing them into the repo first is the smallest precondition that
unblocks the rest.

The symlink approach (vs copy-on-demand) means the repo file is the
single source of truth — the local Claude Code instance reads the same
bytes that git tracks. No drift between "what's tracked" and "what's
actually being executed".

## Stack

- Plain bash for `scripts/setup-skills.sh` (POSIX-portable, no
  dependencies).
- macOS `ln -s` for the symlinks (works on Linux too).

## Integrations

- None outbound. The script only mutates `~/.claude/`, which Claude
  Code already owns.

## How to verify

```bash
# Fresh-clone setup:
git clone <repo>
cd klaude-repo
bash scripts/setup-skills.sh

# Confirm the symlinks point at the repo:
ls -la ~/.claude/skills/spec-site-brief
ls -la ~/.claude/commands/{build-demo,grab-photos,lead-hunter,lead-json,new-lead}.md

# Each should be a symlink (`l...`) pointing at the corresponding repo file.

# Re-running is a no-op:
bash scripts/setup-skills.sh   # prints "✓ already linked" for each entry
```

In an active Claude Code session, the skills should appear once each in
the available-skills list (no duplicates). Invoking `/build-demo` or
`/spec-site-brief` from this point reads the repo-tracked file.

## Known issues

- Per-machine setup required — first time anyone (the founder, future
  agents, anyone forking) uses the repo, they need to run
  `scripts/setup-skills.sh`. The README + CLAUDE.md call this out.
- The backup directory `~/.claude/.skills-backup/<timestamp>/` is
  *not* cleaned up automatically. If the user accumulates many runs,
  they can purge manually — the contents are pre-import snapshots, not
  load-bearing for current operation.
- The symlink approach means moving or renaming the repo breaks the
  links. Rerun `scripts/setup-skills.sh` after any such move.
