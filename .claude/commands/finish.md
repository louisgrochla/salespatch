---
description: Wrap up a task — diff summary, commit, prompt to log a decision, suggest /clear
---

The user has finished a task and wants to wrap it up cleanly. Walk through the
following sequence in order. Be terse — this is a closing routine, not a
discussion.

## 1. Survey what changed

Run these in parallel:
- `git status` — see staged, unstaged, and untracked
- `git diff --stat` — line counts per file, unstaged
- `git diff --cached --stat` — line counts per file, staged
- `git log -1 --format="%h %s"` — last commit on the branch (style reference)

If there is *nothing* to commit (no changes anywhere), say so and skip to step 5.

## 2. Group into logical commits

If the changes touch one concern → one commit.
If they span unrelated concerns → propose a split into 2–3 focused commits.
Show the user your proposed grouping. Wait for confirmation if the split is
non-obvious.

Per CLAUDE.md: small, focused commits. No mixed-scope commits.

## 3. Propose commit message(s)

Match the project's recent style (peek at `git log -10 --oneline`). Typical form:
`type(scope): short summary in imperative mood`

Common types in this repo: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`,
`revert`. Common scopes: `ios`, `mc` (mission-control), `workbench`, `profiler`,
`scout`, `composer`, `qualifier`, `pipeline`, `claude`.

Show the proposed message(s) and wait for the user's go-ahead before committing.
Use HEREDOC for the commit message and end it with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## 4. Prompt for a DECISIONS.md entry

After committing, ask the user one question: **"Was anything non-obvious tried,
dropped, or decided in this task that future-you would want to remember?"**

If yes → draft a DECISIONS.md entry using the format documented in that file
(Context / Tried / Result / Decision / Watch out for / Related), insert it at
the top of the entry section (above the existing newest entry, below the
template), and amend it into the most recent commit *only if* the user agrees;
otherwise create a follow-up commit `docs(decisions): log <slug>`.

If no → skip.

If the task involved a non-obvious failure mode, an alternative that was
considered and rejected, or a constraint that turned out to matter — recommend
appending. Don't be pushy about routine work.

## 5. Suggest /clear if scoped

If the task feels fully done (committed, deployed if applicable, no loose ends),
recommend the user run `/clear` before starting the next thing — fresh context
prevents the "thread bleed" problem CLAUDE.md was set up to solve.

If the task is partially done or there are obvious follow-ups, list them in 1–2
bullets so the next session can pick up.

## 6. Final summary

Keep this to one or two lines:
- What landed (commit SHAs)
- Whether DECISIONS.md was updated
- What's next (or "task complete, /clear to move on")

Do not narrate every tool call. Do not ask "anything else?" — let the user
direct what comes next.
