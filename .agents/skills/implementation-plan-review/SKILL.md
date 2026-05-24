---
name: implementation-plan-review
description: Use when reviewing a proposed implementation plan, GitHub issue, task breakdown, file manifest, acceptance criteria, or phase plan before coding in the novel-ai repository.
---

# Implementation Plan Review

## Trigger Conditions

Use this skill when the user asks to review:

- an implementation plan before coding
- a GitHub issue body or task breakdown
- a file manifest or phase plan
- acceptance criteria or quality gates
- a proposed architecture/workflow/data/UI decision before implementation

## Goal

Catch ambiguity, hidden dependencies, scope creep, rollback risk, missing file ownership, and weak verification before code is written.

## Required Investigation Steps

1. Read `AGENTS.md` issue planning rules.
2. Read `apps/studio/README.md` if the plan touches product architecture or workflow behavior.
3. Read only the docs/code directly referenced by the plan.
4. For UI plans, read the relevant UI contract doc and current components.
5. For context/writing plans, read `writing-context-contract.md` and `chapter-writing-context-assembler.md`.
6. For DB plans, inspect the relevant migrations and SQL contracts.

## Review Rules

- Verify the plan separates investigation from implementation.
- Verify acceptance criteria are binary and written before technical design.
- Verify the file manifest lists every create/modify/delete path and describes why.
- Verify ownership boundaries: what the task owns and what it explicitly does not own.
- Verify user-visible behavior is described for UI work.
- Verify data contracts and migration implications are explicit for backend/DB work.
- Verify edge cases and rollback strategy are present where behavior can block writing or corrupt state.
- Verify quality gates use real repo commands from package files/docs, not invented commands.
- Apply the Decision Gate Rule: if product, architecture, data model, workflow, or issue-planning decisions are not approved, stop and ask for approval before encoding them.

## Forbidden Actions

- Do not start coding during a plan review unless the user explicitly approves implementation.
- Do not create new GitHub issues from a plan with unresolved decisions.
- Do not accept vague file manifests such as "update UI files".
- Do not let raw payload/debug surfaces leak into writer-facing UI plans.
- Do not approve plans that skip `staging` branch/PR rules when publishing work.

## Output Format

Use this review shape:

1. Verdict: `Ready`, `Ready with fixes`, or `Not ready`.
2. Blockers.
3. High/medium concerns.
4. Missing file manifest or quality gates.
5. Required decisions.
6. Suggested minimal next revision.

Keep the review concise and issue-first.

## Verification Requirements

For plan review, verification is usually documentary:

- Cite local repo files inspected.
- Confirm commands are real by checking `apps/studio/package.json`, docs, or scripts.
- Do not claim tests were run unless they were actually run.

## Edge Cases

- Plan touches both chat UI and backend workflow: require timeline block/source ownership and recovery behavior.
- Plan touches memory/context: require source trace and degraded/block semantics.
- Plan touches Playwright: first verify whether setup exists.
- Plan is GitHub-issue shaped: enforce Agent Mode and Human Mode fields from `AGENTS.md`.
