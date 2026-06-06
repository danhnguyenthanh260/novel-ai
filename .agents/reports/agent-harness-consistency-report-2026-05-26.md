# Agent Harness Consistency Report

Issue: #165
Date: 2026-05-26

## Summary

Historical note, 2026-05-28: this report was moved under `.agents/reports/`
after `.agents/` became the single active agent operating layer.

The repo already has an agent harness foundation: `AGENTS.md`, `.agents/`,
Studio chat-first contracts, Playwright E2E specs, and GitHub issue templates.
The main work is consolidation and drift repair, not creating a parallel
`.ai/skills` or `docs/ai-layer` tree.

## Current Source-of-Truth Map

| Area | Current Source of Truth | Status | Notes |
|---|---|---|---|
| Root agent rules | `AGENTS.md` | active | Canonical instruction file. |
| Product/workflow behavior | `apps/studio/README.md` | active | Defines Write workspace chat contracts and UI rules. |
| Runtime skills | `.agents/skills/` | active | Repo-specific skills are unignored individually in `.gitignore`. |
| Skill docs inventory | `.agents/reports/` | active | Meta-docs only, not runtime skills. |
| Chat-first policy | `docs/operations/implementation/chat-first-architecture-policy.md` | active | Defines no route-only command behavior. |
| E2E config | `apps/studio/playwright.config.ts` | active | Uses `testDir: "./e2e/tests"`. |
| E2E tests | `apps/studio/e2e/` | active | Contains fixtures, helpers, and specs. |
| Dev stack scripts | `scripts/ops/start_e2e_stack.sh` | active | Starts Docker, local LLM, Studio, historian bridge, and worker support. |
| GitHub source of truth | #164 through #172 | active | Tracks harness rollout. |

## Drift Found

| Drift | Evidence | Fix |
|---|---|---|
| Missing change impact map | `AGENTS.md` and `apps/studio/README.md` referenced `docs/architecture/change-impact-map.md`, which was absent. | Restore a compact `docs/architecture/change-impact-map.md`. |
| Missing code ownership map | `apps/studio/README.md` referenced `docs/planning/code-ownership-map.md`, which was absent. | Restore a compact `docs/planning/code-ownership-map.md`. |
| Stale Playwright skill path | `playwright-e2e-verification` referenced `apps/studio/tests/e2e/`. | Update to `apps/studio/e2e/`. |
| Stale Playwright version | Skill referenced `@playwright/test@1.60.0`; `apps/studio/package.json` has `^1.51.1`. | Update skill to package value. |
| Missing session hooks | Harness issue #169 proposed hooks; scripts did not exist. | Add lightweight non-mutating scripts under `scripts/ops/`. |

## Minimal Fix Plan

1. Add canonical harness spec and implementation docs.
2. Add missing source-of-truth maps.
3. Add `agent-harness-consistency-pass` skill.
4. Update stale Playwright skill.
5. Add session start/stop review scripts.
6. Verify with docs and shell checks.

## Verification

Run:

```bash
git diff --check
bash -n scripts/ops/agent-session-start.sh
bash -n scripts/ops/agent-session-stop-review.sh
cd apps/studio && npm run test:e2e -- --list
```
