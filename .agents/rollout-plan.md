# Agent Harness v1 Rollout Plan

Issue: #164
Status: Active rollout plan
Last updated: 2026-05-28

## Scope

Implement the first operational harness for AI coding agents working in `novel-ai`. This rollout is docs, skills, issue workflow, and safe helper scripts. It does not change product behavior.

## Phase 1: Consistency Pass

Issue: #165

Deliverables:

- Confirm runtime skill home.
- Confirm `.agents/` as the single agent operating layer.
- Confirm E2E path and scripts.
- Restore or track missing source-of-truth docs.
- List stale skill instructions.

Quality gate:

```bash
git diff --check
```

## Phase 2: Canonical Harness Docs

Issue: #166

Deliverables:

- `.agents/README.md`
- `.agents/rollout-plan.md`
- `.agents/maintenance.md`

Quality gate:

```bash
git diff --check
```

## Phase 3: Runtime Skill Upgrades

Issue: #167

Deliverables:

- Add `agent-harness-consistency-pass`.
- Update stale Playwright E2E skill paths and version references.
- Keep new skills under `.agents/skills/`.

Quality gate:

```bash
git diff --check
```

## Phase 4: E2E Verification Contract

Issue: #168

Deliverables:

- Document Playwright config and test paths.
- Document service startup requirements.
- Link related E2E roadmap issues #147 through #155.

Quality gates:

```bash
cd apps/studio
npm run test:e2e -- --list
```

Use full E2E only when the local stack is intentionally started.

## Phase 5: Session Hooks

Issue: #169

Deliverables:

- `scripts/ops/agent-session-start.sh`
- `scripts/ops/agent-session-stop-review.sh`

Quality gates:

```bash
bash -n scripts/ops/agent-session-start.sh
bash -n scripts/ops/agent-session-stop-review.sh
```

## Phase 6: Pilot Active Story Identity

Issue: #170

Deliverables:

- Investigation report first.
- Scoped implementation plan.
- Product changes only after approval.

Quality gates:

- `npm run typecheck`
- `npm run build` when feasible
- lint changed files
- targeted E2E or documented test plan

## Phase 7: User Operating Guide

Issue: #171

Deliverable:

- `.agents/user-guide.md`

## Phase 8: Manual Skill Optimization Loop

Issue: #172

Deliverables:

- Skill change proposal template.
- Rubric for evaluating agent runs.
- Human approval process for skill edits.
