---
name: github-issue-pr-workflow
description: Use when creating, updating, reviewing, or publishing novel-ai GitHub issues, branches, commits, pull requests, review notes, or roadmap status.
---

# Skill: GitHub Issue PR Workflow

## Purpose

Help Codex keep GitHub work small, traceable, staging-first, and aligned with the repo issue templates in `AGENTS.md`.

## When to Use

Use this skill when:

- The user asks to create or update GitHub issues, PRs, branches, commits, review notes, or roadmap status.
- A task comes from an existing GitHub issue or needs a new issue before coding.
- The user asks whether work is done, what remains open, or which branch/PR should be used.

## Inputs to Inspect

Check:

- `AGENTS.md` Git And PR Target Rules, Branch Naming Convention, and Issue To Code Plan Structure
- `git status --short --branch`
- `git remote -v` to resolve the concrete repository name
- Relevant issue/PR state through `gh` when available
- Recent branch and git history for the affected work
- Existing docs or reports that are the source of truth for roadmap status

## Workflow

1. Inspect the current branch, dirty files, and remote before making GitHub claims.
2. Re-fetch live issue/PR state when the answer depends on what is open, closed, merged, or blocked.
3. Use branch names with the repo prefixes from `AGENTS.md`; include issue number when available.
4. Target normal PRs to `staging`. Use `product` only for explicit promotion work or after staging has landed.
5. For new issues, choose Epic, Feature, Task, or Master Tracking shape and include Agent Mode and Human Mode fields where required.
6. Keep PRs small. Explain unrelated dirty files and leave them out unless the user opts in.
7. Write PR descriptions with scope, acceptance criteria, verification, risks, rollback notes, and follow-ups.

## Output Format

Codex should respond using:

```md
# GitHub Workflow Report

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

- [ ] Branch name follows the repo naming convention.
- [ ] PR target is `staging` unless this is an explicit promotion.
- [ ] Issue or PR body has scope, acceptance criteria, quality gates, risks, rollback notes, and follow-ups.
- [ ] Live GitHub state is checked before claiming roadmap completion.
- [ ] Unrelated dirty files are identified and excluded from the GitHub action.

## Guardrails

- Do not use placeholder repos such as `<owner>/<repo>` in commands.
- Do not open normal work directly against `product`.
- Do not close or mark issues done from memory alone.
- Do not mix unrelated application changes into a docs, planning, or issue-only PR.
- Do not create duplicate roadmap issues when a master issue or canonical doc should be updated.

## Common Failure Modes

| Failure Mode | Why It Happens | Prevention |
| ------------ | -------------- | ---------- |
| PR targets the wrong base | GitHub defaults or old habits choose `product` or default branch | Explicitly set base to `staging` for normal work |
| Roadmap status is stale | Issue/PR state changed after the last local note | Re-fetch live GitHub state before declaring done/not done |
| Branch name is vague | Work starts before issue scope is known | Use type prefix and issue number/slug when available |
| Dirty files leak into PR | Worktree already has unrelated changes | Inspect status first and stage/commit only the intended paths |

## Evidence

| Source | Reason | Confidence |
| ------ | ------ | ---------- |
| `AGENTS.md` | Defines staging-first PR target, branch naming, issue levels, master issue format, and planning rules | high |
| Git history from 2026-05 | Shows frequent feature, bug, and docs branches merged through PRs into the active line | high |
| `.github/workflows/split-guardrail.yml` | Shows GitHub Actions are part of repo verification and may need branch/base awareness | medium |
| `docs/operations/reports/20260505_default-url-ui-pipeline-audit.md` | Shows issue/PR follow-up queue and status bookkeeping | high |

## Example Prompt

```md
Create a GitHub task issue for fixing Write workspace page-level scroll. Use Agent Mode and Human Mode, include file manifest, acceptance criteria, QA checklist, risks, rollback notes, and the recommended branch name. Do not code yet.
```
