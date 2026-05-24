---
name: investigation-workflow
description: Use when investigating a novel-ai failure, regression, data inconsistency, workflow bug, or unclear root cause before deciding whether code changes are needed.
---

# Skill: Investigation Workflow

## Purpose

Help Codex investigate before editing code, keeping evidence, symptoms, root cause, and implementation scope separate.

## When to Use

Use this skill when:

- The task involves a production-like failure, deploy/smoke issue, API 500, worker failure, data mismatch, UI regression, auth/storage/DB uncertainty, or unclear root cause.
- The user asks for an investigation, audit, diagnosis, report, or "what is wrong".
- A fix would touch multiple surfaces and the right owner is not yet clear.

## Inputs to Inspect

Check:

- `AGENTS.md`
- `apps/studio/README.md` when Studio workflow or UI behavior is involved
- Directly related route handlers, services, components, workers, migrations, or docs
- Recent git history for the affected path
- Available logs, command output, screenshots, URLs, QA notes, and test output
- Existing runbooks under `docs/operations/runbooks/` when the issue is operational

## Workflow

1. State the observed symptom and the scope being investigated.
2. Collect narrow evidence from the affected surface before reading adjacent files.
3. Build a file/path inventory with likely owners and why each path matters.
4. Separate facts from hypotheses. Do not treat a guess as root cause.
5. Identify the smallest reproducible path or closest available proof.
6. Classify findings as root cause, contributing factor, unrelated dirty state, or unknown.
7. Recommend the next step: no-code report, targeted implementation plan, or decision gate.

## Output Format

Codex should respond using:

```md
# Investigation Report

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

- [ ] Evidence cites concrete files, commands, docs, logs, or git commits.
- [ ] Root cause is distinguished from symptoms and unknowns.
- [ ] Recommended next step is scoped and reviewable.
- [ ] No application code is changed during investigation unless the user explicitly approves implementation.

## Guardrails

- Do not broad-scan the repo without a reason tied to the symptom.
- Do not expose secrets, env values, tokens, or unrelated private content.
- Do not invent project rules from generic examples.
- Do not hide failing command output that changes the conclusion.
- Do not mix investigation and implementation without a clear handoff.

## Common Failure Modes

| Failure Mode | Why It Happens | Prevention |
| ------------ | -------------- | ---------- |
| Treating a visible error as root cause | The first failed surface is often downstream of DB, context, worker, or routing state | Trace the owner path and upstream dependency before recommending a fix |
| Reading unrelated source until scope expands | The repo has many adjacent Studio and worker surfaces | Start from the affected route/component/task and only expand with a reason |
| Assuming local build success proves runtime success | Runtime depends on Postgres, worker, historian bridge, and LLM/provider setup | Record which runtime services were available and which were not |
| Turning an audit into a broad refactor | Investigation exposes many adjacent issues | Produce follow-up plans or issues instead of changing unrelated code |

## Evidence

| Source | Reason | Confidence |
| ------ | ------ | ---------- |
| `AGENTS.md` | Requires read-first, decision gates, scoped investigation, and pre-edit analysis | high |
| `docs/operations/reports/20260505_default-url-ui-pipeline-audit.md` | Shows source-inspection audit with runtime limits recorded instead of guessed | high |
| `.agents/skills/pr-review-strict/SKILL.md` | Existing strict review workflow requires status inspection and unrelated-dirty-file separation | high |
| `apps/studio/README.md` | Defines Studio workflow and UI behavior that investigations must preserve | high |

## Example Prompt

```md
Investigate why the Write workspace starts a workflow when I only ask a brainstorm follow-up. Do not change code yet. Return evidence, likely root cause, affected files, risks, and the smallest implementation plan if a fix is needed.
```
