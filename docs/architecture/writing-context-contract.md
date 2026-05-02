# WritingContext Contract

Issue: #3
Status: Contract draft
Last updated: 2026-05-02

## Purpose

`WritingContext` is the canonical context contract for automated chapter writing. It defines what the planner and writer are allowed to know, what they must protect, what can be omitted under budget pressure, and how sources are traced.

This contract is semantic only. It does not change runtime behavior, task payloads, database schema, prompts, or UI. #11 owns implementation adapters that assemble this contract. #12 owns post-write memory promotion rules.

Approved near-term consumer path:

```text
CHAPTER_WRITE_V3 -> CHAPTER_LEDGER_EXTRACT -> MEMORY_ROLLUP_V3
```

The existing canonical map approves this path and identifies `buildStoryContextPack`, `buildPlanningMemoryPackV5`, `worker_memory_context.py`, and `truthPackGovernance.ts` as sources that should become adapters into one shared contract. Evidence: `docs/architecture/writing-pipeline-canonical-map.md:25`, `docs/architecture/writing-pipeline-canonical-map.md:208`, `docs/architecture/writing-pipeline-canonical-map.md:220`.

## Canonical Sections

| Section | Meaning | Required for minimum viable AutoWrite | Current evidence |
|---|---|---:|---|
| `intent` | The chapter goal, user instruction, target chapter id, writing mode, and any approved plan constraints. | Yes | `writingPipelineService.ts` passes `chapter_goal`, `working_set`, and `style_options` into `CHAPTER_WRITE_V3` task payloads at `apps/studio/src/features/autowrite/server/writingPipelineService.ts:556`. `runChapterPlanning` calls `buildPlanningMemoryPackV5` before planning at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:1600`. |
| `immediate_continuity` | The local prose tail, recent chapter facts, open loops, unresolved immediate beats, and recent scene/version state needed to continue without a jump. | Yes | `buildStoryContextPack` derives local chapter ids and loads local prose tail at `apps/studio/src/features/guard/server/storyContextBuilder.ts:537`. Python `load_working_memory` reads verified recent scene prose at `services/memory-bridge/worker_memory_context.py:157`. |
| `current_state` | Current character, relationship, world, object, emotional, and thread state that should be treated as active at the chapter boundary. | Yes when available; degraded if partial. | `buildWorkingSet` has `active_state.cast`, `world_flags`, and `timeline_facts` at `apps/studio/src/features/autowrite/server/chapterContextService.ts:29`. V3 rollup merges ledger `modified_states` into `world_state` at `services/memory-bridge/worker_memory_rollup_v3.py:53`. |
| `historical_memory` | Older facts, milestones, saga memory, and long-range context that explain why current state is true. | No; retain after required sections. | `buildPlanningMemoryPackV5` reads approved `writing_snapshot_v3` rows at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:523`. Python `load_arc_memory` reads non-stale `story_milestone` rows at `services/memory-bridge/worker_memory_context.py:229`. |
| `constraints` | Hard writing constraints: allowed characters, valid anchors, timeline state, open threads, budget decisions, and author annotations. | Yes for facts that can create contradictions. | `TruthContextPackV1` contains priority packs, token budget stats, compression drops, staleness flags, and thread pressure at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:148`. `compileTruthContextPackV1` builds priority A/B facts at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:596`. |
| `forbidden_reveals` | Information the writer must not reveal yet, including POV-limited knowledge, withheld canon, blocked entities, or reveal-sensitive material. | Yes when present; absence must be explicit. | `compileTruthContextPackV1` adds `ambiguity_constraints` for high reveal sensitivity at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:620`. `buildPlanningMemoryPackV5` filters blocked entities from author annotations at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:492`. |
| `style_anchors` | Tone, pacing, perspective, prose density, author style, and style examples that shape prose without overriding canon. | Degraded if missing. | `StoryContextPack` exposes `styleLines` at `apps/studio/src/features/guard/server/storyContextBuilder.ts:13`. `buildWorkingSet.anchor.style_dna` contains tone, pacing, and perspective at `apps/studio/src/features/autowrite/server/chapterContextService.ts:18`. |
| `uncertainties` | Missing, stale, low-confidence, conflicting, or fallback data that the writer must handle conservatively. | Yes when any source is incomplete. | `buildPlanningMemoryPackV5` emits degraded reasons including `MISSING_RECENT_STRUCTURED` and `LEGACY_CONTEXT_FALLBACK_APPLIED` at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:710`. Python context builders emit `memory_runtime.degraded_reasons` at `services/memory-bridge/worker_memory_context.py:772` and `services/memory-bridge/worker_memory_context.py:848`. |
| `debug_source_metadata` | Source ids, source tables, confidence, currentness, conflict status, retrieval warnings, and drop counts used to audit the context. | Yes for high-impact facts. | `StoryContextPack.stats` tracks retrieval warnings and external retrieval status at `apps/studio/src/features/guard/server/storyContextBuilder.ts:21`. `buildPlanningMemoryPackV5` records evidence and source snapshot ids at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:486`. Python context builders expose used/dropped layer counts at `services/memory-bridge/worker_memory_context.py:793` and `services/memory-bridge/worker_memory_context.py:871`. |

## Required Fact Metadata

Every high-impact fact in `intent`, `immediate_continuity`, `current_state`, `constraints`, `forbidden_reveals`, or `uncertainties` must carry enough metadata for #11 to render and audit it:

| Field | Requirement |
|---|---|
| `source_trace` | At minimum: source system, source table or function, source id when known, chapter id when applicable, and source timestamp/hash when available. |
| `confidence` | Numeric or enum confidence from the source. If no source confidence exists, mark `unknown` rather than inventing a score. |
| `currentness` | One of `current`, `recent`, `historical`, `stale`, `superseded`, `draft_only`, or `unknown`. |
| `conflict_status` | One of `clean`, `conflicting`, `low_confidence`, `unvetted`, `incomplete_coverage`, or `unknown`. |

Current evidence already contains partial equivalents: `canon_fact.confidence` is selected by `buildStoryContextPack` at `apps/studio/src/features/guard/server/storyContextBuilder.ts:615`; `writing_snapshot_v3` stores `fact_status`, `ready_for_writing`, and `degraded_mode` in the baseline schema at `db/migrations/000_baseline_20260502.sql:3575`; `chapter_ledger` stores `is_stale` and `stale_reason` at `db/migrations/000_baseline_20260502.sql:1043`.

## Truncation Priority

When #11 implements budget enforcement, truncation must follow this priority order:

1. Preserve `intent`, `forbidden_reveals`, blocking `constraints`, and blocking `uncertainties`.
2. Preserve `immediate_continuity` needed to continue the previous approved prose.
3. Preserve `current_state` for active cast, active location, active emotional state, unresolved loop status, and current world state.
4. Preserve `debug_source_metadata` for all retained high-impact facts, even if compressed.
5. Preserve `style_anchors` needed for tone, pacing, and perspective.
6. Compress then trim `historical_memory`, keeping summaries and source references before full detail.
7. Drop optional historical examples, redundant source lines, and low-impact style examples first.

This contract intentionally does not set token counts. Existing implementations already use local caps and drop stats, such as `TruthContextPackV1.token_budget_stats` and `compression_drops` at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:154`, TS planning drop counters at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:471`, and Python layer drop counters at `services/memory-bridge/worker_memory_context.py:766`.

## Readiness Rules

`WritingContext` readiness has three outcomes.

| Outcome | Rule | Examples |
|---|---|---|
| `proceed` | Intent is present, immediate continuity is sufficient, no hard conflicts exist in active constraints, and high-impact facts either have clean source metadata or are explicitly marked as uncertain. | Chapter goal exists, recent continuity is available from approved snapshots or working memory, active cast is present, and no forbidden reveal conflict is reported. |
| `degraded` | Intent is present, writing can continue, but one or more non-blocking context sections are partial, stale, low-confidence, or fallback-derived. The writer must be conservative and surface uncertainty in debug metadata. | Protagonist current state is missing but recent continuity and chapter intent exist. Style anchors are missing but no canon contradiction risk is detected. Recent structured memory is missing and legacy context fallback is applied. |
| `blocked` | Required intent is absent, a hard conflict affects what should be written, forbidden reveal constraints cannot be enforced, or immediate continuity is too incomplete to continue safely. | Missing chapter intent or chapter goal. Active chapter id is invalid. A high-impact relationship state has conflicting current values with no approved source. Forbidden reveal rules are required by profile but absent or contradictory. |

Minimum viable AutoWrite requires `intent`, at least one usable immediate continuity source, and either clean current state or explicit degraded reasons. Missing historical memory alone must not block writing.

## Evidence Mapping

| Existing source | Maps to `WritingContext` | Evidence | Gap |
|---|---|---|---|
| `StoryContextPack` | `style_anchors`, world constraints, canon lines, relationship lines, timeline lines, historian status, retrieval metadata. | Type fields at `apps/studio/src/features/guard/server/storyContextBuilder.ts:13`; builder loads story overview/world/canon/timeline/historian guidance at `apps/studio/src/features/guard/server/storyContextBuilder.ts:537`, `apps/studio/src/features/guard/server/storyContextBuilder.ts:680`, and `apps/studio/src/features/guard/server/storyContextBuilder.ts:960`. | Line-oriented strings need structured fact metadata before becoming canonical. |
| `TruthContextPackV1` | `constraints`, `forbidden_reveals`, `uncertainties`, truncation/drop metadata. | Type fields at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:148`; compiler builds priority A/B, evidence refs, degraded reasons, reveal and voice constraints at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:596`. | Priority packs are close to truncation policy but are not yet the full `WritingContext` section model. |
| `buildPlanningMemoryPackV5` | `intent`, recent structured memory, planning constraints, evidence refs, degraded reasons. | Function starts at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:470`; reads approved `writing_snapshot_v3` at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:523`; applies fallback `buildStoryContextPack` at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:710`; compiles truth pack at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:884`. | It is planner-specific and large; #11 should adapt it rather than copy it as the canonical shape. |
| Planning guard usage | `blocked` readiness and allowed-entity constraints. | `runChapterPlanning` rejects empty allowed character sets at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:1600`; author annotations can block entities at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:492`. | The exact set of hard blockers beyond missing intent/characters remains #11 implementation scope. |
| `buildWorkingSet` | `intent`, `current_state`, `historical_memory`, `style_anchors`, and V3 writer payload seed. | WorkingSet shape at `apps/studio/src/features/autowrite/server/chapterContextService.ts:12`; reads active cast, milestones, chapter ledger, and recent changes at `apps/studio/src/features/autowrite/server/chapterContextService.ts:60`; enqueued into `CHAPTER_WRITE_V3` at `apps/studio/src/features/autowrite/server/writingPipelineService.ts:536`. | The current type has simplified/defaulted fields such as empty `world_rules`, empty `world_flags`, and `motivation: "N/A"`; these must be treated as unknowns, not facts. |
| Chapter-first types | Post-write memory categories and continuity issues. | `ChapterLedger` defines `added_facts`, `modified_states`, `resolved_loops`, `unresolved_loops`, and stale fields at `apps/studio/src/features/autowrite/server/chapterFirstTypes.ts:45`. | These are candidate TS types, not final shared API or DB schema definitions. |
| Python `worker_memory_context.py` planning context | `immediate_continuity`, `historical_memory`, core facts, saga guardrails, layer priority, degraded reasons. | `load_recent_chapter_structured` reads approved clean snapshots at `services/memory-bridge/worker_memory_context.py:64`; `load_arc_memory` reads non-stale milestones at `services/memory-bridge/worker_memory_context.py:229`; `build_planning_context_v5` returns layer priority and runtime degraded reasons at `services/memory-bridge/worker_memory_context.py:715`. | Uses Python dict shape `memory_contract_version: v5`; #11 must reconcile naming and metadata with TS. |
| Python `build_prose_context_v5` | Prose-time continuity, working prose, recent structured facts, saga guardrails, and core lookup. | `load_working_memory` reads verified scene prose at `services/memory-bridge/worker_memory_context.py:157`; `build_prose_context_v5` returns working/recent/saga/core layers and degraded reasons at `services/memory-bridge/worker_memory_context.py:821`. | It still reads legacy scene prose; #5 decides future document/chapter block source of truth. |
| Writing analysis snapshots | Historical and current analysis source with readiness state. | `process_writing_analysis_task` inserts `writing_snapshot_v3` with `fact_status`, `open_loops`, `degraded_mode`, `ready_for_writing`, pre-chapter profile, truth context pack, and analysis delta at `services/memory-bridge/worker_task_handlers.py:1684`; baseline schema confirms columns at `db/migrations/000_baseline_20260502.sql:3575`. | Snapshot JSON category semantics remain broader than this contract and need adapter normalization. |
| V3 ledger and rollup outputs | Post-write deltas that later become future `current_state` and `historical_memory`. | Ledger extraction inserts `chapter_ledger` with added facts, modified states, resolved/unresolved loops, metadata, and continuity issues at `services/memory-bridge/worker_task_handlers.py:2088`; rollup consolidates ledger into `story_milestone` at `services/memory-bridge/worker_memory_rollup_v3.py:8`. | #12 must decide promotion, conflict resolution, and approval semantics before these outputs become authoritative current state. |

## Unknowns For Follow-Up

- #11 must decide the concrete serialized shape, adapter module boundaries, and exact field names.
- #11 must decide how many blockers exist beyond the examples in this contract.
- #12 must decide how `chapter_ledger` facts and states are promoted, superseded, or rejected.
- #5 must decide whether future continuity reads come from document/chapter blocks instead of legacy scene versions.
- Task taxonomy must decide whether `WRITING_*` and `NARRATIVE_*` remain public queue types or merge under the V3 path.
