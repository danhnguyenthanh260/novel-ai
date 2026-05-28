# Skill Update Report

## Summary

- Date: 2026-05-20 UTC
- Branch: `docs/codex-repo-skills`
- Scope: repo-local Codex instruction and skill refresh only
- Mode: autonomous documentation update

Historical note, 2026-05-28: `.agents/` became the single active agent
operating layer. The files originally created under `docs/agent-skills/` now
live under `.agents/reports/`.

## Sources Scanned

| Source | Result |
|---|---|
| `AGENTS.md` | found |
| `CLAUDE.md` | missing |
| `README.md` | found |
| `apps/studio/README.md` | found |
| `docs/` | scanned |
| `prompts/` | scanned |
| `reports/` | missing |
| `sessions/` | missing |
| `logs/` | found directory, no relevant source files in the scan |
| `memory/` | missing |
| `.agent/` | missing |
| `.agents/` | found |
| `.codex/` | missing |
| `.claude/` | missing |
| `.github/` | scanned |
| `/home/danh/.codex/AGENTS.md` | missing |
| `/home/danh/.codex/AGENTS.override.md` | missing |
| git history | scanned |
| recent branches | scanned |
| package scripts | scanned |

## Files Created

- `.agents/skills/chat-first-workspace/SKILL.md`
- `.agents/skills/story-context-grooming/SKILL.md`
- `.agents/skills/chapter-generation-workflow/SKILL.md`
- `.agents/skills/agent-progress-panel/SKILL.md`
- `.agents/skills/artifact-context-contract/SKILL.md`
- `.agents/skills/codex-style-layout-review/SKILL.md`
- `.agents/skills/long-text-ingestion/SKILL.md`
- `.agents/skills/playwright-e2e-verification/SKILL.md`
- `.agents/skills/implementation-plan-review/SKILL.md`
- `.agents/skills/pr-review-strict/SKILL.md`
- `.agents/skills/investigation-workflow/SKILL.md`
- `.agents/skills/implementation-planning/SKILL.md`
- `.agents/skills/github-issue-pr-workflow/SKILL.md`
- `.agents/reports/README.md`
- `.agents/reports/session-context-inventory.md`
- `.agents/reports/skill-update-report.md`
- `docs/operations/implementation/write-assistant-chat-qa-barem.md`

## Files Updated

- `.gitignore`
- `AGENTS.md`
- `.agents/skills/chat-first-workspace/SKILL.md`
- `.agents/skills/codex-style-layout-review/SKILL.md`
- `.agents/skills/agent-progress-panel/SKILL.md`
- `.agents/skills/playwright-e2e-verification/SKILL.md`
- `apps/studio/README.md`

Note: several created files existed locally before this pass but were still
untracked relative to `HEAD`. They are listed here because the branch now makes
them visible as the curated repo-specific skill set.

## Skills Created / Updated

| Skill | Status | Reason |
|---|---|---|
| `investigation-workflow` | created | Adds a repo-specific evidence-first workflow for unclear failures, audits, and root cause analysis. |
| `implementation-planning` | created | Turns `AGENTS.md` issue-plan rules into an execution-planning skill rather than only a plan-review skill. |
| `github-issue-pr-workflow` | created | Captures branch naming, staging-first PRs, live GitHub state checks, and dirty-worktree handling. |
| `chat-first-workspace` | updated | Captures recent composer, brainstorm, command routing, and choice-group regressions as hard tripwires. |
| `codex-style-layout-review` | updated | Captures Write viewport lock and internal scroll regressions as layout tripwires. |
| `agent-progress-panel` | updated | Captures block-source ownership, terminal progress state, and raw-log guardrails. |
| `playwright-e2e-verification` | updated | Records current no-Playwright reality and points browser verification at the manual QA barem. |
| `implementation-plan-review` | unchanged | Existing review skill already covers pre-coding issue/plan review. |
| `pr-review-strict` | unchanged | Existing strict review skill already covers local diff and PR review. |

## Mandatory Rules Added

- Investigate first when root cause is unclear; separate symptom, evidence, finding, proposed fix, files, QA, risks, and next step.
- Write acceptance criteria before technical design in implementation plans.
- Include a `CREATE`/`MODIFY`/`DELETE` file manifest before coding when scope is known.
- Keep normal PRs targeting `staging`; reserve `product` for explicit promotion.
- Re-fetch live GitHub state before claiming roadmap work is done or closing issues.
- Identify unrelated dirty files and keep them out of GitHub actions unless the user opts in.
- Treat Write composer drafts as private input until submit.
- Keep Write route scroll owned by internal panes, not the browser page.
- Treat the manual Write Assistant QA barem as the current acceptance proof until Playwright exists.

## Candidate Rules

Rules that need human confirmation:

- Resolved on 2026-05-28: `.agents/` is the single active agent operating layer. Do not mirror portable runtime copies under `docs/agent-skills/skills/`.
- Whether the uncommitted Write Assistant QA barem should be promoted as canonical staging documentation.
- Whether a novel-ai-specific deployment debugging skill is needed. Current evidence supports infra/runbook awareness, but not the Laravel/Sanctum/CORS examples from the prompt.
- Whether the generic skill library under `.agents/skills/` should remain vendored in the repo or stay ignored except for curated repo-specific skills.

## Risks / Uncertain Assumptions

- `.agents/` is mostly ignored, with `.gitignore` exceptions for curated repo-specific skills. `git status --short` may still show the directory collapsed as untracked unless untracked files are expanded.
- Several unrelated application source files were dirty before this pass. They were not used as implementation scope and were not modified for this documentation update.
- External GitHub issue/PR live state was not fetched in this pass; git history was enough for local skill evidence, but not for current roadmap claims.
- Prompt examples about Laravel, Sanctum, CSRF, admin product UI, and product tables did not match this repo and were not promoted into rules.

## Validation

- [x] No secrets included.
- [x] No unrelated private content included.
- [x] Existing instructions were preserved.
- [x] New rules have evidence.
- [x] Markdown structure is readable.
- [x] Final diff is reviewable.

## Recommended Next Step

Review the three new workflow skills under `.agents/skills/` and keep reports under `.agents/reports/`.
