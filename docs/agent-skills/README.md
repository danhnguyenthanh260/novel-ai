# Agent Skills Meta-Docs

This folder holds meta-documents about the agent skill system for
`novel-ai`. It is intentionally separate from the runtime skill files.

| Location | Purpose |
|---|---|
| `.agents/skills/` | Runtime skills consumed by agents. Source of truth for skill content. Listed in `AGENTS.md`. |
| `docs/agent-skills/` (this folder) | Snapshots and analysis reports about the skill system. Not consumed at runtime. |

## Files

- [`session-context-inventory.md`](./session-context-inventory.md): one-time
  inventory of repo-local sources used to derive evidence-backed skill
  updates on 2026-05-20.
- [`skill-update-report.md`](./skill-update-report.md): change report for
  the 2026-05-20 skill refresh pass.

## How To Find A Skill

Skills live under `.agents/skills/<skill-name>/SKILL.md`. The active
repo-specific skills are:

- `chat-first-workspace`
- `story-context-grooming`
- `chapter-generation-workflow`
- `agent-progress-panel`
- `artifact-context-contract`
- `codex-style-layout-review`
- `long-text-ingestion`
- `playwright-e2e-verification`
- `implementation-plan-review`
- `pr-review-strict`
- `investigation-workflow`
- `implementation-planning`
- `github-issue-pr-workflow`

`AGENTS.md` lists them with one-line descriptions. The other directories
under `.agents/skills/` (api-patterns, app-builder, frontend-design,
game-development, and similar) are a vendored generic library, not
tailored to novel-ai.
