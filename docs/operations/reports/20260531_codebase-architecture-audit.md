# Codebase Architecture Audit: TypeScript and Memory Bridge Worker

Created: 2026-05-31  
Status: Planning report  
Scope: `apps/studio/src/features/**`, `services/memory-bridge/*.py`, repo architecture gates  
Prompt route: `.agents/workflows/prompt-universe.md` -> code organization, module boundaries, naming conventions, line budgets, file splitting -> `investigation-workflow` + `implementation-planning`

## Situation

The repository has outgrown several early aggregation files. The visible problem is large files, but the deeper issue is mixed ownership: API response shaping, SQL access, policy decisions, workflow orchestration, LLM runtime calls, prompt assembly, persistence, and UI state are often compressed into the same module.

This report is a no-code audit and issue-ready plan. It should be used before another broad refactor so future agents can make incremental, reviewable changes without guessing module boundaries.

## Evidence

Source-of-truth files inspected:

- `AGENTS.md`
  - Requires investigation before broad edits, file manifests before code, decision gates for architecture changes, and issue plans that support Agent Mode and Human Mode.
- `.agents/workflows/prompt-universe.md`
  - Routes code organization, module boundaries, naming, line budgets, file splitting, and repo-wide coding standards to `implementation-planning`.
- `apps/studio/README.md`
  - Defines `src/app` as route/page/route-handler, `src/features` as business domains, and server route handlers as parse-request-plus-call-workflow/repo only.
  - Defines line budgets: `components/*` target `<300`, hard cap `500`; `server/*` target `<250`, hard cap `400`.
  - Defines refactor direction: components split into `PageContainer`, `View`, `hooks`, `actions`, `types/mappers`; server pipeline split into `service`, `validators`, `repo/db`, `policy/decision`, `dto mapper`.
- `apps/studio/scripts/check_line_budgets.mjs`
  - Enforces Studio component and server line budgets, with legacy exemptions only for a fixed allowlist.
- `apps/studio/eslint.config.mjs`
  - Enforces max-lines, max-lines-per-function, complexity, max-depth, and component-to-server import boundaries.
- `apps/studio/package.json`
  - Confirms available gates: `npm run build`, `npm run typecheck`, `npm run lint:line-budgets`, targeted `npx eslint <files>`, Playwright and doctor scripts.

Command evidence:

```bash
cd /home/danh/novel-ai/apps/studio && npm run lint:line-budgets
```

Result: fails on hard-cap violations. Top current hard-cap violations include:

| File | Lines | Cap | Surface |
|---|---:|---:|---|
| `src/features/agents/server/agentsApiService.ts` | 2755 | 400 | TypeScript server |
| `src/features/analysis/server/historianAnalysisService.ts` | 2269 | 400 | TypeScript server |
| `src/features/scenes/server/workflow/steps/chapterPlanning.ts` | 1972 | 400 | TypeScript server workflow |
| `src/features/scenes/server/scenesApiService.ts` | 1778 | 400 | TypeScript server |
| `src/features/analysis/components/HistorianAnalysisConsole.tsx` | 1045 | 500 | React component |
| `src/features/scenes/components/writeTab/AutoWriteWizard.tsx` | 990 | 500 | React component |
| `src/features/ingest/server/ingestFeedbackService.ts` | 892 | 400 | TypeScript server |
| `src/features/analysis/server/truthPackGovernance.ts` | 761 | 400 | TypeScript server |
| `src/features/autowrite/server/writingPipelineService.ts` | 691 | 400 | TypeScript server |
| `src/features/agents/server/agentDrawerService.ts` | 569 | 400 | TypeScript server |

Worker inventory:

| File | Lines | Observed ownership pressure |
|---|---:|---|
| `services/memory-bridge/worker_task_handlers.py` | 2254 | task handlers, Neo4j sync, shadow split runtime, split tracing, chapter split, scene creation, writing analysis, memory rollup, writing stages, chapter write v3, ledger, rollup v3 |
| `services/memory-bridge/worker_ingest_repo.py` | 2109 | ingest task lifecycle, source docs, scene persistence, memory persistence, prompt/runtime persistence |
| `services/memory-bridge/worker_split_proposal.py` | 2009 | manual/auto split proposal, policy, strategy profile updates, proposal shaping |
| `services/memory-bridge/worker_writing_analysis.py` | 1754 | writing analysis, vetting, scoring, prompt/runtime assembly |
| `services/memory-bridge/worker_common.py` | 1491 | JSON parsing, LLM client calls, split helpers, boundary refinement, scene builders, cached split loading, review policy loading, memory task fallback |
| `services/memory-bridge/worker_narrative_handlers.py` | 1226 | narrative task handlers and persistence |
| `services/memory-bridge/worker_profile_learning.py` | 1218 | profile learning logic |
| `services/memory-bridge/worker_split_orchestrator.py` | 977 | split orchestration |
| `services/memory-bridge/worker_chapter_writer.py` | 968 | chapter writing |

Ownership examples:

- `apps/studio/src/features/agents/server/agentsApiService.ts`
  - 35 exported API response functions.
  - SQL-heavy and JSON-heavy.
  - Mixes profile CRUD, visual profile, profile slots/seals, run history, metrics, coverage health, alerts, error taxonomy, prompt governance, shadow/canary/golden promotion policy, experiments, feedback, memory retrieval, context snapshots, and tuning events.
- `services/memory-bridge/worker_task_handlers.py`
  - Multiple public `process_*_task` handlers plus internal HTTP, tracing, shadow, persistence, and save helpers.
  - Dispatch ownership is not clearly separated from task implementation ownership.
- `services/memory-bridge/worker_common.py`
  - The name implies low-level shared utilities, but the module contains LLM calls, boundary algorithms, split proposal builders, scene builders, DB access helpers, and memory task fallbacks.

## Findings

### Finding 1: Large files are symptoms of boundary collapse

The main risk is not line count alone. The problematic files combine at least three of these roles:

- API response contract.
- Request/body validation.
- SQL query ownership.
- Domain policy or promotion decision.
- Workflow orchestration.
- LLM/prompt/runtime call.
- DTO mapping.
- UI state/effect ownership.
- Operator observability and tracing.

This makes changes difficult for agents because a local edit may silently affect persistence, policy, response shape, and UI expectations in the same file.

### Finding 2: Studio already has a target architecture, but it is only partially enforced

Studio has explicit budgets and a refactor direction in `apps/studio/README.md`. The `lint:line-budgets` script enforces TypeScript component/server budgets. The current hard-cap failures show the rule is valid but the repo is still in a transitional state.

### Finding 3: Python worker has no equivalent line-budget gate

The worker service has tests under `services/memory-bridge/tests/`, and compile checks are documented in `apps/studio/README.md`, but there is no visible worker line-budget gate equivalent to `apps/studio/scripts/check_line_budgets.mjs`.

Without a report-mode worker budget, future worker changes can keep expanding existing large modules without triggering review.

### Finding 4: Some architecture docs are stale relative to current size

`apps/studio/README.md` records a 2026-02-19 worker boundary cleanup as completed. The files listed there still exist, but current sizes show several are again very large. The cleanup likely improved the system at the time, but the current repo needs a second boundary pass with explicit enforcement.

### Finding 5: Recent frontend extraction is helpful but not sufficient

The `AgentGovernancePanel` component has been split into tab/view components and a hook, but follow-up cleanup is still needed:

- `apps/studio/src/features/agents/hooks/useAgentGovernancePanel.ts` is over component-like target size even though hooks are not covered by the current line-budget script.
- `AgentVisualStage.tsx` and `AgentOverviewSections.tsx` are under the hard cap but above the target.
- The larger backend owner, `agentsApiService.ts`, remains the bigger risk.

## Target Architecture

### TypeScript Studio

Keep route handlers thin and keep domain ownership inside `features/<domain>/server`.

```text
apps/studio/src/app/api/**/route.ts
  - parse params and request body
  - call one route-facing service function
  - return response

apps/studio/src/features/<domain>/server/
  <domain>ApiService.ts        route-facing orchestration only
  <domain>Service.ts           business workflow and sequencing
  <domain>Repo.ts              SQL/data access only
  <domain>Policy.ts            decisions, gates, promotion logic
  <domain>Mapper.ts            DTO and response shaping
  <domain>Validators.ts        request/body validation
  <domain>Types.ts             local server contracts

apps/studio/src/features/<domain>/components/
  <Page>Client.tsx             data wiring/container
  <Surface>View.tsx            presentational view
  hooks/use*.ts                client state/effects
  shared/types.ts              component-local contracts
  shared/mappers.ts            UI mappers
```

Rules:

- `ApiService` files must not own SQL strings directly once a repo module exists.
- `Policy` modules must not call `NextResponse`.
- `Repo` modules must not import UI or route objects.
- `Mapper` modules must be deterministic and side-effect-free.
- Components must not import from `features/*/server/*`.

### Python Memory Bridge Worker

Make `memory_bridge_worker.py` and `worker_task_handlers.py` dispatch-oriented. Move task-specific behavior into narrow modules.

```text
services/memory-bridge/
  memory_bridge_worker.py              worker loop, lifecycle, lane dispatch
  worker_task_handlers.py              registry and thin dispatch only

  worker_tasks/
    chapter_split.py
    scene_create.py
    writing_analysis.py
    writing_planning.py
    writing_prose.py
    writing_continuity.py
    writing_supervisor.py
    chapter_write_v3.py
    chapter_ledger.py
    memory_rollup.py

  worker_repos/
    ingest_task_repo.py
    source_doc_repo.py
    scene_repo.py
    agent_trace_repo.py
    prompt_hydration_repo.py
    memory_pack_repo.py
    split_result_repo.py

  worker_runtime/
    llm_client.py
    json_codec.py
    timeout_config.py
    telemetry.py
    external_projection.py

  worker_split/
    budget.py
    boundary.py
    proposal.py
    repair.py
    quality.py
    orchestration.py
```

Rules:

- `worker_task_handlers.py` should map task type to handler and normalize common failure handling.
- Task modules own one task family each.
- Repo modules own SQL and persistence contracts.
- Runtime modules own LLM, JSON parsing, timeout, telemetry, and external projections.
- Split modules own split-specific pure algorithms and split LLM orchestration.

## Issue-Ready Plan

### Master Issue

Title:

```text
[Master][OPS + BE] Reduce oversized TypeScript and worker architecture risk
```

#### Agent Mode

Purpose: Make the Studio and Memory Bridge codebase easier for agents and humans to change safely by restoring explicit module boundaries, line-budget enforcement, and reviewable ownership.

Current product vision: Novel AI should keep product behavior stable while making implementation surfaces small enough for reliable agent-driven maintenance, code review, and future feature delivery.

Epic registry:

| Epic | Area | Status | Feature count | Blocking / Blocked by |
|---|---|---|---:|---|
| Split Studio TypeScript server boundaries | BE | Planning | 3 | Blocks worker parity work only by convention |
| Split Memory Bridge worker boundaries | OPS + AI | Planning | 3 | Depends on audit approval |
| Tighten architecture gates | OPS | Planning | 2 | Should land before or alongside refactor waves |
| Reduce oversized UI containers | FE | Planning | 2 | Can run after server wave 1 |

Decision log:

| Date | Decision | Rationale | Affected epics |
|---|---|---|---|
| 2026-05-31 | Treat current report as planning artifact, not code implementation approval | User requested audit report and issue-ready plan first | All |
| 2026-05-31 | Prefer incremental boundary PRs over one repo-wide rewrite | Reduces regression risk across API, worker, DB, and UI | All |

Open questions:

- What initial hard cap should Python worker modules enforce after transition: `900`, `700`, or direct parity with Studio-style `400`?
- Should existing TypeScript legacy exemptions be burned down in this same initiative or handled as a separate cleanup track?
- Should `hooks/` receive a line-budget rule similar to `components/`?

Acceptance criteria:

- [ ] Every child issue lists exact file manifests before code starts.
- [ ] No issue combines unrelated Studio domains and worker task families in the same implementation PR.
- [ ] Each refactor wave preserves API response shapes unless a child issue explicitly approves a contract change.
- [ ] `npm run typecheck` and targeted `npx eslint <changed files>` pass for every Studio wave.
- [ ] `npm run build` passes before any Studio wave is considered complete.
- [ ] Python changed files pass `python3 -m py_compile`.
- [ ] Relevant worker tests under `services/memory-bridge/tests/` pass for worker waves.
- [ ] Architecture docs or gates are updated when ownership rules change.

#### Human Mode

Situation: The codebase is too compressed for long-term feature work. Large files are slowing safe iteration because they combine route, repo, policy, runtime, and UI concerns. The current line-budget failure is a useful signal, but the fix should be a sequence of narrow boundary extractions, not a repo-wide rewrite.

Key decisions already made:

- Keep `.agents/` as the only active agent harness layer.
- Keep Studio business logic under `apps/studio/src/features/**`.
- Keep route handlers thin.
- Use dated audit reports under `docs/operations/reports/`.

Key risks and watch points:

- SQL extraction can accidentally change row shapes, transaction boundaries, or error handling.
- Worker extraction can break task idempotency, task status transitions, or result JSON contracts.
- UI container extraction can accidentally reset state, change polling cadence, or duplicate fetches.
- Line-budget gates can become noisy if enabled before transitional files are split.

Trade-off record:

| Decision | Option chosen | Option rejected | Reason |
|---|---|---|---|
| Refactor style | Incremental boundary waves | One huge architecture PR | Easier review and rollback |
| First backend target | `agentsApiService.ts` | Scenes or analysis first | Largest non-exempt Studio hard-cap violation and already has adjacent frontend work |
| Worker gate timing | Add report-mode budget first | Immediately fail CI for Python size | Prevents churn while still making growth visible |
| Docs location | Dated report | New canonical spec | This is an audit and plan, not a permanent contract yet |

### Feature 1

Title:

```text
[Feature][BE] Split agents server API ownership
```

Implementation status: Started in this planning cycle. Wave 1 split the route-facing `agentsApiService.ts` barrel into agents server route-family modules and reduced `agentDrawerService.ts` below the server hard cap.

#### Agent Mode

Purpose: Reduce `agentsApiService.ts` from a 2755-line mixed-owner module into route-facing orchestration plus narrow repo, policy, mapper, and validator modules.

Scope:

- Preserve existing `/api/[storySlug]/agents/**` response behavior.
- Extract profile, runs/metrics, prompt governance, experiments, feedback, memory, and context/tuning ownership.
- Move SQL into repo modules.
- Move shadow/canary/golden promotion rules into policy modules.
- Keep route handler imports stable through an adapter or route-facing `agentsApiService.ts`.

Out of scope:

- No DB schema changes.
- No UI redesign.
- No prompt behavior changes beyond preserving existing validation.
- No worker task changes.

Acceptance criteria:

- [ ] Existing route handlers keep compiling without contract changes.
- [ ] `agentsApiService.ts` is below 400 lines.
- [ ] No new server file exceeds 400 lines.
- [ ] SQL lives in repo modules, not route-facing response functions.
- [ ] Promotion and rollback rules live in policy modules.
- [ ] Existing error response semantics are preserved.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Targeted `npx eslint <changed files>` passes with zero new warnings.
- [ ] `npm run lint:line-budgets` no longer reports `src/features/agents/server/agentsApiService.ts`.

File manifest:

```text
CREATE
  apps/studio/src/features/agents/server/agentProfilesApiService.ts
  apps/studio/src/features/agents/server/agentRunsApiService.ts
  apps/studio/src/features/agents/server/agentPromptGovernanceApiService.ts
  apps/studio/src/features/agents/server/agentExperimentsApiService.ts
  apps/studio/src/features/agents/server/agentFeedbackMemoryApiService.ts
  apps/studio/src/features/agents/server/agentContextApiService.ts
  apps/studio/src/features/agents/server/agentGovernanceRepo.ts
  apps/studio/src/features/agents/server/agentPromptPolicy.ts
  apps/studio/src/features/agents/server/agentGovernanceMappers.ts
  apps/studio/src/features/agents/server/agentGovernanceValidators.ts
  apps/studio/src/features/agents/server/agentGovernanceTypes.ts

MODIFY
  apps/studio/src/features/agents/server/agentsApiService.ts
    - Keep route-facing exports and delegate to extracted modules.
  apps/studio/src/features/agents/server/agentDrawerService.ts
    - Optional only if shared profile/drawer repo code becomes duplicated.

DELETE
  None.
```

Boundary definition:

```text
Owns:
  - Agents server response functions and their internal module boundaries.
  - Agents prompt governance policy extraction.
  - Agents SQL ownership extraction.

Does not own:
  - Agent UI layout.
  - Worker task execution.
  - Database schema.
  - Prompt copy or product policy changes.
```

Impact analysis:

```text
Direct impact:
  - Agents server imports and internal call graph change.
  - Route response functions should remain API-compatible.

Downstream impact:
  - Agent Governance UI relies on unchanged JSON shapes.
  - Future agent prompt experiments become safer to modify.

Risk of regression:
  - Transaction scope changes during SQL extraction.
  - Empty-state and undefined-table fallback behavior can drift.
  - Shadow promotion thresholds can change if env parsing moves incorrectly.
```

Quality gates:

```text
Build:
  - [ ] cd apps/studio && npm run typecheck
  - [ ] cd apps/studio && npm run build
  - [ ] cd apps/studio && npm run lint:line-budgets

Lint:
  - [ ] cd apps/studio && npx eslint <changed TypeScript files>

Manual:
  - [ ] Open Agent Governance page locally and verify tabs load without console errors.
  - [ ] Exercise prompt promote/canary/archive/rollback actions against a local story if DB is available.
```

Estimate:

```text
Total: 8-12 hours

  Inventory route exports and response contracts:       1 h
  Extract repo and shared types:                        2-3 h
  Extract profile/runs/metrics/context services:        2 h
  Extract prompt governance policy/actions:             2-3 h
  Verification and cleanup:                             1-2 h
```

Task breakdown:

1. `[Task][BE] Inventory agents API exports and response contracts`
2. `[Task][BE] Extract agents governance repository and types`
3. `[Task][BE] Extract agents profile and run response modules`
4. `[Task][BE] Extract prompt governance policy and actions`
5. `[Task][BE] Verify agents API behavior and line budgets`

Dependencies:

```text
Blocked by:  Approval of this audit plan.
Blocks:      UI governance cleanup and prompt governance feature work.
Related:     AgentGovernancePanel frontend extraction.
```

#### Human Mode

Situation: `agentsApiService.ts` is the most severe non-exempt Studio hard-cap violation and mixes many independent agents surfaces. Splitting it first gives immediate safety benefit for the same area recently touched on the frontend.

Approach and reasoning: Keep a compatibility adapter so route handlers do not all change at once. Extract SQL and policy first, then response families. This preserves behavior while making future changes smaller.

What a reviewer should focus on:

- JSON response compatibility.
- SQL parameter order and transaction scope.
- Env-driven policy defaults.
- Error handling for missing optional governance tables.

Known unknowns:

- Whether any route handlers import non-exported helpers indirectly through test or dev scripts.
- Whether local DB has enough agents data for manual governance verification.

Follow-up issues:

- Split `agentDrawerService.ts` if it remains over 400 after shared repo extraction.
- Add focused tests or doctor script for prompt governance actions.

### Feature 2

Title:

```text
[Feature][OPS + AI] Split Memory Bridge task dispatch from task implementations
```

Implementation status: Started in this planning cycle. Wave 1 extracted writing and memory-rollup task handlers into `services/memory-bridge/worker_tasks/writing_dispatch.py` while keeping `worker_task_handlers.py` exports compatible.

#### Agent Mode

Purpose: Reduce worker task risk by making `worker_task_handlers.py` a task registry and dispatch adapter, with task-specific behavior owned by dedicated modules.

Scope:

- Extract handler families from `worker_task_handlers.py`.
- Preserve task type names, task status transitions, result JSON shapes, and idempotency behavior.
- Keep `memory_bridge_worker.py` import contract stable during the first wave.
- Move external projection, tracing, and save helpers to runtime/repo modules where appropriate.

Out of scope:

- No DB schema changes.
- No task type renames.
- No prompt rewrites.
- No LLM provider behavior changes.
- No migration from sync worker loop to async runtime.

Acceptance criteria:

- [ ] `worker_task_handlers.py` is below 500 lines after wave 1 or has a documented transitional exemption with remaining task families listed.
- [ ] Each extracted task module owns one task family or closely related stage family.
- [ ] Task result JSON shapes remain backward compatible.
- [ ] Failure handling and task status updates remain equivalent.
- [ ] `python3 -m py_compile` passes for changed worker files.
- [ ] Targeted tests under `services/memory-bridge/tests/` pass for split and writing flows.
- [ ] Import cycles are avoided.

File manifest:

```text
CREATE
  services/memory-bridge/worker_tasks/__init__.py
  services/memory-bridge/worker_tasks/chapter_split.py
  services/memory-bridge/worker_tasks/scene_create.py
  services/memory-bridge/worker_tasks/writing_analysis.py
  services/memory-bridge/worker_tasks/writing_pipeline_stages.py
  services/memory-bridge/worker_tasks/chapter_write_v3.py
  services/memory-bridge/worker_tasks/chapter_ledger.py
  services/memory-bridge/worker_tasks/memory_rollup.py
  services/memory-bridge/worker_runtime/external_projection.py
  services/memory-bridge/worker_runtime/task_result.py

MODIFY
  services/memory-bridge/worker_task_handlers.py
    - Replace large handler bodies with imports and dispatch exports.
  services/memory-bridge/memory_bridge_worker.py
    - Only if import names need compatibility adjustment.

DELETE
  None.
```

Boundary definition:

```text
Owns:
  - Task dispatch and worker handler module boundaries.
  - Task implementation extraction with behavior preservation.

Does not own:
  - Database schema.
  - Prompt copy.
  - Split algorithm redesign.
  - Worker deployment/runtime process model.
```

Impact analysis:

```text
Direct impact:
  - Worker imports change.
  - Task handler call graph changes.

Downstream impact:
  - Ingest, writing analysis, chapter writing, ledger, and memory rollup tasks depend on equivalent outputs.

Risk of regression:
  - Circular imports from shared helpers.
  - Missed monkeypatch paths in tests.
  - Divergent task failure status behavior.
  - Result JSON compatibility drift.
```

Quality gates:

```text
Compile:
  - [ ] cd /home/danh/novel-ai && python3 -m py_compile services/memory-bridge/worker_task_handlers.py services/memory-bridge/worker_tasks/*.py services/memory-bridge/worker_runtime/*.py

Tests:
  - [ ] cd /home/danh/novel-ai && python3 -m pytest services/memory-bridge/tests/test_outline_coverage_and_failure_trace.py
  - [ ] cd /home/danh/novel-ai && python3 -m pytest services/memory-bridge/tests/test_writing_analysis_vetting.py
  - [ ] cd /home/danh/novel-ai && python3 -m pytest services/memory-bridge/tests/test_memory_rollup_flags.py
```

Estimate:

```text
Total: 10-16 hours

  Handler inventory and task map:                 1-2 h
  Extract split and scene task modules:           3-4 h
  Extract writing stage task modules:             3-5 h
  Extract chapter v3, ledger, rollup modules:     2-3 h
  Compile/test/import cleanup:                    1-2 h
```

Task breakdown:

1. `[Task][OPS] Inventory worker task handler imports, monkeypatches, and result contracts`
2. `[Task][OPS + AI] Extract chapter split and scene task handlers`
3. `[Task][OPS + AI] Extract writing analysis and writing stage handlers`
4. `[Task][OPS + AI] Extract chapter write v3, ledger, and rollup handlers`
5. `[Task][OPS] Verify worker dispatch compatibility`

Dependencies:

```text
Blocked by:  Approval of Python worker module budget decision.
Blocks:      Worker runtime and split algorithm cleanup.
Related:     docs/architecture/writing-pipeline-canonical-map.md
```

#### Human Mode

Situation: `worker_task_handlers.py` currently acts as both the registry and several task implementations. That makes worker changes hard to review because a small task edit shares a file with unrelated task families.

Approach and reasoning: Keep function names import-compatible at first, but move bodies into task modules. This makes the first PR mostly mechanical and reduces behavior risk.

What a reviewer should focus on:

- Task status transitions.
- Result JSON shape compatibility.
- Test monkeypatch paths.
- Import cycles and runtime import cost.

Known unknowns:

- Whether external scripts import handler functions directly.
- Whether tests rely on monkeypatching functions by old module path.

Follow-up issues:

- Split `worker_ingest_repo.py` into repo modules.
- Split `worker_common.py` into runtime, JSON, LLM, split, and scene-builder modules.

### Feature 3

Title:

```text
[Feature][OPS] Add worker architecture budget audit in report mode
```

Implementation status: Implemented in this planning cycle with `services/memory-bridge/scripts/check_worker_line_budgets.py`.

#### Agent Mode

Purpose: Make Python worker module size visible before enforcing hard failures.

Scope:

- Add a worker line-budget script in report mode.
- Report files over target and provisional hard cap.
- Do not fail CI by default until initial worker split waves land.
- Document how to run the worker budget audit.

Out of scope:

- No automatic formatting.
- No worker code movement.
- No CI hard failure until separately approved.

Acceptance criteria:

- [ ] A script reports worker Python files over target and hard cap.
- [ ] Script defaults to report-only mode.
- [ ] Script can be made failing with an explicit flag such as `--fail-on-hard-cap`.
- [ ] Report output lists line count, target, cap, and relative path.
- [ ] Documentation names the command and enforcement plan.

File manifest:

```text
CREATE
  services/memory-bridge/scripts/check_worker_line_budgets.py

MODIFY
  apps/studio/README.md
    - Add worker budget audit command under verification or reorg notes.
  docs/operations/reports/20260531_codebase-architecture-audit.md
    - Mark this feature complete if implemented in the same planning cycle.

DELETE
  None.
```

Boundary definition:

```text
Owns:
  - Worker size visibility and report-mode enforcement.

Does not own:
  - Studio TypeScript line budgets.
  - Worker module extraction.
  - CI policy changes unless separately approved.
```

Quality gates:

```text
Script:
  - [ ] cd /home/danh/novel-ai && python3 services/memory-bridge/scripts/check_worker_line_budgets.py
  - [ ] cd /home/danh/novel-ai && python3 services/memory-bridge/scripts/check_worker_line_budgets.py --fail-on-hard-cap exits non-zero when current oversized files remain

Compile:
  - [ ] cd /home/danh/novel-ai && python3 -m py_compile services/memory-bridge/scripts/check_worker_line_budgets.py
```

Estimate:

```text
Total: 2-3 hours

  Script implementation:       1-1.5 h
  Documentation update:        0.5 h
  Verification:                0.5-1 h
```

Dependencies:

```text
Blocked by:  Decision on provisional worker target and cap.
Blocks:      Worker boundary cleanup tracking.
Related:     apps/studio/scripts/check_line_budgets.mjs
```

#### Human Mode

Situation: Studio has line-budget visibility, but the Python worker does not. A report-only script gives reviewers the same signal without blocking work before the first cleanup wave.

Approach and reasoning: Start with a non-failing audit, then flip to failure mode when the largest worker files are split. This avoids blocking urgent work while creating pressure against further growth.

Trade-off record:

| Decision | Option chosen | Option rejected | Reason |
|---|---|---|---|
| Enforcement | Report-only first | Immediate hard failure | Current worker files already exceed any reasonable cap |
| Location | `services/memory-bridge/scripts/` | Repo root script | Keeps worker tooling near worker code |

### Feature 4

Title:

```text
[Feature][FE] Finish Agent Governance frontend size cleanup
```

Implementation status: Started in this planning cycle. Wave 1 split `AgentVisualStage`, `AgentOverviewSections`, and extracted `useAgentGovernanceActions` from the main hook while preserving the panel model contract.

#### Agent Mode

Purpose: Complete the frontend extraction started in Agent Governance so hooks and large tab views are closer to repo targets.

Scope:

- Split `useAgentGovernancePanel.ts` into smaller hooks or actions modules.
- Split `AgentVisualStage.tsx` and `AgentOverviewSections.tsx` into subcomponents if doing so reduces complexity without changing UI.
- Preserve existing tab behavior, polling, modal actions, and view state.

Out of scope:

- No UI redesign.
- No API contract changes.
- No backend refactor.

Acceptance criteria:

- [ ] `AgentVisualStage.tsx` is below 300 lines or has a documented reason for remaining over target.
- [ ] `AgentOverviewSections.tsx` is below 300 lines or has a documented reason for remaining over target.
- [ ] `useAgentGovernancePanel.ts` is split into fetch/action/state modules with clear ownership.
- [ ] Agent Governance UI behavior is unchanged.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Targeted `npx eslint <changed files>` passes with zero new warnings.

File manifest:

```text
CREATE
  apps/studio/src/features/agents/hooks/useAgentGovernanceData.ts
  apps/studio/src/features/agents/hooks/useAgentGovernanceActions.ts
  apps/studio/src/features/agents/hooks/useAgentGovernanceUiState.ts
  apps/studio/src/features/agents/components/AgentVisualStageHeader.tsx
  apps/studio/src/features/agents/components/AgentVisualStageSlots.tsx
  apps/studio/src/features/agents/components/AgentOverviewMetrics.tsx
  apps/studio/src/features/agents/components/AgentOverviewAlerts.tsx

MODIFY
  apps/studio/src/features/agents/hooks/useAgentGovernancePanel.ts
  apps/studio/src/features/agents/components/AgentVisualStage.tsx
  apps/studio/src/features/agents/components/AgentOverviewSections.tsx
  apps/studio/src/features/agents/components/AgentGovernancePanel.tsx

DELETE
  None.
```

Quality gates:

```text
Build:
  - [ ] cd apps/studio && npm run typecheck
  - [ ] cd apps/studio && npm run build

Lint:
  - [ ] cd apps/studio && npx eslint <changed Agent Governance frontend files>
  - [ ] cd apps/studio && npm run lint:line-budgets
```

Estimate:

```text
Total: 4-6 hours

  Hook split:                 2-3 h
  Visual/overview split:      1.5-2 h
  Verification:               0.5-1 h
```

Dependencies:

```text
Blocked by:  None.
Blocks:      None.
Related:     Feature 1 agents server split.
```

#### Human Mode

Situation: The frontend panel was improved but still has extracted files over target and one large hook. This is lower risk than backend splitting but should not be called complete yet.

Approach and reasoning: Split by ownership rather than visual fragments: data fetching, actions, UI state, visual profile header/slots, metrics, and alerts.

What a reviewer should focus on:

- Avoid duplicate fetches.
- Preserve action busy states and error state.
- Ensure modal behavior does not reset after hook split.

## Recommended Execution Order

1. Approve this report as the planning baseline.
2. Create or update one master tracking issue from the Master Issue section.
3. Land Feature 3 first if the team wants worker budget visibility before code movement.
4. Land Feature 1 next because it is the largest non-exempt Studio hard-cap violation in the already active agents surface.
5. Land Feature 2 after worker budget target/cap is approved.
6. Land Feature 4 when the Agent Governance UI needs another cleanup pass or before new UI work in that surface.

## Decisions Needed Before Coding

1. Python worker budget:
   - Recommendation: start report-only with target `500`, provisional hard cap `900`, then lower after split waves.
   - Risk if wrong: too strict blocks work; too loose allows continued file growth.
2. TypeScript legacy exemptions:
   - Recommendation: do not burn down all legacy exemptions in this initiative. Track them separately after the non-exempt hard failures are resolved.
   - Risk if wrong: cleanup scope becomes too broad and hard to review.
3. Agents backend first:
   - Recommendation: start with `agentsApiService.ts`.
   - Risk if wrong: scenes or analysis may be more product-critical, but agents is currently the clearest large-file owner with recent adjacent UI work.

## Rollback Notes

- Documentation-only report changes can be reverted without runtime impact.
- TypeScript extraction rollback should restore route-facing exports and response functions to the prior module shape.
- Worker extraction rollback should restore old import paths and handler bodies; no DB rollback should be required if behavior remains contract-preserving.
- Budget-script rollback should disable enforcement first, then remove script/docs only if it becomes noisy or misleading.

## Verification Run For This Report

Commands used while preparing this report:

```bash
cd /home/danh/novel-ai/apps/studio && npm run lint:line-budgets
cd /home/danh/novel-ai && find apps/studio/src/features -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | sort -nr | head -25
cd /home/danh/novel-ai && find services/memory-bridge -maxdepth 1 -type f -name '*.py' -print | xargs wc -l | sort -nr | head -25
```

Known result:

- `npm run lint:line-budgets` currently fails due existing hard-cap violations.
- This report intentionally does not change application code or worker code.
