# novel-ai — Investigation Report V1 (Stage 1: Claude Investigation)

> **Purpose of this document.** This is the Stage-1 investigation output in the
> multi-model workflow: Claude investigates → **GPT challenges (you are here next)**
> → Claude revises (V2) → Codex implements. This report is written to be
> *challenged*, not approved. Every material claim carries a `file:line` anchor and a
> confidence tag. Attack the assumptions, find the missing edge cases, refute the
> root-cause where it's weak.
>
> - **Repo:** `novel-ai` @ WSL `Ubuntu-24.04-D:/home/danh/novel-ai`
> - **Branch investigated:** `feature/ui-kit-shadcn-foundation` (dirty — uncommitted shadcn/chat-first WIP + Gemini provider WIP)
> - **Method:** 4 parallel read-only subagents (frontend/write-pipeline, python worker, data/knowledge layer, LLM/agents/security) + synthesis. No code changed.
> - **Scale:** 852 tracked files, ~100k LOC (369 `.ts`, 143 `.tsx`, 93 `.py`, 83 `.md`).

---

## TL;DR — the five findings that matter most

1. **The knowledge layer is a facade.** The product is marketed as a knowledge-graph + vector-memory writing studio (Neo4j 5, Qdrant 1.13), but in the *actual running pipeline* neither is populated. The Neo4j projection helper `_sync_neo4j_projection` is defined but **never called**; **nothing writes points to Qdrant**. The retrieval/context builder reads a graph and a vector collection that are effectively empty, and silently degrades. Real similarity search is in-Postgres cosine over `agent_memory_vector.embedding_json`. **This reframes the whole roadmap.** (confidence: high)
2. **Three parallel autowrite engines + two API namespaces.** Canonical queue path (`CHAPTER_WRITE_V3`), legacy in-Node `NARRATIVE_*` (retired-by-default), and an in-process critic/judge loop (`autowriteRunService.ts`) all coexist; `/api/stories/[slug]/*` and `/api/[storySlug]/*` both exist. Guards/fixes applied to one path silently miss the others. (high)
3. **Provider config split-brain.** The runtime provider file (what the UI selector writes) governs the health check and *some* routes; the real generation paths (muse, pipeline draft stream, Python worker) read raw `process.env` / `LLM_API_BASE`. Switching provider in the UI does not necessarily switch what actually generates. (high)
4. **No auth on 152 API routes + an SSRF/provider-hijack hole.** No `middleware.ts`, no session/auth anywhere. `PUT /api/llm/provider` lets any caller set an arbitrary `baseUrl`+`apiKey`; `POST` then makes the server `fetch` it with a Bearer token. Safe *only* under the localhost/single-user assumption. (high)
5. **Worker reliability gaps.** The main `ingest_task` queue has **no retry/backoff/dead-letter** (terminal on first failure) while the memory/janitor queues do; LLM calls **fail open** (silent `{}`/`""` committed as success); the global cool-off holds a DB row lock across `sleep`. A transient LLM 5xx permanently fails a chapter with no auto-recovery. (high)

---

## P2 — Architecture

### System shape

```
┌────────────────────────────── apps/studio (Next.js 16 / React 19 / TS / Tailwind 4) ──────────────────────────────┐
│  UI: shelf · stories · write tab (NovelLabWorkspace) · reviews · memory · map · agents                            │
│  API: 152 route.ts (NO auth, NO middleware)                                                                       │
│  server services: scenesApiService · writingPipelineService · autowriteRunService · llmProviderRuntime · guard    │
└───────────────┬───────────────────────────────┬──────────────────────────────────────┬──────────────────────────┘
                │ enqueue = INSERT ingest_task    │ spawns child_process                 │ HTTP /chat/completions
                ▼                                 ▼                                       ▼
        ┌───────────────┐              ┌───────────────────────┐                 ┌──────────────────┐
        │ PostgreSQL 15 │◄─────────────│ services/memory-bridge│                 │ LLM endpoint     │
        │ (SOURCE OF    │  poll+claim  │ (Python 3.12 worker)  │───HTTP────┐     │ OpenAI-compatible│
        │  TRUTH, ~90   │  SKIP LOCKED │ lanes: all/split/     │           │     │ local/groq/gemini│
        │  tables)      │              │ analysis/writing      │           │     └──────────────────┘
        └───────┬───────┘              └───────────────────────┘           │
                │ embedding_json (in-PG cosine = the REAL vector search)   │ HTTP (gated OFF by default,
                │                                                          ▼  and projection call is UNWIRED)
                │                                        ┌─────────────────────────────────┐
                │                                        │ infra/historian_mcp_bridge.py    │
                │                                        │ :8090  → Neo4j (empty) / Qdrant  │
                │                                        │         (collections, no points) │
                └────────────────────────────────────────┴─────────────────────────────────┘
```

### The 3 core layers (README's own framing, verified)

| Layer | Path | Stack | Role |
|---|---|---|---|
| UI + API | `apps/studio` | Next 16, React 19, TS, Tailwind 4 | shelf, stories, ingest, write, reviews, memory, analysis, map, agents |
| Worker/pipeline | `services/memory-bridge` | Python 3.12, psycopg2 | task queue, ingest, split, memory enrich, writing analysis, chapter workflow |
| Schema | `db/migrations` | PostgreSQL 15 | ~90-table baseline + governance |

### Key architectural facts (evidence)

- **FE→worker channel is the Postgres `ingest_task` table, not HTTP/Redis.** Enqueue = `INSERT ingest_job/ingest_task` (`writingPipelineService.ts:113-176`); worker claims via `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` (`worker_ingest_repo.py:385-480`). (high)
- **The Python worker is a child process spawned by the Node server**, bound to `127.0.0.1` (`ingest/server/workerControl.ts`, spawn ~`:410`, health probe ~`:113`). Worker liveness is coupled to the web process; single-host by design. (high)
- **Concurrency = one worker process per *lane*** (`all|split|analysis|writing`) enforced by an `fcntl.flock` file lock (`memory_bridge_worker.py:116-129`). No intra-lane parallelism. (high)
- **Neo4j/Qdrant are reached only through `historian_mcp_bridge.py` over HTTP**, gated by `HISTORIAN_NEO4J_ENABLED`/`HISTORIAN_QDRANT_ENABLED` (**default off**) — `worker_task_handlers.py:95-137`. (high)
- **No global state library in the FE** — React `useState` + a single `StoryContext`; all durable state is server/DB, fetched `cache:"no-store"`. (high)

---

## P3 — Feature by feature

### 3.1 Chapter write pipeline (the product's core loop)
**Flow:** chat intent (`intentRouter.ts:40-52`, regex classifier) → `/write chapter` opens the imperative **`AutoWriteWizard`** modal (989 lines) → `POST /chapters/{id}/plan` (`scenesApiService.ts:621` `postChapterAutoWriteResponse`, canon-conflict gate at `:633-696`) → on accept `enqueueCanonicalChapterWriteV3` (`:698`) inserts the task → worker runs stylist→critic→refine for `CHAPTER_WRITE_V3` (`worker_tasks/writing_dispatch.py:238`) → FE **polls** `/auto-write/status` every 2s up to 600× / 20 min (`AutoWriteWizard.tsx:176-197`) → stage via `/chapters/{id}/stage` + `/resplit`.
- **"Chat-first" is a router/confirmation veneer over an imperative wizard**, not a streaming agent. (med–high)
- Legacy scene-level FSM still present: `DRAFTING→DRAFTED→EVALUATED→REVISED→LOCKED` (`stateMachine.ts:1-11`). (high)
- **Three autowrite implementations coexist** (see TL;DR #2): queue `CHAPTER_WRITE_V3`; legacy `NARRATIVE_*`/`DEEP_NARRATIVE_V2` (`chapterWriting.ts:62`, `narrativeWorkerService.ts:9-10`, retired unless `NARRATIVE_LEGACY_DISPATCH_ENABLED=1`); in-process critic/judge (`autowriteRunService.ts`). (high)

### 3.2 Ingest + split
- `CHAPTER_INGEST` (`worker_ingest_handler.py:83`) normalizes raw text, bumps `source_doc.version+1`, sets `is_stable=false`; fan-in flips job → `AWAITING_DATA_APPROVAL`. **Not idempotent** — a requeue double-bumps version (`:109`). (high)
- `CHAPTER_SPLIT_LLM` (`worker_task_handlers.py:629`) is the *well-engineered* part: idempotency key + split-result cache, splitter/critic/supervisor agents (`worker_split_*`, ~5k LOC). (high)

### 3.3 Memory / knowledge / retrieval  ← **the facade (TL;DR #1)**
- Intended: canon facts (`canon_fact`, subject/predicate/object triples, `000_baseline_20260502.sql:899`) → projected to Neo4j `:Entity` graph → retrieved by `guard/server/storyContextBuilder.ts:805,849`.
- Reality: `_sync_neo4j_projection` (`worker_task_handlers.py:109`) is **never invoked** (grep across `services/`,`apps/`,`scripts/` = definition only). **No `points/upsert` writer for Qdrant anywhere.** The bridge *searches* `narrative_swas_memory` (`historian_mcp_bridge.py:129-158`) that has no producer. (high)
- The actual vector memory = `agent_memory_vector.embedding_json` in Postgres + in-process `cosine_similarity` (`worker_narrative_handlers.py:79-196`). Embeddings live in PG, not Qdrant. (high)
- Two conflicting Neo4j schemas: `init_historian_db.py:34-38` creates `:Character`/`:Location` constraints that the bridge (`:Entity`) never uses. (high)

### 3.4 Reviews / continuity (Authoring Core V3)
- `reviews/server/reviewV3Service.ts` reads `chapter_continuity_issue`, can auto-patch (`applyChapterPatch`, marker append/replace — explicitly "Phase 8 MVP", `:44-45`), promotes ledger facts → `story_canon_fact` after review. **No output sanitization before patches touch drafts.** (high)

### 3.5 Agent governance
- Prompt lifecycle `global|story|chapter`, CANARY→ACTIVE promotion with statistical gates (≥20 samples; failure-rate delta 0.02, meta-leak 0.01, golden-set 0.01) — `agentPromptPolicy.ts:5-29`. XP leveling `floor(sqrt(xp/1000))+1` (`agentGovernanceServerUtils.ts:22-26`). **Zero tests on any of these thresholds.** (high)

### 3.6 Guard (canon injection)
- `canonGuard.ts` builds a token-budgeted context block (8192, crude `length/4` estimate, `:44-47,90`) from `storyContextBuilder.ts` (1102 LOC). Entity locks are *advisory prompt text*, not enforced. Feeds the empty graph problem in 3.3. (high)

### 3.7 Chat-first UI shell (WIP on this branch)
- shadcn kit = **foundation only** (16 primitives, "no behavior change", commit `6b7ef39`). `AssistantDock` is **read/resume only**, global composer deferred to "phase 4" (commit `fca0682`). `CommandPalette` fires a bare `window.dispatchEvent(new Event("novel:open-story-picker"))` (`:140`). `/split` command stubbed (`CommandWorkStream.tsx:185-190`). (high)

---

## P4 — Cross-cutting concerns

| Concern | State | Evidence |
|---|---|---|
| **Auth / access control** | **None.** 152 `route.ts`, no `middleware.ts`, no session. | repo-wide grep negative |
| **SSRF / provider hijack** | `PUT /api/llm/provider` accepts arbitrary `baseUrl`+`apiKey` (validation = `^https?://` only); `POST` server-fetches it with Bearer. | `llmProviderProfiles.ts:123-130`, `llmProviderRuntime.ts:151-163` |
| **Secrets** | Clean in source (placeholders, `0o600` runtime file, redacted logs) **except** hardcoded DB passwords in compose (`novelpass`, `novelgraphpass`). | `infra/docker-compose.yml:7,23,64` |
| **Provider config** | Split-brain: runtime file vs raw env in generation paths. | `api/muse/_shared.ts:288-291`, `upstreamClient.ts:38` |
| **LLM failure mode** | Fail-open: `call_llm_json/_text` return `{}`/`""` on error unless `raise_on_error=True`. | `worker_common.py:379-410,466-474` |
| **Rate limiting** | Global cool-off holds a `system_heartbeat` `FOR UPDATE` lock across `sleep`; fails open. Serializes ALL LLM work. | `worker_common.py:293-326`; FE mirror `api/muse/_shared.ts:247-277` |
| **Job/queue reliability** | Main `ingest_task`: no retry/backoff/dead-letter; stale recovery = mark FAILED (not requeue). memory/janitor queues DO have backoff. | `worker_ingest_repo.py:711-745,112-127,1751-1753` |
| **Data consistency** | Inline-DONE writing handlers skip `refresh_job_status` → jobs stranded `RUNNING`; inline updates bypass optimistic `attempts` lock. | `writing_dispatch.py:34-44,128-138,168-180,226-236` |
| **Referential integrity** | `chapter_id` is `text` soft-key everywhere, **no FK** to `story_chapter`. | `000_baseline_20260502.sql:2617` + FK sweep |
| **Migrations** | `schema_migration` table exists but **never used**; every non-baseline `.sql` re-applied on each boot; safe only while idempotent; lexical-sort fragility (`100_` would precede `20260508_`). | `infra/docker-compose.yml:99-113` |
| **Testing** | 8 unit tests (none on provider/governance/guard/reviews), 11 Playwright specs incl. 2 real-LLM. | `apps/studio/e2e/tests/*` |
| **CI** | Only `split-guardrail.yml` on PRs to main. **No lint/typecheck/unit/e2e in CI.** | `.github/workflows/split-guardrail.yml` |
| **Observability** | No structured logging (ad-hoc `console.*`); Grafana = SQL panels only; no metrics/tracing/alerting. | `docs/operations/observability/*.sql` |
| **Scaling** | Single-host: worker = child of web process on 127.0.0.1; DB-polled single-writer-per-lane; global LLM serialization. | `workerControl.ts`, `memory_bridge_worker.py` |

### Confirmed / latent bugs
- **`mark_task_done` arity mismatch** — `process_chapter_task` calls it with 3 args, needs 4 (`worker_task_handlers.py:985` vs `worker_ingest_repo.py:675`). TypeError on the legacy `unit_type=='chapter'` fallback. (high — latent, legacy path only)
- **Hardcoded UI state** — `readiness` constant `"degraded"` (`NovelLabWorkspace.tsx:286`); literal `"Worker Idle"`/`"Draft Saved"` (`AppShell.tsx:119-120`); dead conflicts section (`statusService.ts:231` returns `conflicts:[]`). Misleads users mid-write. (high)
- **`handleAutoWriteComplete` incomplete** — `// To be implemented in Step 5` (`useWriteTabState.ts:257-267`). (high)
- **Client poll has no AbortController/unmount guard** — 20-min poll abandoned on navigation. (med)

---

## P5 — Technical debt & risk register (prioritized)

| # | Item | Type | Severity | Why it matters |
|---|---|---|---|---|
| R1 | Neo4j projection unwired + Qdrant never written | Correctness/architecture | **Critical** | The advertised knowledge/retrieval capability doesn't run; context builder reads empty stores → silently worse writing. Root cause candidate. |
| R2 | No auth + SSRF via `PUT /api/llm/provider` | Security | **Critical if exposed** | Data exfiltration + SSRF the moment it leaves localhost. |
| R3 | Main queue no retry/dead-letter + LLM fail-open | Reliability | **High** | Transient 5xx permanently fails a chapter; empty results committed as success. |
| R4 | Three autowrite paths + dual API namespaces | Maintainability | **High** | Guards/fixes miss paths; canon gate exists on one path only. |
| R5 | Provider config split-brain | Correctness | **High** | UI selection ≠ what generates; confusing + wrong-provider risk. |
| R6 | No CI quality gate (lint/type/test/e2e) | Process | **High** | Regressions land unblocked; the untested high-logic files are exactly the fragile ones. |
| R7 | Job-status stranded-RUNNING (skip `refresh_job_status`) | Reliability | Med | Jobs never reach DONE; UI polls forever. |
| R8 | Migration ledger vestigial + re-apply-every-boot | Data safety | Med | One non-idempotent migration corrupts on 2nd boot. |
| R9 | `chapter_id` soft-key, no FK | Data integrity | Med | Orphaned scenes/facts/ledgers, no DB guard. |
| R10 | Cool-off holds DB lock across sleep | Scalability | Med | Serializes LLM + connection contention. |
| R11 | Oversized god-files (`worker_*` 1.9–2.1k LOC, `AutoWriteWizard` 989, `storyContextBuilder` 1102) | Maintainability | Med | Own eslint-disables + a `check_worker_line_budgets.py` script admit it. |
| R12 | `CHAPTER_INGEST` not idempotent | Correctness | Med | Requeue double-bumps version. |
| R13 | Hardcoded/fake UI status | UX/trust | Med | Users can't tell if work is saved / safe to write. |
| R14 | No structured logging/metrics/alerting | Observability | Med | Silent degradation (esp. R1/R3) is invisible. |

---

## P6 — Master roadmap (proposed) + priority + ambiguous questions

### Suggested sequencing (each block is independently shippable; challenge the ordering)

**Sprint 0 — decide the product truth (blocks everything).** Resolve the single question that reframes the roadmap: *is novel-ai a knowledge-graph writing studio, or a Postgres-cosine writing studio that ships dormant Neo4j/Qdrant?* (see Q1). The answer decides whether R1 is "wire it up" or "delete the dead weight."

**Sprint 1 — safety net before change.** R6 CI gate (lint+typecheck+existing unit+smoke e2e) → so subsequent refactors are verifiable. Add tests to the untested high-logic files (provider layer, `agentPromptPolicy`). *Rigor: Standard→Production for anything touching generation.*

**Sprint 2 — reliability core.** R3 (retry/backoff/dead-letter on main queue + make LLM calls `raise_on_error` by default) + R7 (route inline-DONE handlers through `mark_task_*`) + R12 idempotent ingest.

**Sprint 3 — knowledge layer decision executed.** Either wire `_sync_neo4j_projection` + add a Qdrant producer + backfill/reconcile job (R1 "build"), or remove Neo4j/Qdrant from compose + docs and commit to PG-cosine (R1 "cut"). Fix the retrieval builder to fail loudly when its store is empty.

**Sprint 4 — consolidation.** R4 collapse to one autowrite path + one API namespace; R5 unify provider resolution (single source of truth read by muse/pipeline/worker).

**Sprint 5 — hardening / polish.** R2 auth+host-allowlist (if deployment scope expands), R8 migration ledger, R9 FK, R13 wire real UI status, R14 structured logging, finish the chat-first shell (global composer, un-stub `/split`).

### Ambiguous questions for the reviewer (GPT) — these gate the plan

1. **Product truth (highest):** Is the Neo4j+Qdrant knowledge layer a *not-yet-wired* feature or *abandoned*? The runbook `docs/operations/runbooks/historian-neo4j-projection-runbook.md` describes a live flow the code doesn't invoke. Build or cut?
2. **Deployment scope:** Single trusted localhost forever, or multi-user/hosted? This flips R2 (auth/SSRF) from "note" to "shipping blocker" and R-scaling from "fine" to "rearchitect."
3. **Which autowrite path is canonical** and are the other two dead code to delete (R4)? Is `autowriteRunService.ts` reachable in prod?
4. **Provider source of truth at generation time** — runtime file or env? Intended to diverge (R5)?
5. **Main-queue retry** — is terminal-on-failure intentional (app/UI re-enqueues), or a gap (R3)? Where is the max-attempts guard, if any?
6. **Worker launch in standard deploy** — it's absent from `docker-compose.yml`; is projection meant to run at all in the shipped stack?
7. **Chat-first shell endgame:** will the global composer *replace* `AutoWriteWizard` (989 LOC to delete) or *wrap* it? Determines whether that's debt or foundation.

### Confidence & known blind spots
- **High** on structural facts, the R1 facade, worker queue mechanics, security absence — all grep/read-verified across `apps/`,`services/`,`scripts/`,`infra/`.
- **Medium** on *runtime* impact of latent bugs (R7, arity bug) — depends on which job graphs/legacy paths actually execute in production; not verified at runtime.
- **Not done:** no runtime execution/repro; no reading of all 90 tables or all 152 routes (sampled); the retired `NARRATIVE_*` internals skimmed only. Assumed `apps/studio` is the sole enqueuer and the deployed worker is `services/memory-bridge` (it's absent from compose — see Q6).

---

*Hand-off: give this to GPT with the instruction "Review as a Staff Engineer — find wrong assumptions, missing edge cases, over/under-engineering, and refute the root-cause (R1) if you can." Then bring its challenges back for the V2 revision.*
