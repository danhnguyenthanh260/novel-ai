# Session / Context Inventory

## Summary

- Scan date: 2026-05-20 UTC
- Repo: `/home/danh/novel-ai`
- Branch: `docs/codex-repo-skills`
- Sources scanned: `AGENTS.md`, `apps/studio/README.md`, `README.md`, `docs/`, `.agents/`, `.github/`, `prompts/`, recent git history, recent branches, package scripts, and repo-local session-like docs.
- Sources unavailable: `CLAUDE.md`, `reports/`, `sessions/`, `memory/`, `.agent/`, `.codex/`, `.claude/`, `/home/danh/.codex/AGENTS.md`, `/home/danh/.codex/AGENTS.override.md`, external GitHub issue/PR live state, external ticket systems, and local Claude transcript stores.

## Inventory

| Source | Type | Freshness | Main Topic | Should Influence Skills? | Confidence |
|---|---|---:|---|---|---|
| `AGENTS.md` | instruction | recent | Canonical agent rules, WSL execution, staging-first PR target, branch naming, decision gate, planning format, runtime skill index | yes | high |
| `apps/studio/README.md` | doc | recent | Studio architecture, Write workspace chat contracts, viewport lock, command routing, asset APIs, package behavior | yes | high |
| `README.md` | doc | recent | Repo stack, local setup, Docker infra, worker and Studio roles, environment boundaries | yes | high |
| `.agents/skills/chat-first-workspace/SKILL.md` | skill | recent | Write Assistant, composer, brainstorm, slash commands, durable conversations | yes | high |
| `.agents/skills/codex-style-layout-review/SKILL.md` | skill | recent | Codex-like Write layout, viewport containment, internal pane scroll, responsive fallback | yes | high |
| `.agents/skills/agent-progress-panel/SKILL.md` | skill | recent | `workflow_progress`, inspector progress, terminal states, compact telemetry | yes | high |
| `.agents/skills/playwright-e2e-verification/SKILL.md` | skill | recent | Browser verification expectations and current no-Playwright reality | yes | high |
| `.agents/skills/implementation-plan-review/SKILL.md` | skill | recent | Review of plans, issue bodies, manifests, acceptance criteria, decision gates | yes | high |
| `.agents/skills/pr-review-strict/SKILL.md` | skill | recent | Strict diff/PR review, dirty worktree handling, findings-first output | yes | high |
| `docs/operations/specs/studio-chat-orchestration-layer.md` | spec | recent | Assistant prompt boundary, timeline block registry, block source ownership, readiness handling | yes | high |
| `docs/architecture/conversational-command-orchestrator.md` | spec | recent | Command plane, tool registry, lifecycle states, artifact handoff, approval gates | yes | high |
| `docs/architecture/writing-context-contract.md` | spec | recent | `WritingContext` proceed/degraded/blocked outcomes and source trace expectations | yes | high |
| `docs/architecture/chapter-writing-context-assembler.md` | spec | recent | Context slot priorities, budget trimming, readiness rules | yes | high |
| `docs/architecture/document-editor-boundary.md` | spec | recent | Draft/canon boundary, editor storage, approval semantics | yes | high |
| `docs/architecture/story-memory-contract.md` | spec | recent | Durable story memory categories, conflict handling, source priority | yes | high |
| `docs/architecture/post-write-memory-promotion-flow.md` | spec | recent | Draft-to-memory promotion gate and continuity issue handling | yes | high |
| `docs/operations/implementation/write-assistant-chat-qa-barem.md` | QA note | recent | Manual QA matrix for composer, timeline, brainstorm choices, routing, history, layout | yes | high |
| `docs/operations/reports/20260505_default-url-ui-pipeline-audit.md` | report | recent | UI pipeline audit, source-inspection methodology, runtime limitations, follow-up PR queue | yes | high |
| `.github/workflows/split-guardrail.yml` | workflow | recent | Split benchmark guardrail workflow, GitHub Actions verification surface | candidate | medium |
| `apps/studio/package.json` | script manifest | recent | Real validation commands: `build`, `typecheck`, `lint`, doctor scripts; no Playwright script | yes | high |
| Recent git history, last ~60 days | git | recent | Chat-first workspace, viewport fixes, artifact/inspector wiring, V3 writing path, branch naming patterns | yes | high |
| Recent branches | git | recent | `feature/*`, `bug/*`, `docs/*` branch pattern; current docs branch `docs/codex-repo-skills` | yes | high |
| `prompts/examples/*` | prompt | unknown | Chapter prompt examples | no | low |
| `.agents/agents/*`, `.agents/workflows/*`, `.agents/rules/GEMINI.md` | agent framework | unknown | Generic agent framework, not specific runtime skill source | candidate | low |
| Laravel, Sanctum, CSRF, product table, admin product UI sources | repo search | unavailable | Prompt examples did not match this repo's stack or evidence | no | high |
| Playwright config or E2E tests | repo search | unavailable | No `playwright.config.*`, no package Playwright script found | candidate | high |

## Notes

- Do not include secrets.
- Do not include unrelated private content.
- Only summarize relevant evidence.
- Historical note, 2026-05-28: `.agents/reports/` replaced `docs/agent-skills/` as the report and inventory layer. Runtime skills live under `.agents/skills/`.
- Deployment debugging was not promoted into a novel-ai-specific skill in this pass. The repo has infra, doctor scripts, and runbooks, but the requested Laravel/Sanctum/CORS evidence is not present.
