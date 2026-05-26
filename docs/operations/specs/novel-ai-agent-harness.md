# Novel AI Agent Harness v1

Issue: #164
Status: Active harness specification
Last updated: 2026-05-26

## Purpose

The Agent Harness is the operating layer for AI coding agents working in `novel-ai`. It does not replace the product architecture or the agent model. It defines how agents load context, choose workflows, investigate safely, preserve product contracts, verify changes, and report drift.

The harness exists because `novel-ai` is a chat-first long-form fiction workspace with frontend, backend, memory, analysis, E2E, local services, and AI orchestration surfaces. A vague task can otherwise lead an agent into the wrong route, stale docs, unrelated rewrites, hidden service assumptions, or broken Write workspace behavior.

## Source Of Truth

- GitHub master issue: #164.
- Agent rules: `AGENTS.md`.
- Studio product and workflow rules: `apps/studio/README.md`.
- Runtime skills: `.agents/skills/`.
- Skill inventory and reports: `docs/agent-skills/`.
- Harness rollout, maintenance, and user guide: `docs/operations/implementation/`.
- E2E config: `apps/studio/playwright.config.ts`.
- E2E tests: `apps/studio/e2e/`.

GitHub issues track harness work. Repo docs define durable rules after the work is accepted.

## Product Contract

Agents must preserve the chat-first writing workspace:

- The main Write workspace is the central surface for brainstorming, context, memory, analysis, review, status, pipeline progress, and artifact previews.
- `/memory`, `/analyze`, `/review`, `/research`, `/pipeline`, `/context`, `/inspect`, and `/status` must not become route-only primary flows.
- Active story and active chapter context must be visible or recoverable in the Write workspace.
- Long pasted or uploaded text must not render as a giant chat bubble. Use attachment, source document, artifact, collapsible preview, or chapter card patterns.
- The right inspector owns detail views for context, memory, workflow progress, analysis, review, artifacts, continuity warnings, and next action.
- Generated prose and full artifacts belong in the right artifact workspace or document surface, not as oversized chat messages.

## Harness Components

### 1. Context Loade

Before editing, an agent verifies the repo root and reads only the relevant sources:

1. Verify `.git`, `AGENTS.md`, `README.md`, `apps`, `docs`, and `scripts`.
2. Read `AGENTS.md`.
3. Read `apps/studio/README.md` for product, Studio, UI, or workflow tasks.
4. Read the relevant `.agents/skills/<skill>/SKILL.md`.
5. Read only directly affected docs, source files, tests, scripts, and migrations.

### 2. Workflow Route

Agents choose a runtime skill by surface:

| Task surface | Skill |
|---|---|
| Harness, docs, skills, stale paths | `agent-harness-consistency-pass` |
| Chat timeline, composer, slash commands | `chat-first-workspace` |
| Context, memory, source traceability | `story-context-grooming` |
| Chapter planning and AutoWrite | `chapter-generation-workflow` |
| Progress blocks and inspector progress | `agent-progress-panel` |
| Artifact previews and document panels | `artifact-context-contract` |
| Write layout and scroll containment | `codex-style-layout-review` |
| Long pasted/uploaded text | `long-text-ingestion` |
| Playwright or browser verification | `playwright-e2e-verification` |
| Issue and PR work | `github-issue-pr-workflow` |

### 3. Guardrails

- Do not perform broad rewrites without a GitHub issue and approved plan.
- Do not hide service requirements.
- Do not reset or purge DB data without explicit confirmation.
- Do not create `.ai/skills`; `.agents/skills/` is the runtime skill home.
- Do not create `docs/ai-layer/` unless a later decision changes docs taxonomy.
- Do not let assistant prose invent backend-originated `workflow_progress`, `artifact_preview`, `approval_gate`, `failure_recovery`, or `context_digest` payloads.

### 4. Investigation Protocol

For non-trivial work, return an investigation report before implementation:

- current implementation map
- source-of-truth files
- state ownership
- API and persistence boundaries
- product contract gaps
- likely files to change
- quality gates
- open questions and risks

### 5. Verification Contract

Docs-only harness work:

```bash
git diff --check
bash -n scripts/ops/agent-session-start.sh
bash -n scripts/ops/agent-session-stop-review.sh
```

Studio source changes:

```bash
cd apps/studio
npm run typecheck
npm run build
npx eslint <changed-files>
```

E2E work:

```bash
cd apps/studio
npm run test:e2e
npm run test:e2e:real
npm run e2e:start-and-test
```

Use the narrowest meaningful gate first, then broader gates before final completion when feasible.

### 6. Drift Detecto

Agents must flag:

- referenced files that no longer exist
- skills that name stale paths or versions
- docs that duplicate or conflict with `AGENTS.md`
- E2E docs that hide Docker, DB, local LLM, Qdrant, Neo4j, historian bridge, or worker requirements
- command behavior that violates chat-first routing

### 7. Session Hooks

Session hooks are lightweight helper scripts. They are optional and must not mutate product state:

- `scripts/ops/agent-session-start.sh`
- `scripts/ops/agent-session-stop-review.sh`

### 8. Manual Skill Optimization Loop

Skills improve through reviewed proposals, not automatic self-editing. See `docs/operations/implementation/agent-harness-maintenance.md`.
