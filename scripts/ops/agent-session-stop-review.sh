#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "## Agent Session Stop Review"
echo
echo "### Changed Files"
git status --short
echo
echo "### Checklist"
cat <<'CHECKLIST'
- [ ] Did this task reveal a new convention?
- [ ] Did AGENTS.md become stale?
- [ ] Did any .agents/skills file become stale?
- [ ] Were test commands missing or wrong?
- [ ] Did the agent touch files outside scope?
- [ ] Did the chat-first contract remain intact?
- [ ] Should a GitHub issue be updated?
- [ ] Are skipped checks and service requirements documented?
CHECKLIST
echo
echo "### Suggested Local Checks"
cat <<'CHECKS'
git diff --check
bash -n scripts/ops/agent-session-start.sh
bash -n scripts/ops/agent-session-stop-review.sh
CHECKS
