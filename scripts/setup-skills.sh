#!/usr/bin/env bash
# scripts/setup-skills.sh
#
# Symlinks ~/.claude/skills/* and ~/.claude/commands/* to the repo-tracked
# versions so edits to the repo files are picked up by the local Claude
# Code instance without a manual copy step.
#
# Run once per machine (or after moving the repo). Idempotent — if the
# symlinks already point at the right repo files, the script is a no-op.
#
# Backup: any non-symlink files at the target paths are moved to
# ~/.claude/.skills-backup/<timestamp>/ rather than overwritten, so a
# local-only edit isn't lost on first run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_DIR="$HOME/.claude"
BACKUP_ROOT="$CLAUDE_DIR/.skills-backup/$(date +%Y%m%d-%H%M%S)"

# Pairs of (source-in-repo, target-in-claude-dir).
# Layout mirrors what Claude Code expects: skills/<name>/SKILL.md and
# commands/<name>.md.
PAIRS=(
  "skills/spec-site-brief|skills/spec-site-brief"
  ".claude/commands/build-demo.md|commands/build-demo.md"
  ".claude/commands/grab-photos.md|commands/grab-photos.md"
  ".claude/commands/lead-hunter.md|commands/lead-hunter.md"
  ".claude/commands/lead-json.md|commands/lead-json.md"
  ".claude/commands/new-lead.md|commands/new-lead.md"
)

made_backup=false

for pair in "${PAIRS[@]}"; do
  src_rel="${pair%|*}"
  tgt_rel="${pair#*|}"
  src="$REPO_ROOT/$src_rel"
  tgt="$CLAUDE_DIR/$tgt_rel"

  if [ ! -e "$src" ]; then
    echo "✗ source missing: $src" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$tgt")"

  # Already pointing at the right place? Skip.
  if [ -L "$tgt" ] && [ "$(readlink "$tgt")" = "$src" ]; then
    echo "✓ already linked: $tgt_rel"
    continue
  fi

  # Back up an existing real file or directory before replacing.
  if [ -e "$tgt" ] || [ -L "$tgt" ]; then
    mkdir -p "$BACKUP_ROOT/$(dirname "$tgt_rel")"
    mv "$tgt" "$BACKUP_ROOT/$tgt_rel"
    made_backup=true
    echo "  backed up: $tgt_rel → .skills-backup/$(basename "$BACKUP_ROOT")/$tgt_rel"
  fi

  ln -s "$src" "$tgt"
  echo "✓ linked: $tgt_rel → $src_rel"
done

if [ "$made_backup" = true ]; then
  echo ""
  echo "Pre-existing files moved to: $BACKUP_ROOT"
  echo "If a local-only edit was lost, restore from there."
fi

echo ""
echo "Done. Edits to skills/ and .claude/commands/ in the repo now flow"
echo "straight into ~/.claude/ for the local Claude Code instance."
