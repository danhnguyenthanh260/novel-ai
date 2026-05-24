---
name: implementation-planning
description: Use when turning a novel-ai feature, bug, refactor, or GitHub issue into an execution-ready plan before coding.
---

# Skill: Implementation Planning

## Purpose

Help Codex create plans that an agent can execute and a human can review without guessing scope, files, contracts, or verification.

## When to Use

Use this skill when:

- The user asks for a plan, issue body, task breakdown, implementation sequence, or scoped execution proposal.
- A change affects product behavior, workflow state, data contracts, API routes, DB migrations, UI surfaces, worker tasks, or GitHub issue structure.
- The work needs an Agent Mode and Human Mode issue plan.

## Inputs to Inspect

Check:

- `AGENTS.md`, especially Issue To Code Plan Structure and Planning Rules
- `apps/studio/README.md` for product architecture and workflow behavior
- Relevant docs under `docs/architecture/` or `docs/operations/specs/`
- Directly affected source files and migrations
- Existing issue/PR history when continuing a roadmap item
- Available test, lint, build, doctor, or QA commands

## Workflow

1. Confirm the task type and whether a decision gate is needed.
2. Write acceptance criteria before technical design.
3. Define scope, non-goals, boundary ownership, and affected contracts.
4. Build a file manifest with `CREATE`, `MODIFY`, and `DELETE` groups.
5. Call out data model, API, workflow, UI, security, migration, and rollback impact.
6. Split work into sequenced Agent Mode tasks with binary quality gates.
7. Add Human Mode context: situation, reasoning, trade-offs, review focus, known unknowns, and follow-ups.

## Output Format

Codex should respond using:

```md
# Implementation Plan

## Situation
## Evidence
## Root Cause / Findings
## Proposed Fix
## Files to Change
## Acceptance Criteria
## QA Checklist
## Risks
## Next Step
```

## Acceptance Criteria

- [ ] Acceptance criteria are binary and written before design details.
- [ ] File manifest lists every create, modify, and delete path or states why a path is still unknown.
- [ ] Quality gates use commands that exist in the repo.
- [ ] Rollback notes cover behavior, data, and migration risk where relevant.

## Guardrails

- Do not start coding during plan creation unless the user explicitly approves implementation.
- Do not create GitHub issues with unresolved product, architecture, data model, workflow, or issue-planning decisions.
- Do not use vague file manifests such as "update UI files".
- Do not skip `staging` branch and PR rules for normal work.
- Do not include unrelated refactors or opportunistic cleanup.

## Common Failure Modes

| Failure Mode | Why It Happens | Prevention |
| ------------ | -------------- | ---------- |
| Acceptance criteria are implementation tasks | Criteria get written after design, so they describe code instead of outcomes | Write user/system observable pass/fail criteria first |
| File manifest omits shared contracts | Plans focus on components and miss API, worker, migration, or docs impact | Inspect source-of-truth docs and list every ownership boundary |
| Quality gates are invented | Generic commands are copied from other repos | Check `apps/studio/package.json`, Python tests, or existing runbooks before naming commands |
| Plan hides a decision | Architecture or product assumptions are encoded as code tasks | Use the Decision Gate Rule and ask for approval before implementation |

## Evidence

| Source | Reason | Confidence |
| ------ | ------ | ---------- |
| `AGENTS.md` | Defines Agent Mode, Human Mode, file manifest, quality gates, estimates, and decision gate requirements | high |
| `.agents/skills/implementation-plan-review/SKILL.md` | Existing review skill validates plan completeness before coding | high |
| `docs/architecture/*` | Existing contract docs are planning-first and separate decisions from runtime behavior | high |
| `docs/operations/reports/20260505_default-url-ui-pipeline-audit.md` | Shows issue-first follow-up queue instead of broad UI implementation | high |

## Example Prompt

```md
Create an implementation plan for wiring Write workspace `/status` to a real inspector state. Include scope, non-goals, file manifest, acceptance criteria, QA checklist, rollback notes, Agent Mode steps, and Human Mode summary. Do not code yet.
```
