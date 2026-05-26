#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "## Agent Session Context"
echo
echo "Repo: $(git remote get-url new-origin 2>/dev/null || git remote get-url origin 2>/dev/null || echo unknown)"
echo "Branch: $(git branch --show-current)"
echo
echo "### Git Status"
git status --short --branch
echo
echo "### Recent Commits"
git log --oneline -5
echo
echo "### Agent Sources"
printf '%s\n' "AGENTS.md"
if [[ -f "apps/studio/README.md" ]]; then
  printf '%s\n' "apps/studio/README.md"
fi
find .agents/skills -maxdepth 2 -name SKILL.md -print 2>/dev/null | sort
echo
echo "### Common Checks"
cat <<'CHECKS'
Docs/harness:
  git diff --check
  bash -n scripts/ops/agent-session-start.sh
  bash -n scripts/ops/agent-session-stop-review.sh

Studio:
  cd apps/studio
  npm run typecheck
  npm run build
  npx eslint <changed-files>

E2E:
  cd apps/studio
  npm run test:e2e -- --list
  npm run e2e:start-and-test
CHECKS
echo
echo "Reminder: read AGENTS.md, then the relevant skill, before editing."
