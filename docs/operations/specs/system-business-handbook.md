# System Business Handbook

## Purpose and Audience

This handbook explains the current `novel-ai` system for a newcomer who does not know the project yet and may not know how to write fiction professionally.

The product helps a user build, analyze, draft, review, split, and publish story chapters inside one connected workspace. It combines human editing, AI writing assistance, memory extraction, canon protection, and operational pipeline tracking.

The main audiences are:

| Audience | Why they use the system |
|---|---|
| Beginner author | Start a story, upload source chapters, draft new chapters, and understand what the system is doing |
| Editor or reviewer | Review scene quality, approve or reject changes, and keep story continuity healthy |
| Operator | Inspect background jobs, pipeline states, analysis results, and agent behavior when the system needs help |

Success for a beginner user means:

1. They can create or open a story.
2. They know where to upload existing text and where to write new text.
3. They understand what the system is processing in the background.
4. They can tell the difference between drafting, review, analysis, staging, and publishing.
5. They know what to do when AutoWrite or split approval is blocked.

## System at a Glance

The system is a chapter-first fiction workspace. The main writing unit is the chapter, while scenes are supporting units used for analysis, review, and structure.

The core model is:

| Term | Business meaning |
|---|---|
| Story | The top-level project that owns chapters, scenes, memory, jobs, prompts, and published output |
| Chapter | The main unit of reading and writing; this is what the author drafts, revises, stages, verifies, splits, and publishes |
| Scene | A smaller structural unit created from a chapter to support analysis, review, and scene-level workflow |
| Staging | A temporary chapter area where draft prose is stored before the system verifies and splits it |
| Memory | Structured story knowledge extracted from text, such as facts, timeline anchors, style signals, and worldbuilding references |
| Historian analysis | The background process that reads chapter material, builds writing snapshots, and prepares trustworthy chapter context |
| Review | The human or semi-assisted quality gate used to score, flag, approve, reject, or apply changes |

### Mental model

Use this simple mental model when learning the product:

| Layer | What it does |
|---|---|
| UI and API | The control layer. This is where the user clicks buttons, enters text, uploads files, reads output, and sees statuses. |
| Worker | The execution layer. This is where background jobs actually split chapters, run historian analysis, write prose, and update memory. |
| Database | The memory and audit layer. This is where the system stores stories, chapters, scenes, jobs, tasks, snapshots, reviews, and governance records. |

## Main Workspaces and When to Use Them

### Shelf / Story list

Purpose: browse available stories and open the right project.

When a beginner should use it: at the start of every session, or when switching between story projects.

Input: choose an existing story or create a new one through story management.

Output and status: visible list of stories, publication-facing cards, and access to the chosen story workspace.

### Story settings

Purpose: manage core story metadata, title, identity, assets, and high-level configuration.

When a beginner should use it: before serious writing starts, and whenever story identity changes.

Input: story title, slug, metadata, images, descriptive settings, and publishing-facing information.

Output and status: updated story identity and assets used across the writer, reader, and shelf surfaces.

### Ingest

Purpose: import source chapters or source text into the system and turn them into reviewable split drafts.

When a beginner should use it: when bringing existing text into the product, when reprocessing older source material, or when building the system’s base knowledge from already written chapters.

Input: uploaded files, pasted text, split mode, validation choices, and job options.

Output and status: ingest jobs, split drafts, chapter-level review queues, and eventually approved scene creation tasks.

### Write

Purpose: draft, plan, auto-write, stage, verify, split, and resplit chapters.

When a beginner should use it: whenever creating a new chapter or revising a current one.

Input: chapter instructions, chapter text, AutoWrite choices, plan review decisions, and staging actions.

Output and status: generated chapter prose, staging records, writing status, split jobs, and readiness or block messages.

### Reviews

Purpose: review scene or chapter outputs and decide whether to approve, rewrite, or apply canon changes.

When a beginner should use it: after scene generation, evaluation, or review requests.

Input: reviewer scores, flags, suggestions, and apply decisions.

Output and status: review requests, responses, fused scoring, and applied updates that affect scene state or canon memory.

### Memory

Purpose: inspect story memory at chapter, arc, saga, conflict, and core-memory levels.

When a beginner should use it: when they need to understand what the system currently believes is true about the story, especially after confusion, drift, or repeated writing failures.

Input: usually filters and navigation, not heavy authoring.

Output and status: memory snapshots, conflict review surfaces, arc and saga summaries, and visibility into active story knowledge.

### Analysis

Purpose: inspect historian outputs, readiness signals, chapter analysis state, and recovery actions.

When a beginner should use it: when a chapter is blocked, when analysis seems incomplete, or when they want to understand why AutoWrite or verification behaves a certain way.

Input: analysis actions such as activate, cancel, or recover, plus navigation across chapter analysis records.

Output and status: writing snapshots, readiness indicators, metrics, and historical analysis traces.

### Pipelines

Purpose: inspect runtime job flow, node progression, retries, and operational block points.

When a beginner should use it: only when the normal pages say the system is still processing or blocked and they want to see which background job is waiting or failing.

Input: navigation, retry actions, and node inspection.

Output and status: per-job node graph, node logs, retry actions, and system-level triage.

### Agents

Purpose: govern prompts, run traces, experiments, profiles, and diagnostics for AI agents.

When a beginner should use it: usually not at first. This is primarily an operator or advanced tuning workspace.

Input: prompt governance actions, profile inspection, feedback triage, and diagnostics filters.

Output and status: agent runs, prompt versions, context snapshots, alerts, and governance history.

### Reader / published output

Purpose: consume published story output as a reader-facing experience.

When a beginner should use it: when checking how the public or published story appears.

Input: select story and chapter.

Output and status: published chapter list and chapter reading page.

## Core Business Pipelines

### 1. Story setup and metadata

Business goal: create a story container the rest of the system can work with.

Trigger: story creation or story settings update.

Main input: story title, slug, metadata, imagery, and publication-facing fields.

Main output: story record, story assets, and a stable story workspace.

User decision points: whether the story is ready for writing, review, or publishing.

Important database artifacts: story records, story metadata, and asset references.

### 2. Ingest and split draft approval

Business goal: convert source text into chapter-level ingest jobs and then into split drafts that can be reviewed before scene creation.

Trigger: user uploads text, zip content, mega file content, or pasted chapter text in the ingest workspace.

Main input: source text plus ingest configuration such as split mode and validation options.

Main output: ingest job, ingest tasks, split draft, quality signals, and approval or rejection state.

User decision points: approve split, reject split, submit feedback, retry, or reprocess.

Important database artifacts: ingest jobs and tasks, source documents, split draft payloads, and downstream scene creation tasks.

### 3. Scene creation and scene workflow

Business goal: transform approved chapter segments into scene records and move them through outline, draft, evaluate, rewrite, and lock states.

Trigger: split approval or direct scene workflow actions.

Main input: approved split ranges, scene-level instructions, and rewrite or evaluation actions.

Main output: scene records, version history, evaluation payloads, and locked scenes when approved.

User decision points: outline, draft, evaluate, rewrite, lock, or unlock.

Important database artifacts: scene records, scene versions, and pipeline run logs.

### 4. Review and apply

Business goal: give human judgment a formal place in the system so quality and canon changes are not hidden inside raw prose.

Trigger: review request or explicit review action from the review workspace.

Main input: reviewer scores, flags, suggestions, and canon proposals.

Main output: review response, applied decision, and scene or memory updates.

User decision points: submit response, apply response, keep for later, or request rewrite.

Important database artifacts: review requests, review responses, and review apply logs.

### 5. Historian analysis and memory rollup

Business goal: analyze chapter material, extract meaningful story knowledge, judge readiness for writing, and roll approved knowledge into longer-term memory.

Trigger: explicit analysis runs, AutoWrite analysis, or post-writing analysis events.

Main input: chapter text, instructions, current memory context, and story state.

Main output: staging analysis, writing snapshots, readiness state, truth packs, delta reports, and memory rollups.

User decision points: inspect analysis, activate an analysis snapshot, recover analysis, or wait for rollup to complete.

Important database artifacts: writing analysis staging, writing snapshots, active analysis snapshot pointers, truth-pack governance records, and memory rollup tasks.

### 6. Chapter writing / AutoWrite

Business goal: help the user generate a chapter draft using historian-backed context, planning, prose generation, continuity checks, and finishing passes.

Trigger: AutoWrite run, advanced plan review flow, or chapter execute path.

Main input: chapter instructions, target word count, chapter identity, story context, and active historian signals.

Main output: plan, prose, continuity signals, supervisor output, and staged chapter material.

User decision points: one-click write, advanced plan review, retry refine, retry replan, save draft, or proceed to split.

Important database artifacts: ingest tasks for writing analysis, planning, prose, continuity, supervisor, and narrative polishing, plus writing snapshots and truth-pack artifacts.

### 7. Stage, execute, split, and resplit chapter flow

Business goal: treat the chapter as the main unit of writing, then convert it into downstream scene structure only after the chapter text is ready enough.

Trigger: stage current chapter text, execute prose, split chapter, or resplit chapter.

Main input: full chapter prose and plan state.

Main output: staging row, verified writing status, split job, or resplit job.

User decision points: whether to stage only, execute, split, or resplit.

Important database artifacts: chapter staging records, source documents, ingest jobs, and split tasks.

### 8. Guard and canon protection

Business goal: prevent obvious continuity drift, canon contradiction, or unsupported rewrite behavior.

Trigger: guard preflight, rewrite, draft, AutoWrite continuity checks, or historian truth-pack validation.

Main input: story context, canon facts, relationships, recent events, style profile, and current draft or plan.

Main output: warnings, conflict reports, uncertainty signals, or a safe context pack for the next step.

User decision points: continue, revise plan, retry with retcon intent, or inspect memory and analysis before proceeding.

Important database artifacts: canon and timeline tables, overlay and conflict-review tables, historian snapshots, and truth-pack governance records.

### 9. Dictionary, worldbuilding, and style profile support

Business goal: let the story accumulate reusable language, world facts, and author style information that support later drafting and review.

Trigger: manual edits, worldbuilding updates, style profile updates, dictionary actions, or mined style information from ingest.

Main input: glossary entries, world notes, style fields, and promotion decisions.

Main output: reusable contextual references for guard, writing, analysis, and review.

User decision points: create, edit, promote, audit, consolidate, or delete entries.

Important database artifacts: dictionary records, worldbuilding notes, style profile rows, and author style memory.

### 10. Publishing and reader flow

Business goal: expose stable story metadata and chapter reading output to reader-facing surfaces.

Trigger: publication-oriented metadata changes or published chapter availability.

Main input: published chapter content and story metadata.

Main output: shelf cards, public story endpoint output, chapter list, and reader pages.

User decision points: confirm metadata, choose which story is public-facing, and inspect final reader experience.

Important database artifacts: story metadata, published chapter state, and reader-facing chapter queries.

### 11. Pipeline triage and agent governance

Business goal: provide operator support surfaces when the normal author workflow is not enough to understand a block or unstable behavior.

Trigger: failed jobs, blocked nodes, canary prompt investigation, agent drift, or repeated background issues.

Main input: job IDs, node keys, run traces, prompt versions, experiments, and feedback events.

Main output: diagnosis, retries, governance actions, and prompt or agent lifecycle control.

User decision points: retry node, inspect logs, compare agents, pause experiment, promote prompt, or rollback prompt.

Important database artifacts: pipeline node events, agent traces, prompt governance records, context snapshots, and feedback events.

## Input and Output Map

| Flow | User input | System processing | User-visible output | Hidden/internal artifacts |
|---|---|---|---|---|
| Ingest upload | File upload, pasted text, split options | Creates ingest job, source document, split task, and review draft | Job status, split draft preview, approval actions | `source_doc`, `ingest_job`, `ingest_task`, split result payloads |
| Chapter AutoWrite | Chapter target, optional instruction, write mode | Runs analysis, planning, prose, continuity, supervisor, and narrative passes | Plan review screen, generated prose, blocked or ready state | `writing_analysis_staging`, `writing_snapshot_v3`, truth-pack records, writing tasks |
| Scene draft or rewrite | Scene instructions or rewrite action | Runs scene workflow with guard context and evaluation hooks | New scene version, evaluation result, or rewritten version | `narrative_scene_version`, pipeline run logs, enrich tasks |
| Review submission | Scores, flags, suggestions, canon proposals | Stores review response and optional apply action | Review history and apply result | `review_request`, `review_response`, `review_apply_log` |
| Analysis run | Analysis request or write-triggered analysis | Builds historian staging, snapshots, truth pack, delta report, and cutover state | Analysis page status, readiness, metrics, snapshot visibility | `writing_analysis_staging`, `writing_snapshot_v3`, `analysis_delta_report_v1`, cutover state |
| Split approval | Approve chapter or scene split draft | Enqueues scene creation tasks and downstream memory work | Approval result, scenes become available | `ingest_task` rows for `SCENE_CREATE`, scene records |
| Publish and read | Story metadata and published chapter availability | Reads public story and chapter state | Shelf cards, chapter list, reader view | story metadata, published chapter read payloads |

## Database and Infrastructure: Why They Exist

### Storage and runtime layers

| Layer | Why it exists |
|---|---|
| PostgreSQL | The main source of truth for business data, workflow state, jobs, tasks, chapters, scenes, reviews, memory, and audit history |
| Qdrant | Supports retrieval of style and context similarity so the system can find relevant writing patterns and memory signals faster |
| Neo4j | Supports lineage and relationship reasoning when graph-based conflict or continuity checks are needed |
| memory-bridge worker | Executes long-running background tasks so the UI stays responsive while heavy ingest, analysis, writing, and rollup tasks keep working asynchronously |

### Main table families by purpose

#### Story and chapter tables

Why they exist: to hold the top-level story project and the chapter identities that everything else attaches to.

Business problem they solve: a fiction system needs stable story ownership, chapter ordering, and a consistent place to attach metadata, jobs, and outputs.

What usually updates them: story creation, story settings edits, chapter creation, chapter metadata updates, and publication flows.

#### Scene and scene-version tables

Why they exist: to store the scene structure generated from chapters and preserve version history through outline, draft, evaluate, rewrite, and lock stages.

Business problem they solve: authors and reviewers need structural units smaller than chapters without losing version traceability.

What usually updates them: split approval, scene workflow actions, and review-driven rewrite loops.

#### Ingest job and task tables

Why they exist: to run work asynchronously and make long operations observable.

Business problem they solve: splitting, analysis, writing, and rollup take longer than a normal web request and must survive refreshes, retries, and failures.

What usually updates them: ingest, AutoWrite, analysis actions, split approvals, chapter split/resplit, and background worker execution.

#### Source document tables

Why they exist: to store chapter-like source text in a stable, hashable form before splitting or re-splitting.

Business problem they solve: the system needs a single source document record when a whole chapter is imported, staged, split, or reprocessed.

What usually updates them: ingest upload, chapter split, chapter resplit, and chapter-originated source creation for downstream processing.

#### Canon, timeline, and memory tables

Why they exist: to store extracted story knowledge, facts, anchors, overlays, conflicts, style memory, and rollups across chapter, arc, and saga scopes.

Business problem they solve: AI drafting and guard logic need more than raw text. They need structured memory about what is true, what is uncertain, and what changed.

What usually updates them: memory enrich tasks, historian analysis, memory rollup, dictionary and worldbuilding actions, and conflict review operations.

#### Historian snapshot and truth-pack tables

Why they exist: to capture chapter-scoped analysis, writing readiness, truth-context packs, delta reports, entity-resolution snapshots, and cutover telemetry.

Business problem they solve: the writing system needs an inspectable bridge between raw memory and chapter drafting, especially when canon or identity issues appear.

What usually updates them: `WRITING_ANALYSIS`, truth-pack compilation, worker adjudication passes, and AutoWrite runtime governance.

#### Review and governance tables

Why they exist: to persist human review, prompt governance, agent governance, and traceability for system behavior.

Business problem they solve: authors and operators need accountable review actions and safe ways to understand or adjust AI behavior over time.

What usually updates them: reviews, prompt lifecycle actions, agent diagnostics, feedback loops, and governance operations.

## How a Beginner Actually Uses the System

### Journey A: Start a new story and ingest source chapters

1. Open the Shelf or story list and choose an existing story or create a new one.
2. Open Story settings and fill in the basic story identity so the workspace is no longer empty.
3. Go to Ingest when you already have chapters, notes, or source text to bring into the system.
4. Upload the source text and choose how you want the system to split it.
5. Wait for the ingest job to create a split draft.
6. Review the split draft and approve it if the chapter segmentation looks correct.
7. After approval, the system creates scenes and begins building memory from them.
8. Move to Write, Reviews, or Memory depending on whether you want to draft new text, inspect generated scenes, or understand the story knowledge base.

### Journey B: Use AutoWrite to draft a chapter safely

1. Open the Write page for the target story and chapter.
2. Decide whether you want one-click generation or advanced plan review.
3. Enter a target word count and any short guidance for the chapter.
4. Start AutoWrite.
5. The system runs historian analysis first so it can judge what is safe to use as chapter truth.
6. Review the plan if you are using the advanced mode, or inspect the generated result if you used one-click mode.
7. If the system blocks the run, read the writing status and analysis context instead of retrying blindly.
8. When the chapter looks usable, stage or execute it through the chapter-first flow.
9. If needed, split or resplit the final chapter into scenes for downstream memory and review.

### Journey C: Review, correct, split, and publish

1. Open Reviews if a scene or chapter output needs scoring or editorial judgment.
2. Submit feedback and apply it when the system offers an apply path.
3. Return to Write if the chapter needs a new draft or a new AutoWrite attempt.
4. Use stage or execute when the full chapter text is ready enough to become the system’s current working version.
5. Use split or resplit so the chapter becomes structured scenes again.
6. Inspect Memory or Analysis if you want to confirm the system absorbed the chapter correctly.
7. Open the reader-facing view to confirm the published or public output looks correct.

## Common Statuses and What They Mean

### Ingest jobs and tasks

| Status | What it means | What the user should do next |
|---|---|---|
| `PENDING` | The job or task exists but has not started yet | Wait a little, then check Pipelines if it stays stuck |
| `RUNNING` | The worker is actively processing it | Wait for completion unless it appears frozen |
| `WAIT_REVIEW` or approval-like states | The system needs a human decision before continuing | Open the relevant review or split panel and make a decision |
| `DONE` | The background step completed successfully | Move to the next workspace or next action |
| `FAILED` | The system could not complete the task | Inspect Pipelines, Analysis, or the relevant page and retry with more context |

### Scene statuses

| Status family | Meaning | Next action |
|---|---|---|
| Drafting states | The scene is still being outlined or drafted | Continue drafting, evaluate, or rewrite |
| Evaluated or revised states | The scene has passed through review-like processing | Decide whether to lock, rewrite again, or apply review |
| Locked | The scene is treated as final for now | Move on unless you intentionally unlock it |

### Chapter staging and verification

| Status family | Meaning | Next action |
|---|---|---|
| Staged | Chapter prose is stored temporarily and waiting for the next operation | Execute, split, or keep revising |
| Verified or ready | The chapter passed the current verification threshold | Continue with split, publish, or further review |
| Split or resplit pending | The chapter is waiting for structural conversion into scenes | Monitor the ingest or split path |

### Analysis readiness

| Signal | Meaning | Next action |
|---|---|---|
| Ready for writing | Historian analysis is complete enough for writing support | Proceed with AutoWrite or planning |
| Degraded mode | The system completed something, but not with full confidence or completeness | Inspect Analysis before trusting the result too much |
| Active snapshot | The system has a selected chapter analysis snapshot it can use | Continue writing with more confidence |

### AutoWrite states

| State | Meaning | Next action |
|---|---|---|
| Ready | Analysis and planning support are available | Start or continue AutoWrite |
| Review required | The plan or generated output wants a user decision | Review the plan or diagnosis panel |
| Blocked by canon or quality gates | The system believes the chapter would drift too far or is not safe enough to proceed automatically | Read the explanation, inspect Analysis or Memory, then revise plan or retry appropriately |

## Common Failure Cases

### Split needs approval

Why it happens: the system can split a chapter automatically, but it still needs human confirmation before turning those segments into durable scenes.

Where to inspect: Ingest split draft panel.

What usually fixes it: approve the split if it looks correct, or reject and provide feedback if the boundaries are wrong.

### AutoWrite blocked by canon or quality gates

Why it happens: the system believes the plan or prose is introducing unsupported setting, object, timeline, or identity drift.

Where to inspect: Write page status panel, Analysis page, and Memory page.

What usually fixes it: review the plan, reduce unsupported new details, retry with corrected intent, or inspect the active analysis snapshot before running again.

### Historian snapshot not ready

Why it happens: analysis has not completed, failed, or is degraded enough that the system does not trust it yet.

Where to inspect: Analysis page and pipeline status for writing analysis tasks.

What usually fixes it: wait, rerun analysis, recover the rollup, or inspect pipeline errors if the worker stopped.

### Scene or plan drift

Why it happens: chapter-level writing, scene-level structure, and stored memory can fall out of sync after major revisions or repeated retries.

Where to inspect: Write page, scene detail pages, Memory page, and Analysis snapshots.

What usually fixes it: resplit the chapter, regenerate the plan, or review which memory snapshot is active.

### Worker still processing

Why it happens: heavy tasks such as split, historian analysis, and AutoWrite run asynchronously.

Where to inspect: job status, writing status, or the Pipelines page.

What usually fixes it: usually waiting is enough. If the same task remains unchanged for too long, inspect pipeline nodes and retry the specific failed step.

## Glossary

| Term | Meaning |
|---|---|
| `source_doc` | A stored source chapter document used as the single source text for ingest, split, or resplit operations |
| Scene | A structural unit created from a chapter for scene workflow, review, and memory extraction |
| Chapter | The main unit of writing and reading in the system |
| Split draft | The system’s proposed scene segmentation for a chapter before human approval |
| Staging | A temporary chapter storage layer used before final verification or downstream split |
| Historian | The analysis subsystem that studies chapter material, extracts truth, and prepares writing-safe context |
| Truth pack | The chapter-scoped context package prepared for writing and planning so the system uses resolved, compact story truth instead of raw memory directly |
| Memory rollup | The background process that takes chapter-level analysis and promotes it into longer-lived story memory |
| Guard | The canon and continuity protection layer used before or during drafting, rewriting, and AutoWrite |
| Pipeline node | A visible runtime step inside a background job, used mainly for diagnosis and retries |
| Agent governance | The operator-facing controls for prompt versions, run traces, experiments, and AI behavior management |
