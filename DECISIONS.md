# DECISIONS.md — Project Decision Log

Append-only log of non-obvious decisions, things tried and dropped, and gotchas
that future sessions need to know about. Sorted newest-first.

This file replaces "I remember we tried that in an old conversation thread."
If something was *tried and failed*, or if a design choice was made between
two reasonable alternatives, it belongs here.

---

## Format

Use this template for every entry:

```
## YYYY-MM-DD — <short-title>

**Context:** What was the task or problem.

**Tried:** What approach was attempted.

**Result:** Worked / failed / partially worked. Be specific about *how* it
failed — error message, behaviour, performance number.

**Decision:** What we're going with now and why.

**Watch out for:** Anything that future-you needs to know — the gotcha that
caused this, the constraint that made the obvious approach wrong, the place
where the symptom will reappear if violated.

**Related:** PR / commit SHA / file paths / changelog entry.
```

Keep entries terse. One screen each is plenty.

---

## 2026-05-07 — Pushing the migration: rebase, secret redaction, GitHub Push Protection

**Context:** Stage 3 (CLAUDE.md rewrite, DECISIONS.md, `/finish`) shipped as PR #31.
Then turned to pushing the composer branch with the 6 cleanup commits we'd added
during the migration. Discovered the branch was actually 16 commits ahead of
updated main, not 6 — 10 pre-existing feature commits (composer workbench,
qualifier hard-rejects, Apify scout, profiler IG fields, simplified pipeline)
weren't factored into the original audit.

**Tried:** Rebase the whole branch onto current `origin/main` with
`git rebase --empty=drop origin/main`. Pre-check showed main hadn't touched any
of the 4 src files composer modifies since the fork point, so conflicts predicted
to be minimal.

**Result:** One conflict — `.claude/launch.json` (both branches added entries:
composer added "workbench", main added "nerve"). Resolved by keeping both. The
duplicate `feat(claude): add nerve slash commands` commit auto-dropped — `--empty=drop`
recognised *"patch contents already upstream"*.

`git push --force-with-lease` then **failed**: GitHub Push Protection caught live
API key strings in `context/handovers/2026-04_mas-handover.md` (Apify, OpenRouter).
Those keys had been rotated weeks earlier but their stale values were still in the
archived doc. Redacted in place, amended the tip commit, force-pushed — accepted.
Two PRs landed: #31 (workflow infra) and #32 (composer + cleanup, 15 commits).

**Decision:** Force-pushing an existing remote branch is fine when the rebase is the
intended operation. Use `--force-with-lease`, never plain `--force` — the lease
refuses the push if the remote moved underneath, protecting against lost work.

**Watch out for:**
- **Audit hygiene:** when auditing a feature branch, count *all* commits ahead of
  updated main, not just the ones added in the current session. The original
  migration plan undercounted by 10.
- **GitHub Push Protection scans the entire push, not just the diff.** Pre-existing
  secret strings in older commits will block force-pushes through them. Solution:
  redact and amend (or interactive rebase reword for non-tip commits). Never click
  the "allow secret" unblock URL — bypassing protection defeats its purpose.
- **`git rebase --empty=drop`** cleanly handles the "patch already upstream" case —
  useful when a duplicate commit landed via two different routes.
- **Verifying stash redundancy:** `git diff stash@{N} main -- <file>` works because
  stashes are commit-like. Per-file diff size against current main tells you which
  parts of a stash have been superseded by upstream evolution.
- Even rotated keys don't belong in committed files — scrubbing stale-secret
  documents is a required step when archiving old handover docs into the repo.

**Related:** PR #31, PR #32. Branches `feat/cli-workflow-onboarding`,
`feat/composer-workbench-and-qualifier` (rebased to `1ae0747`).

---

## 2026-05-07 — Migrating workflow from Claude Desktop to terminal Claude Code

**Context:** The repo was in unknown shape after months of Claude Desktop sessions.
30 branches, 11 worktrees, 17 untracked files at root, 2 stashes. Pain points:
re-explaining context, threads "getting stuck," conflicts between parallel sessions,
hoarding old conversations as the only memory of past attempts.

**Tried:** Audit-then-cleanup approach in 8 phases — root junk, commit keepers,
fix iOS path-casing artifacts, archive handovers, drop redundant stashes, remove
worktrees, prune merged branches, attempt to promote `nerve` to `apps/nerve/`.

**Result:** All 8 phases shipped. Working tree went from 17 untracked + 2 modified
to clean. Worktrees: 11 → 2. Branches: 30 → 13. Stashes: 2 → 0. Phase 8 (nerve
promotion) turned out to already be done on origin/main — fast-forwarding local
main pulled it in.

**Decision:** Adopt terminal Claude Code with this CLAUDE.md, DECISIONS.md, and
the `/finish` slash command as the standing workflow. The `kb-lookup.sh` PreToolUse
hook auto-injects `knowledge/` context when editing protected apps, so the
business-brain rule is enforced by the harness rather than by remembering.

**Watch out for:**
- macOS case-insensitive FS will keep producing untracked-file noise if anything
  touches `apps/ios/SalesFlow/` vs `apps/ios/salesflow/`. The repo's tracked path
  is **capital-S `SalesFlow`**. If git status starts showing untracked iOS files
  that you didn't create, suspect a casing rename, not lost work.
- `claude/nice-kare-edfa44` is a live TestFlight beta worktree. Do not touch.
  Promote work *out* of it via copy + new branch, never operate inside it.
- Local main can drift far behind origin/main during heavy parallel work. Always
  fetch + check `git log origin/main..main` and `git log main..origin/main`
  before branching.

**Related:** Stage 1–3 onboarding session 2026-05-07. Branch
`feat/cli-workflow-onboarding`. Recent cleanup commits on
`feat/composer-workbench-and-qualifier`.

---

<!-- New entries go above this line -->
