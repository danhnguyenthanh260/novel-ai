# Novel AI Agent Operating Layer

Issue: #164
Status: Active harness specification
Last updated: 2026-05-30

## Purpose

`.agents/` is the single operating layer for AI coding agents working in
`novel-ai`. It contains the harness overview, prompt router, runtime skills,
maintenance rules, reports, agent profiles, scripts, and any other agent-only
metadata.

`AGENTS.md` remains at the repository root because it is the required entrypoint
for agents. It points into `.agents/`; it is not a second harness layer.

The harness exists because `novel-ai` is a chat-first long-form fiction
workspace with frontend, backend, memory, analysis, E2E, local services, and AI
orchestration surfaces. Raw prompts such as "do this for me" or "fix that thing"
must be routed through the prompt universe before an agent chooses files,
skills, GitHub actions, or implementation scope.

## Source Of Truth

- Agent entrypoint: `AGENTS.md`.
- Agent operating layer: `.agents/`.
- Prompt router: `.agents/workflows/prompt-universe.md`.
- Runtime skills: `.agents/skills/<skill>/SKILL.md`.
- Harness maintenance: `.agents/maintenance.md`.
- Harness reports and inventories: `.agents/reports/`.
- Studio product and workflow rules: `apps/studio/README.md`.
- Product architecture and contracts: `docs/architecture/`, `docs/operations/`, and `db/migrations/`.
- E2E config and tests: `apps/studio/playwright.config.ts` and `apps/studio/e2e/`.

GitHub issues track work and decisions. Accepted durable harness rules live
under `.agents/`; accepted product and system rules live under `docs/`.

## Product Contract

Agents must preserve the chat-first writing workspace:

- The main Write workspace is the central surface for brainstorming, context,
  memory, analysis, review, status, pipeline progress, and artifact previews.
- `/memory`, `/analyze`, `/review`, `/research`, `/pipeline`, `/context`,
  `/inspect`, and `/status` must not become route-only primary flows.
- Active story and active chapter context must be visible or recoverable in the
  Write workspace.
- Long pasted or uploaded text must not render as a giant chat bubble. Use
  attachment, source document, artifact, collapsible preview, or chapter card
  patterns.
- The right inspector owns detail views for context, memory, workflow progress,
  analysis, review, artifacts, continuity warnings, and next action.
- Generated prose and full artifacts belong in the right artifact workspace or
  document surface, not as oversized chat messages.

## Prompt Universe Contract

When a prompt is vague, raw, multi-intent, or does not name the right skill, the
agent must read `.agents/workflows/prompt-universe.md` before choosing a route.

The router decides:

- which runtime skill or smallest skill set applies
- whether the work is investigation, planning, implementation, review, E2E, or
  GitHub workflow
- how to restate the user's rough prompt for human review in the user's
  language
- which source-of-truth files must be read before editing
- whether the prompt is blocked by missing services, stale branch state, missing
  secrets, dirty relevant files, unclear scope, or an unapproved decision
- whether to ask the user for more context, a product decision, architecture
  decision, data decision, workflow decision, or GitHub planning decision
- whether the prompt reveals a repeated pattern that should become a skill,
  harness, issue, or explicit memory update proposal

If the agent cannot express the work as concrete files and verification gates,
it must stop and ask for the missing context instead of inventing scope.

## Skill Routing

Agents choose runtime skills by surface:

| Task surface | Skill |
|---|---|
| Harness, `.agents/`, skills, stale paths, source-of-truth drift | `agent-harness-consistency-pass` |
| Unclear root cause, regression, data inconsistency, unclear behavior | `investigation-workflow` |
| Execution plan, issue plan, file manifest, implementation sequencing | `implementation-planning` |
| Review of proposed plans, issue bodies, acceptance criteria, manifests | `implementation-plan-review` |
| Issues, branches, commits, PRs, staging publish flow, GitHub metadata | `github-issue-pr-workflow` |
| PR or local diff review | `pr-review-strict` |
| Chat timeline, composer, slash commands, story switching | `chat-first-workspace` |
| Context, memory, source traceability, context grooming | `story-context-grooming` |
| Generated chapter publishability, canon/world/character/timeline drift, memory cleanliness | `memory-integrity-review` |
| Chapter planning, AutoWrite, `CHAPTER_WRITE_V3`, generation status | `chapter-generation-workflow` |
| Progress blocks, thinking display, inspector progress | `agent-progress-panel` |
| Artifact previews, context digest, document panels | `artifact-context-contract` |
| User journey, product critique, UX report, issue-ready UI/product ticket | `user-journey-product-review` |
| Write layout, viewport locking, independent scroll, responsive fallback | `codex-style-layout-review` |
| Pasted/uploaded long text, mega files, ZIP imports, source docs | `long-text-ingestion` |
| Playwright, browser verification, E2E service requirements | `playwright-e2e-verification` |

Use multiple skills only when the task genuinely crosses surfaces. Prefer the
minimal skill set that can handle the request.

## Decision And Block Rules

Agents must stop for the user when:

- a product, architecture, data model, workflow, or issue-planning decision is
  required and not already approved
- the current checkout is stale, on the wrong base branch, or dirty in files
  relevant to the requested work
- GitHub issues or PRs already cover the work and updating them may be better
  than creating duplicates
- required services, secrets, databases, local LLMs, or external systems are
  unclear
- the task would create a duplicate docs taxonomy or parallel skill tree
- the implementation scope cannot be stated as files plus verification gates

Decision requests must separate evidence, recommendation, decision needed, and
risk if the decision is wrong.

## Context Loading

Before editing, agents must:

1. Verify `.git`, `AGENTS.md`, `README.md`, `apps`, `docs`, `scripts`, and
   `.agents`.
2. Read `AGENTS.md`.
3. Read `.agents/workflows/prompt-universe.md` for raw or unclear prompts.
4. Read `apps/studio/README.md` for product, Studio, UI, or workflow tasks.
5. Read the relevant `.agents/skills/<skill>/SKILL.md`.
6. Read only directly affected docs, source files, tests, scripts, and
   migrations.

## Verification Contract

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

Use the narrowest meaningful gate first, then broader gates before final
completion when feasible.

## Drift Detection

Agents must flag:

- referenced files that no longer exist
- skills that name stale paths or versions
- docs that duplicate or conflict with `AGENTS.md`
- harness docs that live outside `.agents/` as active source-of-truth files
- E2E docs that hide Docker, DB, local LLM, Qdrant, Neo4j, historian bridge, or
  worker requirements
- command behavior that violates chat-first routing

## Session Hooks

Session hooks are lightweight helper scripts. They are optional and must not
mutate product state:

- `scripts/ops/agent-session-start.sh`
- `scripts/ops/agent-session-stop-review.sh`

## Maintenance

Skills improve through reviewed proposals, not automatic self-editing. See
`.agents/maintenance.md`.
