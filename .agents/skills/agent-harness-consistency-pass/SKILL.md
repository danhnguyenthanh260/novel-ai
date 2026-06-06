---
name: agent-harness-consistency-pass
description: Use when auditing or updating the Novel AI Agent Harness, AGENTS.md, runtime skills, docs taxonomy, E2E paths, session hooks, or broken source-of-truth references.
---

# Agent Harness Consistency Pass

## Purpose

Keep the repo's agent harness accurate before adding or changing rules. This skill is for finding stale paths, duplicate docs, outdated skill instructions, missing source-of-truth files, and verification command drift.

## Trigger Conditions

Use this skill when a task mentions:

- Agent Harness v1, AI layer, context pack, or agent operating guide.
- `AGENTS.md`, `.agents/`, `.agents/skills/`, `.agents/workflows/`, or session hooks.
- E2E command or Playwright path drift.
- Broken documentation references.
- Creating or updating harness GitHub issues.

## Required Investigation Steps

1. Verify the real repo root:
   - `git status --short --branch`
   - `git remote -v`
   - root listing includes `.git`, `AGENTS.md`, `README.md`, `apps`, `docs`, and `scripts`.
2. Read `AGENTS.md`.
3. Read `apps/studio/README.md` if Studio workflow, UI, E2E, or product behavior is in scope.
4. Inspect:
   - `.agents/README.md`
   - `.agents/workflows/`
   - `.agents/skills/*/SKILL.md`
   - `.agents/maintenance.md`
   - `.agents/reports/`
   - `docs/architecture/`
   - `apps/studio/package.json`
   - `apps/studio/playwright.config.ts`
   - `apps/studio/e2e/`
   - `scripts/ops/`
   - `.github/`
5. Search for drift:
   - missing referenced docs
   - stale `tests/e2e` references
   - stale Playwright versions
   - duplicate docs that claim to be source of truth
   - active harness specs outside `.agents/`
   - recommendations to create `.ai/skills` when `.agents/skills` is the runtime home
   - hidden service assumptions for Docker, PostgreSQL, Qdrant, Neo4j, local LLM, workers, or Studio

## Output Format

Return:

```md
# Agent Harness Consistency Report

## Summary
## Current Source-of-Truth Map
## Drift Found
## Required Fixes
## Follow-up Issues
## Verification
## Risks
```

## Implementation Rules

- Do not change product behavior during a consistency pass.
- Prefer the single agent operating layer:
  - `.agents/README.md` for the canonical harness spec.
  - `.agents/workflows/` for prompt routers and workflow intake.
  - `.agents/skills/` for runtime skills.
  - `.agents/maintenance.md` for the skill update and proposal policy.
  - `.agents/reports/` for skill inventories and update reports.
- Do not create `.ai/skills/` unless a human explicitly changes the repo convention.
- Do not create active harness docs under `docs/agent-skills/`, `docs/ai-layer/`, or `docs/operations/`.
- Product architecture, runbooks, and system contracts may still live under `docs/`.
- If a referenced source-of-truth file is missing, either restore a small canonical file or track the fix in GitHub before adding new dependent docs.
- Preserve chat-first product rules while documenting harness workflows.

## Verification Requirements

For docs-only harness work, run:

```bash
git diff --check
```

If package scripts or shell hooks change, also run:

```bash
bash -n scripts/ops/agent-session-start.sh
bash -n scripts/ops/agent-session-stop-review.sh
```

If `apps/studio` TypeScript, config, or tests change, use the Studio gates from `AGENTS.md`.
