# Novel AI System Architecture

Status: Approved baseline

Last verified: 2026-09-13

## 1. Purpose

Novel AI helps an author continue a long-form story from creative direction,
rough prose, plot progression, or approximate recollection. The system carries
the operational burden of source recall, continuity context, prose generation,
revision history, and story-universe maintenance without requiring the author
to remember every detail or operate an AI pipeline manually.

This document is the umbrella architecture contract. It defines the required
runtime, ownership boundaries, canonical workflow, data authority, dependency
rules, and delivery gates. Detailed contracts under `docs/architecture/` remain
authoritative within their named surface and must not contradict this baseline.

## 2. Architecture decisions

The approved baseline is a modular monolith in one repository:

- Next.js Studio owns author interaction, HTTP APIs, validation, orchestration,
  task enqueue/status, and artifact presentation.
- PostgreSQL is the durable system of record and task queue.
- The Python memory-bridge worker owns long-running ingest projections,
  AI-writing execution, ledger extraction, continuity checks, and memory
  rollups.
- PostgreSQL full-text search is the required local recall baseline.
- LLM providers, Qdrant, Neo4j, and the Historian bridge are replaceable,
  optional adapters. Their failure must not remove source data or make the
  manuscript unavailable for reading and editing.
- AI output remains draft-only until the author explicitly approves the
  applicable revision.

Do not split these boundaries into independent microservices without a new
approved decision record and observed scaling or ownership need.

## 3. Product invariants

1. Original imported source is immutable and traceable by hash.
2. Base source import makes zero external LLM or embedding-provider calls.
3. The whole manuscript is never placed in a generation prompt.
4. Retrieval context is bounded, source-backed, and explicit about uncertainty.
5. The author's creative direction reaches planning and writing unchanged.
6. Generated or edited drafts do not become accepted story truth implicitly.
7. Every delayed result remains scoped to its original story, chapter, and
   revision after navigation or retry.
8. Optional provider failure does not invalidate durable PostgreSQL truth.
9. A completed run references a real result; cancellation and failure are never
   reported as success.
10. Earlier source and revisions remain recoverable after AI work or human edits.

## 4. Runtime topology

```text
Author
  -> Novel Studio (Next.js UI + API + orchestration)
      -> PostgreSQL
          - immutable source and searchable passages
          - story universe and continuity state
          - drafts, revisions, approvals and run history
          - ingest_job / ingest_task durable queue
      -> synchronous local recall (PostgreSQL FTS)
      -> Python memory-bridge worker
          - deterministic source projections
          - CHAPTER_WRITE_V3
          - CHAPTER_LEDGER_EXTRACT
          - MEMORY_ROLLUP_V3
          -> optional OpenAI-compatible LLM adapter
              - local model
              - Gemini
              - Groq / 9Router / custom provider
          -> optional Historian adapters
              - Qdrant semantic retrieval
              - Neo4j relationship lineage
```

Required local runtime:

| Runtime | Role | Required for |
|---|---|---|
| Studio | Author UI, API, orchestration, editor and status | All interactive work |
| PostgreSQL | Durable truth, revisions, source search and queue | All durable work |
| Python worker | Asynchronous ingest projections and writing tasks | Import completion and AI workflows |

Optional runtime:

| Runtime | Role | Failure behavior |
|---|---|---|
| LLM provider | Planning, prose generation and AI analysis | Disable AI action; preserve sources, intent and usable drafts |
| Qdrant | Optional semantic recall/reranking | Fall back to PostgreSQL retrieval |
| Neo4j | Optional relationship neighborhood lookup | Fall back to PostgreSQL story-universe records |
| Historian bridge | Adapter boundary for Qdrant/Neo4j | Degrade explicitly; never replace PostgreSQL truth |
| Grafana | Operational observability | Diagnostics unavailable; product data remains valid |

## 5. Repository ownership

The repository is one deployable product with explicit internal boundaries:

| Path | Owns | Must not own |
|---|---|---|
| `apps/studio/src/app` | Pages and thin route handlers | Domain logic or direct provider behavior |
| `apps/studio/src/features` | UI, application use cases, validation, DTO mapping and orchestration by domain | Python worker execution internals |
| `apps/studio/src/server` | Server-only infrastructure such as the DB pool | Story-specific product rules |
| `services/memory-bridge` | Worker task execution, prompt/runtime context, generation, ledger and rollup | Browser/UI state |
| `db/migrations` | Durable schema and database-enforced invariants | Ad-hoc runtime repair scripts |
| `docs/architecture` | Approved system and domain contracts | Temporary task notes |
| `.agents` | Agent-only workflows, skills and reports | Product runtime or story data |

## 6. Domain modules

Keep five product domains. Folder names may evolve, but ownership must remain
recognizable.

### Stories

Owns story identity, chapter identity, story settings, workspace selection and
story isolation. No record or task may cross story boundaries accidentally.

### Sources

Owns upload/paste intake, immutable source documents, hashes, chapter mapping,
deterministic passages, import receipts and source traceability.

The canonical inexpensive path is:

```text
UTF-8 chapter ZIP
  -> source_only ingest job with provider_call_budget = 0
  -> immutable source_doc
  -> contiguous source_doc_passage rows with offsets and hashes
  -> PostgreSQL full-text index
```

### Universe

Owns source-grounded recall and accepted story information: characters,
aliases, relationships, places, objects, groups, world rules, events, character
knowledge, current/historical state, and open or closed threads.

Retrieval may propose a likely reference. It must distinguish an established
fact, character belief, historical state, draft-only observation, uncertain
inference, and absent information.

### Writing

Owns author intent, `WritingContext`, planning, prose generation, task/run state,
chapter drafts and revision-safe AI assistance. Internal pipeline mechanics do
not become mandatory user-facing forms.

The near-term automated runtime is:

```text
CHAPTER_WRITE_V3
  -> CHAPTER_LEDGER_EXTRACT
  -> MEMORY_ROLLUP_V3
```

Studio enqueues and presents this work. The Python worker assembles runtime
prompt context and calls the selected provider.

### Review

Owns continuity findings, source evidence, revision comparison, approval,
rejection, intentional override and promotion eligibility. A style suggestion
is not a factual contradiction, and neither may silently mutate prose or canon.

## 7. Canonical author journey

```text
Import source
  -> recall relevant evidence
  -> build bounded WritingContext
  -> interpret author direction
  -> plan when needed
  -> generate or revise a draft
  -> inspect evidence and continuity findings
  -> author edits/rejects/approves
  -> extract promotion candidates from approved prose
  -> promote accepted story memory
  -> use it for the next chapter
```

Interaction rules:

- The author may begin with rough prose, event sequence, natural direction, or
  approximate recall; a technical mode selection is not required.
- Chat owns intent and compact workflow events. Long prose belongs in the
  artifact/editor surface.
- Brainstorming does not enqueue writing unless the author asks to draft,
  generate, continue, or execute.
- If two retrieved matches would materially change the plot, ask one concise
  disambiguating question with recognizable source details.
- If no source supports a remembered detail, say it is unknown and offer to
  treat it as a new proposal.
- Saving, approving, promoting story memory, and publishing are separate actions.

## 8. Data authority ladder

Higher rows are not automatically more authoritative; authority depends on
approval and currentness. The ladder describes transformation and ownership.

| Layer | Examples | Authority rule |
|---|---|---|
| Immutable source | `source_doc`, source hash | Exact author-provided evidence; never rewritten by repair or extraction |
| Derived source projection | `source_doc_passage`, detected structure | Rebuildable and traceable to immutable source |
| Story-universe evidence | canon facts, timeline anchors, state and threads | Must carry source, confidence, currentness and conflict status |
| Writing context snapshot | `WritingContext`, analysis/scope snapshots | Bounded run input; not a new source of truth |
| AI draft | `chapter_draft`, staging prose | Draft-only and recoverable |
| Editor revision | document/chapter revision | Human-editable prose; still draft until approved |
| Approved prose | approved chapter/document revision | Eligible source for extraction and export |
| Promotion candidate | chapter ledger and extracted candidates | Cannot feed clean current truth before its gate |
| Promoted story memory | approved current/historical memory | May feed later `WritingContext` according to state and chapter boundary |
| Export/publish snapshot | rendered approved revision | Distribution artifact; does not redefine story truth |

Rules:

- References connect layers; they do not transfer ownership.
- Retcons and approved historical edits mark affected downstream context,
  ledgers and rollups stale until revalidated.
- Superseded information remains historical with source trace rather than being
  deleted.
- Draft-only, stale, rejected and conflicting candidates cannot appear as clean
  current state.

## 9. Dependency rules

- Route handlers parse requests and call feature/application services.
- UI components do not import server-only modules.
- Studio domain code uses the shared DB boundary and provider adapters; it does
  not embed credentials or provider-specific policy in components.
- Synchronous queries stay in Studio when the result is small and immediate.
- Long-running, retryable or provider-backed work runs through durable jobs and
  tasks handled by the Python worker.
- Worker handlers receive versioned, story-scoped task payloads and persist a
  result or an honest terminal state.
- Cross-domain durable writes use an owning service and transaction boundary;
  modules do not mutate one another's tables opportunistically.
- Shared helpers require stable semantics and at least two real consumers.
- New optional infrastructure must have a PostgreSQL-backed degradation path or
  an explicit product decision explaining why it is mandatory.
- TypeScript and Python may implement adapters around one semantic contract;
  they must not define competing meanings for `WritingContext`, approval, or
  story memory.

## 10. API and task contracts

- New HTTP endpoints are story-scoped and live under `/api/[storySlug]/...` or
  `/api/stories/[slug]/...` according to the owning existing route family.
- Legacy unscoped scene routes remain compatibility aliases only and receive no
  new product behavior.
- Requests and delayed tasks carry story, chapter, artifact/revision and request
  identity where applicable.
- Duplicate imports and retryable writes are idempotent.
- API errors use stable machine-readable codes plus a human-readable message.
- Provider credentials remain server-side and are redacted from responses,
  logs and receipts.
- `ingest_job` and `ingest_task` remain the durable queue until an approved
  replacement exists.
- Public writing execution converges on the V3 chapter path; useful legacy
  planner, critic and continuity behavior may be absorbed behind that path, not
  exposed as additional public pipelines.

## 11. Provider boundary

All model providers use a replaceable OpenAI-compatible runtime adapter where
possible. Product code declares a capability and budget; it does not assume a
specific vendor.

Provider rules:

- Gemini is an optional comparison/runtime provider, not an ingestion or CI
  dependency.
- Source-only import has an enforced provider-call budget of zero.
- Deterministic CI uses fake/local fixtures and never requires a personal key.
- A provider call records model, purpose, bounded input metadata, token/call
  budget and result state without logging source prose or secrets unnecessarily.
- Switching provider must not change source, intent, approval, or persistence
  contracts.
- Provider unavailability preserves user intent and any usable draft so the run
  can be retried explicitly.

## 12. Database rules

- PostgreSQL is the system of record.
- Schema changes happen only through committed migrations under
  `db/migrations/`.
- Fresh setup applies the baseline followed by root-level delta migrations in
  filename order; archived pre-baseline SQL is never replayed.
- Database constraints enforce required foreign keys, uniqueness, idempotency
  keys and state invariants where practical.
- Multi-record state transitions use transactions.
- Original story/source content is never destructively reset without explicit
  user confirmation and the canonical purge procedure.
- Derived projections such as passage indexes may be rebuilt; their source rows
  may not be silently rewritten.
- Every migration includes forward/rollback notes and fresh-replay evidence
  before production use.

## 13. Security and privacy

- Manuscripts, prompts and provider keys are private by default.
- Secrets live in local runtime configuration or deployment secret storage,
  never Git, issue text, test fixtures, logs or screenshots.
- Uploads validate encoding, size, type and story ownership.
- Retrieval and writing queries are story-scoped at the database boundary.
- Logs and run receipts use hashes, IDs and bounded diagnostics instead of full
  prose wherever possible.
- Provider requests include only the bounded context required for the declared
  task.
- Publishing and external sharing require a separate explicit user action.

## 14. Quality gates

Every Studio change should pass, as applicable:

- changed-file ESLint;
- TypeScript typecheck;
- focused unit tests;
- production build;
- behavioral or browser verification for user-facing work.

Worker, data and pipeline changes should additionally pass:

- targeted Python unit tests;
- deterministic provider-disabled tests;
- migration-from-empty replay;
- idempotency/retry coverage;
- source-hash and story-isolation assertions;
- PostgreSQL integration evidence for changed queries or migrations.

End-to-end writing release evidence must prove:

1. imported source remains unchanged;
2. approximate recall returns recognizable source evidence;
3. the captured author intent reaches the writer unchanged;
4. the draft advances the correct story and chapter;
5. save/reopen preserves the draft;
6. no generated content enters accepted canon without approval;
7. optional provider comparison reuses the same intent and context.

A green build proves compilation, not product completion.

## 15. Deployment topology

Local-first is the required initial operating model:

```text
Browser
  -> Studio
  -> PostgreSQL
  -> Python worker
  -> optional local/cloud adapters
```

Docker Compose defines the local service topology. PostgreSQL must be healthy
before durable workflows run. Qdrant, Neo4j, Historian and Grafana may remain
disabled for the minimum book-continuation journey.

A future hosted deployment may separate Studio and worker processes while
preserving the same contracts. It requires a separate approval covering
authentication, manuscript storage/privacy, backups, secret management,
provider costs, observability, migration rollout and rollback. Hosted operation
does not justify splitting the product into microservices by default.

## 16. Delivery order

The Book Continuation MVP is the architecture proving path:

1. Import at least one million words locally with zero provider calls and exact
   source fidelity.
2. Retrieve approximate references from the entire source corpus with traceable
   evidence and bounded context.
3. Continue *The Subcurrent* through Studio, then save and reopen the Chapter 17
   draft without changing Chapters 1-16.
4. Optionally rerun the same captured intent/context with Gemini for a fair
   provider comparison.

Do not add mandatory services, dashboards, agent frameworks, or generalized
workflow engines until this journey passes.

## 17. Current transition boundaries

- The source-only import and PostgreSQL passage projection are implemented, but
  the live million-word PostgreSQL receipt still requires an available local
  Docker/PostgreSQL runtime.
- PostgreSQL-first approximate source recall is the next product slice.
- The V3 chapter task chain is the near-term canonical automated writer.
- Legacy scene routes and duplicate narrative executors remain compatibility
  surfaces. They receive no new product behavior and are removed only after
  replacement and route/read evidence exists.
- Future document/chapter revisions are the intended edited-prose source of
  truth; existing chapter drafts and scene versions remain transitional stores
  until that boundary is implemented.
- Promotion semantics exist as a contract but still need concrete schema,
  worker and review implementation before accepted prose can update story
  memory safely.

## 18. Supporting contracts

Read this document first, then the smallest relevant detail contract:

| Surface | Contract |
|---|---|
| Current pipeline inventory and convergence | `writing-pipeline-canonical-map.md` |
| Chapter-first execution and ledger | `chapter_first_v3_spec.md` |
| Story-memory categories and state | `story-memory-contract.md` |
| Bounded generation context | `writing-context-contract.md` and `chapter-writing-context-assembler.md` |
| Edited prose and revision ownership | `document-editor-boundary.md` |
| Approved prose to story memory | `post-write-memory-promotion-flow.md` |
| Chat command and artifact interaction | `conversational-command-orchestrator.md` and `../operations/specs/studio-chat-orchestration-layer.md` |
| UI information architecture | `ui-information-architecture.md` and `novel-lab-design.md` |
| Change routing | `change-impact-map.md` |

When a supporting contract conflicts with this approved baseline, stop and
resolve the conflict explicitly rather than creating another architecture path.
