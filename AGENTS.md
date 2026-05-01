# AGENTS.md

Canonical repository guidance for agents working in `novel-ai`.

This is the only active agent instruction file for this repository. Read this file before doing repo work in a new chat or task. Do not use `AGENT.md` as a second source of truth.

Goal: high-signal execution with minimal drift, clear ownership, predictable verification, and issue plans that can be executed by agents and reviewed by humans.

## Read-First Rule

Before touching code:

1. Read `AGENTS.md`.
2. Read `apps/studio/README.md` when the task touches product architecture or workflow behavior.
3. Read only files directly related to the task.

Do not broad-scan the repository without need. Do not read generated/build artifacts unless the task is specifically about them.

## WSL Execution Standard

This repo is edited from Windows context but runs in WSL. Run Node, Python, and DB commands via WSL paths when executing project toolchains.

Examples:

```powershell
wsl bash -lc "cd /home/danh/novel-ai/apps/studio && npm run typecheck"
wsl bash -lc "cd /home/danh/novel-ai && /home/danh/novel-ai/.venv/bin/python3 ..."
```

Avoid running project toolchains from Windows `CMD` or PowerShell directly on UNC paths unless the command is only reading files or using GitHub/Git metadata.

## Collaboration Rules

- Chat with the user in Vietnamese unless the user asks otherwise.
- Code identifiers, comments, logs, and technical strings stay in English.
- Markdown technical docs in the repo stay in English.
- Keep edits scoped to the requested task.
- Do not perform unrelated refactors.
- For UI work, prefer minimal necessary controls and avoid adding noise to primary workflows.

## Analysis Before Editing

Before edits, clarify:

1. Which files will change.
2. Main risks: logic, UI, data, workflow, security, or migration.
3. Step order when the task is multi-phase.

For large tasks, implement incrementally and verify per phase.

## Verification Rules

After edits in `apps/studio`:

1. Run `npm run build` before final completion when feasible.
2. Use `npm run typecheck` for fast validation during iteration.
3. Lint changed files only:

```bash
npx eslint <changed-file-1> <changed-file-2>
```

Do not run whole-project lint unless requested. If verification cannot run, state exactly why.

## Source Of Truth

- Agent instructions: `AGENTS.md`.
- Product architecture and flows: `apps/studio/README.md`.
- Data model and contracts: `db/migrations/*.sql`.
- Change boundary map: `docs/architecture/change-impact-map.md`.

When behavior or contracts change, update the relevant docs in the same turn.

## Repo Hygiene Rules For Docs And Scripts

Use these folders by intent:

- `docs/operations/specs/` for active canonical specs.
- `docs/operations/implementation/` for active rollout, checklists, and file maps.
- `docs/operations/runbooks/` for operator procedures.
- `docs/operations/reports/` for dated outputs.
- `docs/archive/YYYY-MM/` for superseded docs.

Do not create duplicate plans or checklists for an existing topic. Prefer extending canonical docs.

For merged topics, edit canonical files only. Legacy files must be pointer stubs until the cleanup window ends.

Pointer stub format:

```text
Superseded by <new-path>
Created at: YYYY-MM-DD UTC
Auto-cleanup after 14 days
```

When moving or merging docs:

1. Update links in scope: `docs/`, `apps/`, `services/`, `scripts/`.
2. Verify no stale references to replaced file paths remain.
3. Only then archive or remove old docs.

Script locations:

- `db/scripts/production/` reusable production-safe scripts.
- `db/scripts/debug/` active debug tooling.
- `db/scripts/legacy/` temporary backward compatibility scripts or symlinks.
- `db/scripts/scratch/` one-off short-lived artifacts.
- `scripts/ops/` app-level reusable tools.
- `scripts/debug/` app-level debug tools.

Do not place ad-hoc debug SQL or Python files at repo root.

## Runtime And DB Safety

Timeout environment variables must use seconds. Use names like `*_SECONDS`; do not introduce millisecond timeout variables unless strictly required for external compatibility.

When the user requests DB cleanup/reset, use the canonical script:

```text
db/scripts/production/purge_to_pillar_strict.sql
```

Strict reset intent:

- Cleans runtime and content/source data.
- Keeps only pillar baseline data: `story_series`, pillar rows in `story_dictionary`, and baseline compatibility pair.

Before reset:

1. Stop worker/writer processes that can repopulate ingest tables.
2. Confirm target DB connection string.

After reset:

1. Run verification SQL counts for `story_chapter`, `source_doc`, `ingest_job`, `ingest_task`, and `split_feedback`.
2. Confirm baseline compatibility row exists: `v1.0` plus `rp1.0`.

Never run strict reset implicitly. Require explicit user confirmation that chapter/source data should be deleted.

## Local Infrastructure Notes

Infrastructure is defined in `infra/docker-compose.yml`.

| Container | Image | Host port | Role |
|---|---|---|---|
| `novel_pg` | `postgres:15` | `5433` -> `5432` | Primary PostgreSQL |
| `novel_qdrant` | `qdrant:v1.13.4` | `6333`, `6334` | Vector store for style memory |
| `novel_neo4j` | `neo4j:5.26` | `7474`, `7687` | Graph lineage store |
| `novel_historian_bridge` | `python:3.12-slim` | `8090` | MCP bridge for Qdrant and Neo4j |
| `novel_studio` | `Dockerfile` | `3001` -> `3000` | Next.js app |
| `novel_grafana` | `grafana:latest` | `3000` | Optional observability |

Important local env vars:

```env
HISTORIAN_MCP_BASE_URL=http://localhost:8090
HISTORIAN_QDRANT_ENABLED=1
HISTORIAN_NEO4J_ENABLED=1
HISTORIAN_QDRANT_MIN_SCORE=0.65
```

If `HISTORIAN_MCP_BASE_URL` is empty, `_load_external_signals()` returns immediately with `style_similarity = 0.0` regardless of `HISTORIAN_QDRANT_ENABLED`. Verify this first when debugging `narrative_score` or `style_similarity = 0.000`.

The `narrative_swas_memory` collection is populated only after `WRITING_ANALYSIS` tasks run and index style vectors. On a fresh DB, an empty collection and `style_similarity = 0.0` can be expected.

Preferred DB diagnostics run inside the container to reduce shell and networking ambiguity:

```bash
docker exec novel_pg psql -U novel -d novel -c "SELECT count(*) FROM ingest_job WHERE mode='AUTO_CHAPTER';"
```

## Issue To Code Plan Structure

Every issue should support two rendering modes:

- `Agent Mode`: dense, machine-actionable, and unambiguous. Every field is a directive. File paths are explicit. Quality gates are binary pass/fail. Estimates are in hours. Trade-offs are pre-decided.
- `Human Mode`: narrative, contextual, and decision-oriented. It explains why decisions were made, what risks exist, what was considered and rejected, and what a reviewer should watch for.

Both modes should draw from the same underlying fields. A well-written issue lets the agent execute and lets the human understand the reasoning.

## Level 1: Epic

Title format:

```text
[Epic][Area] Short imperative title
```

### Agent Mode

Required fields:

- `Purpose`: one sentence describing the system problem or user gap being closed.
- `Desired end state`: bullet list of observable, verifiable outcomes. Do not use implementation language.
- `Scope`: explicit list of systems, surfaces, and contracts included.
- `Out of scope`: explicit list of things that must not be done inside this epic.
- `Child features`: linked issue list, updated as features are added or removed.
- `Acceptance criteria`: checklist with binary pass/fail conditions.
- `Impact surface`: systems, services, and user flows affected by this epic completing.
- `Dependencies`: blocking issues, external decisions, or shared contracts required before child features begin.
- `Status`: Planning, In Progress, Blocked, or Done.

Acceptance criteria format:

```text
- [ ] Condition A is true
- [ ] Condition B is true
- [ ] No regression on flow C
```

### Human Mode

Required fields:

- `Situation`: narrative explanation of why this epic exists now, what changed, and what remains broken if it is not done.
- `Key decisions already made`: epic-level decisions that child features must not re-litigate.
- `Key risks and watch points`: cross-epic risks and assumptions reviewers should monitor.
- `Trade-off record`: table of meaningful choices.

Trade-off record format:

```markdown
| Decision | Option chosen | Option rejected | Reason |
|---|---|---|---|
| Storage layer | PostgreSQL | Redis | Durability required across sessions |
| Auth strategy | Reuse existing JWT | New token type | Scope reduction |
```

## Level 2: Feature

Title format:

```text
[Feature][Area] Short imperative title
```

### Agent Mode

Required fields:

- `Purpose`: what user or system problem this feature solves.
- `Scope`: what is built or changed, including API contracts, UI surfaces, schema fields, and service boundaries.
- `Out of scope`: what this feature must not touch, even if adjacent.
- `Acceptance criteria`: binary checklist written before technical design.
- `File manifest`: every file created, modified, or deleted, grouped by area.
- `Boundary definition`: what this feature owns and explicitly does not own.
- `Impact analysis`: direct impact, downstream impact, and regression risks.
- `Quality gates`: all checks that must pass before pushing.
- `Estimate`: hour range, broken down by work area.
- `Task breakdown`: linked task issues ordered by execution sequence.
- `Dependencies`: blocked by, blocks, and related issues.

File manifest format:

```text
CREATE
  src/services/sessionService.ts
  src/api/routes/sessions.ts
  db/migrations/20260501_add_sessions_table.sql
  tests/unit/sessionService.test.ts
  tests/integration/sessions.api.test.ts

MODIFY
  src/api/router.ts              - register new session routes
  src/types/index.ts             - add Session and SessionStatus types
  src/db/schema.ts               - add sessions table definition

DELETE
  src/legacy/sessionHelper.ts    - replaced by sessionService.ts
```

Boundary definition format:

```text
Owns:
  - Session creation, retrieval, and status transitions
  - Session schema and migration
  - Session service layer and API routes

Does not own:
  - Authentication or authorization logic
  - Story memory retrieval
  - Frontend session UI
```

Impact analysis format:

```text
Direct impact:
  - src/api/router.ts gains two new routes
  - db/schema.ts gains one new table

Downstream impact:
  - memoryService.ts will depend on sessions table existing
  - Write screen feature cannot begin until POST /api/v1/sessions is stable

Risk of regression:
  - Existing auth middleware wraps all /api routes; verify session routes are protected
  - schema.ts changes require coordinated migration run before deploy
```

Quality gates format:

```text
Build:
  - [ ] tsc --noEmit passes with zero errors
  - [ ] eslint passes with zero new warnings

Tests:
  - [ ] Unit tests pass
  - [ ] Integration tests pass
  - [ ] No existing tests broken

Migration:
  - [ ] Migration runs up cleanly on local DB
  - [ ] Migration runs down cleanly

Manual:
  - [ ] Valid request succeeds
  - [ ] Invalid input returns 400
  - [ ] Unauthorized request returns 401
```

Estimate format:

```text
Total: 6-8 hours

  Schema and migration:         1 h
  Service layer + types:        2 h
  API routes + router wiring:   1 h
  Unit tests:                   1.5 h
  Integration tests:            1.5 h
  PR cleanup and review:        0.5-1 h
```

Dependencies format:

```text
Blocked by:  [Feature][DB] Story memory source-of-truth contract
Blocks:      [Feature][FE] Write screen session wiring
Related:     [Task][OPS] Add sessions table to staging seed script
```

### Human Mode

Required fields:

- `Situation`: why this feature is being built now and what changes after it ships.
- `Approach and reasoning`: plain-language explanation of the proposed structure and why it was chosen.
- `Trade-off record`: meaningful feature-level choices.
- `What a reviewer should focus on`: the most important review concerns.
- `Known unknowns`: uncertainty the implementer must surface rather than silently decide.
- `Follow-up issues to create after this ships`: intentional scope deferrals.

## Level 3: Task

Title format:

```text
[Task][Area] Short imperative title
```

### Agent Mode

Required fields:

- `Purpose`: one sentence describing the gap this task closes within its parent feature.
- `Scope`: exactly what will be done.
- `Out of scope`: what this task must not touch.
- `File manifest`: every file created, modified, or deleted.
- `Acceptance criteria`: binary checklist.
- `Quality gates`: checks required for this task.
- `Estimate`: hour estimate with breakdown.
- `Implementation notes`: running log of discoveries, decisions, and deviations. Update during coding.
- `Dependencies`: blocks, parent, and related issues.

Task file manifest format:

```text
CREATE
  db/migrations/20260501_add_sessions_table.sql

MODIFY
  src/db/schema.ts    - add sessions table definition and Session type export
```

Task acceptance criteria format:

```text
- [ ] Migration file follows naming convention: YYYYMMDD_description.sql
- [ ] sessions table includes: id, user_id, status, created_at, updated_at
- [ ] status column uses enum: draft | active | completed | abandoned
- [ ] Migration runs up cleanly
- [ ] Migration runs down cleanly
- [ ] No existing migration files modified
```

### Human Mode

Required fields:

- `Situation`: why this task exists and what stays incomplete if skipped.
- `Approach`: how the task will be executed and why.
- `Trade-off record`: include only if a real task-level decision was made.
- `What a reviewer should focus on`: one or two likely problem areas.
- `Risk`: task-specific failure modes.

## Master Tracking Issue

Create one master issue per long-term product plan. It is the source of truth for roadmap state.

Required contents:

- `Current product vision`: one paragraph, stable unless strategy changes.
- `Epic registry`: table of active epics.
- `Decision log`: dated decisions with rationale and affected epics.
- `Changelog`: dated significant plan changes and why they happened.
- `Open questions`: unresolved decisions that affect future epics. Resolved questions move to the decision log.

Epic registry format:

```markdown
| Epic | Area | Status | Feature count | Blocking / Blocked by |
|---|---|---|---|---|
| Canonical writing pipeline | Architecture | In Progress | 4 | - |
| Story memory system | DB + AI | Planning | 3 | Writing pipeline |
```

Decision log format:

```markdown
| Date | Decision | Rationale | Affected epics |
|---|---|---|---|
| 2026-05-01 | PostgreSQL over Redis for session state | Durability requirement | Writing pipeline |
```

## Area Tags

Every non-master issue should identify its main implementation area in the title or labels:

- `BE`: backend, API routes, workers, services, orchestration.
- `FE`: frontend, UI, editor, canvas, interaction design.
- `DB`: schema, migrations, durable data contracts, indexes.
- `AI`: prompts, context assembly, LLM calls, guardrails, evaluation.
- `OPS`: worker runtime, deployment, observability, repo hygiene, security.
- `DOCS`: specs, runbooks, product plans, architecture notes.

Use multiple areas only when the issue genuinely crosses boundaries, for example `BE + DB` or `FE + AI`.

## Planning Rules

- Write acceptance criteria before technical design on every feature and task.
- Write the file manifest before writing any code. If the files cannot be listed, the scope is not clear enough.
- Quality gates are non-negotiable. Do not push without all required gates passing.
- Estimates are ranges, not commitments. Widen the range when dependencies or unknowns are high.
- When scope changes during implementation, update the issue first, then continue.
- Trade-offs decided during implementation belong in implementation notes.
- Create follow-up issues for things descoped during implementation.
- Do not turn every idea into an issue immediately.
- First create issues for work that removes ambiguity, reduces duplicated business paths, improves safety, or unlocks the canonical product flow.
- When a plan changes, update the master issue and affected epics/features instead of creating duplicate roadmap issues.
- Prefer fewer high-quality issues over many vague issues.
