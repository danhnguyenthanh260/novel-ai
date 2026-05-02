# Story Memory Contract

Issue: #3
Status: Contract draft
Last updated: 2026-05-02

## Purpose

Story memory is the durable narrative record that future planning, writing, validation, and review use to preserve continuity. This contract defines memory categories and state semantics only. It does not define a database schema, migration, promotion algorithm, task queue taxonomy, editor storage model, or prompt format.

#11 will assemble current memory into `WritingContext`. #12 will define how post-write outputs are promoted into durable memory. #5 owns editor/document storage and approval boundaries.

## Durable Categories

| Category | Meaning | Current evidence | Contract rule |
|---|---|---|---|
| `canon_fact` | A durable fact about a character, object, place, group, rule, or situation. | `StoryContextPack` reads `canon_fact` subject/predicate/object/confidence at `apps/studio/src/features/guard/server/storyContextBuilder.ts:615`. Python core lookup reads `canon_fact` and vetting state at `services/memory-bridge/worker_memory_context.py:481`. | Must include source trace, confidence, currentness, and conflict status before being treated as high-impact context. |
| `event` | A thing that happened in prose or planning and may change future continuity. | V3 `ChapterLedger` carries `added_facts` and `modified_states` at `apps/studio/src/features/autowrite/server/chapterFirstTypes.ts:45`; ledger extraction persists them at `services/memory-bridge/worker_task_handlers.py:2126`. | Must not become current state automatically unless #12 promotion rules approve it. |
| `timeline_anchor` | A dated or relative ordering anchor for events, locations, and participants. | `StoryContextPack` reads `timeline_anchor` fields at `apps/studio/src/features/guard/server/storyContextBuilder.ts:724`. `TruthContextPackV1` has `timeline_state` in priority A at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:620`. | Must distinguish ordering evidence from narrative interpretation. |
| `character_state` | A current or historical state of a character, such as location, status, injury, role, or motivation. | `buildWorkingSet.active_state.cast` models status and last seen chapter at `apps/studio/src/features/autowrite/server/chapterContextService.ts:29`. V3 rollup merges modified states into `world_state` at `services/memory-bridge/worker_memory_rollup_v3.py:53`. | Current state needs one active value per property unless explicitly conflicting. |
| `relationship_state` | A current or historical state between entities. | `StoryContextPack` exposes `relationshipLines` at `apps/studio/src/features/guard/server/storyContextBuilder.ts:17`; it also classifies relationship canon from tags/predicates at `apps/studio/src/features/guard/server/storyContextBuilder.ts:608`. | Relationship state must carry participants, directionality when relevant, and currentness. |
| `emotion_state` | Emotional target, mood, or affective state relevant to a chapter or entity. | `writing_snapshot_v3` stores `emotional_target` at `db/migrations/000_baseline_20260502.sql:3575`; `buildPlanningMemoryPackV5` reads recent snapshot emotional target at `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts:523`. | Treat chapter-level emotion as guidance unless promoted to entity-level state by #12. |
| `world_rule` | A rule of the setting, magic, politics, technology, society, or environment. | Python recent structured memory extracts `world_rules` from snapshot JSON at `services/memory-bridge/worker_memory_context.py:108`; `StoryContextPack` reads worldbuilding notes at `apps/studio/src/features/guard/server/storyContextBuilder.ts:583`. | World rules are high-impact and must not be dropped silently when relevant. |
| `lore_addition` | New lore introduced by a chapter that may become canon after approval. | `chapter_ledger.added_facts` exists in baseline schema at `db/migrations/000_baseline_20260502.sql:1043`; V3 ledger extraction writes added facts at `services/memory-bridge/worker_task_handlers.py:2126`. | New lore from drafts is `draft_only` until #12 promotion marks it approved. |
| `open_thread` | An unresolved plot, promise, risk, question, or hook that should influence later chapters. | `writing_snapshot_v3` stores `open_loops` at `db/migrations/000_baseline_20260502.sql:3575`; Python recent structured memory extracts open loops at `services/memory-bridge/worker_memory_context.py:108`. | Open threads must have source, urgency when available, and currentness. |
| `closed_thread` | A formerly open thread that a chapter resolved or intentionally abandoned. | V3 `ChapterLedger` has `resolved_loops` at `apps/studio/src/features/autowrite/server/chapterFirstTypes.ts:45`; ledger extraction persists `resolved_loops` at `services/memory-bridge/worker_task_handlers.py:2126`. | A closed thread must reference the open thread or enough source evidence to avoid accidental closure. |
| `style_signal` | Durable style evidence or guidance, including tone, pacing, perspective, density, and author style. | `StoryContextPack` exposes `styleLines` at `apps/studio/src/features/guard/server/storyContextBuilder.ts:13`; `buildWorkingSet.anchor.style_dna` contains tone, pacing, and perspective at `apps/studio/src/features/autowrite/server/chapterContextService.ts:18`. | Style signals can guide prose but must never override canon, forbidden reveals, or current state. |

## Current State vs Historical Memory

`current_state` is the latest approved value for an entity, property, relationship, thread, or world condition at the target chapter boundary. It answers: what is true now?

`historical_memory` is evidence of what happened before, why current state is true, and which facts were once true but are no longer active. It answers: how did the story get here?

Rules:

- The same source can contribute to both. For example, a chapter ledger event may become historical memory and also update current state after #12 promotion.
- Current state must be compact and contradiction-aware. Historical memory may preserve multiple past values if currentness is clear.
- Stale or superseded memory may remain historical memory but must not be presented as current state.
- Draft-only memory must not be current state unless an approval/promotion rule explicitly allows it.

Current evidence already separates these concerns partially:

- `buildWorkingSet.active_state` models active cast/world/timeline, while `meso_context` and `ephemeral` model milestones and recent deltas. Evidence: `apps/studio/src/features/autowrite/server/chapterContextService.ts:29`.
- Python planning context has layer priority `recent_structured`, `arc`, `saga`, `core_db`, separating recent structured evidence from longer-range memory. Evidence: `services/memory-bridge/worker_memory_context.py:780`.
- `story_milestone` has `is_stale` and `stale_reason`, supporting historical retention without treating stale rollups as current. Evidence: `db/migrations/000_baseline_20260502.sql:2778`.

## Memory States

| State | Meaning | Required behavior |
|---|---|---|
| `current` | The fact/state is the best approved value at the target chapter boundary. | May be used directly in `WritingContext.current_state`. |
| `historical` | The fact/state was true or relevant earlier but is not necessarily active now. | May explain continuity but must not be phrased as current truth. |
| `stale` | A later retcon, invalidation, or data change made the memory unsafe as active context. | Keep only as historical/debug evidence unless revalidated. |
| `superseded` | A newer approved value replaces this memory. | Do not use as current state; keep source trace for audit. |
| `draft_only` | The memory came from generated or edited draft content that has not passed the relevant approval boundary. | Do not promote into durable current state inside #3. |
| `low_confidence` | The memory source exists but confidence is below the threshold required for high-impact writing. | Use only with uncertainty or as a prompt question unless no safer source exists. |
| `conflicting` | Two or more sources disagree on a high-impact fact/state. | Block or degrade according to `WritingContext` readiness depending on impact. |
| `unknown` | The system does not know the value or cannot map source quality. | Say unknown; do not invent a default as if it were memory. |

Known current equivalents:

- `writing_snapshot_v3.fact_status` supports `CLEAN`, `CONFLICT`, `UNVETTED`, `EMPTY_WARNING`, and `INCOMPLETE_COVERAGE`. Evidence: `db/migrations/000_baseline_20260502.sql:3597`.
- `writing_snapshot_v3.approval_status` supports `DRAFT`, `APPROVED`, `SUPERSEDED`, and `CANCELED`. Evidence: `db/migrations/000_baseline_20260502.sql:3597`.
- `chapter_ledger` and `story_milestone` both carry stale fields. Evidence: `db/migrations/000_baseline_20260502.sql:1043` and `db/migrations/000_baseline_20260502.sql:2778`.
- `writingPipelineService.invalidateDownstream` marks downstream ledgers and milestones stale after a retcon. Evidence: `apps/studio/src/features/autowrite/server/writingPipelineService.ts:640`.

## Contract-Level Rules

- High-impact memory must include source trace, confidence, currentness, and conflict status before it can be used as direct writing context.
- Memory category and memory state are separate. Example: a `character_state` can be `current`, `historical`, `stale`, `draft_only`, or `conflicting`.
- Current state must prefer approved, non-stale, chapter-appropriate sources.
- Historical memory may include stale or superseded records only when clearly labeled.
- Generated chapter output can propose memory but cannot approve or promote memory by itself.
- Style signals are advisory and lower priority than canon, current state, forbidden reveals, and continuity constraints.
- Missing memory is a first-class `unknown`, not permission to fill a gap with default prose assumptions.

## Out Of Scope For #3

- No database schema design or migration.
- No implementation of `WritingContext` adapters.
- No changes to `CHAPTER_WRITE_V3`, `CHAPTER_LEDGER_EXTRACT`, `MEMORY_ROLLUP_V3`, `WRITING_*`, or `NARRATIVE_*` task behavior.
- No prompt rewrite.
- No UI changes.
- No editor/document storage or approval boundary design; #5 owns that.
- No post-write promotion algorithm; #12 owns that.
- No queue taxonomy cleanup.
- No deletion or deprecation of existing runtime paths.

## Evidence Mapping

| Existing source | Memory role | Evidence | Gap |
|---|---|---|---|
| `writing_snapshot_v3` | Approved analysis snapshot and pre-writing readiness source. | Worker inserts fact status, narrative score, emotional target, open loops, degraded mode, completeness, ready flag, pre-chapter profile, truth context pack, and delta report at `services/memory-bridge/worker_task_handlers.py:1684`; baseline schema confirms state columns at `db/migrations/000_baseline_20260502.sql:3575`. | Snapshot JSON needs category normalization before it is durable story memory. |
| `story_active_analysis_snapshot` plus `writing_snapshot_v3` | Recent structured facts, loops, and world rules. | Python `load_recent_chapter_structured` requires approved, ready, non-degraded, clean snapshots at `services/memory-bridge/worker_memory_context.py:64`. | This is a selection policy, not a promotion policy. |
| `story_milestone` | Arc/saga memory and rollup summaries. | Python `load_arc_memory` reads non-stale milestones at `services/memory-bridge/worker_memory_context.py:229`; V3 rollup writes `story_milestone` from ledger at `services/memory-bridge/worker_memory_rollup_v3.py:83`; baseline schema includes `summary_json`, `quality_score`, stale fields, and delta report at `db/migrations/000_baseline_20260502.sql:2778`. | Current rollup merge is simplified and not a final conflict-resolution policy. |
| `chapter_ledger` | Chapter-level delta source: facts, state changes, resolved/open loops, and stale markers. | Baseline schema at `db/migrations/000_baseline_20260502.sql:1043`; ledger extraction writes added facts, modified states, resolved/unresolved loops, and metadata at `services/memory-bridge/worker_task_handlers.py:2126`. | #12 must decide when these deltas become approved durable memory. |
| `chapter_continuity_issue` | Validation/audit findings that can block or degrade future context. | Ledger task audits prose and writes continuity issues after ledger extraction at `services/memory-bridge/worker_task_handlers.py:2151`; TypeScript continuity issue type includes severity and evidence payload at `apps/studio/src/features/autowrite/server/chapterFirstTypes.ts:60`. | #3 does not decide mandatory gate severity. |
| `canon_fact` and `timeline_anchor` | Legacy/canonical fact and timeline memory inputs. | `buildStoryContextPack` reads canon facts at `apps/studio/src/features/guard/server/storyContextBuilder.ts:615` and timeline anchors at `apps/studio/src/features/guard/server/storyContextBuilder.ts:724`. | They are currently rendered as lines; #11 must adapt them into structured metadata. |
| Legacy scene versions | Working prose memory and compatibility history. | Python `load_working_memory` reads verified `narrative_scene` and current `narrative_scene_version.text_content` at `services/memory-bridge/worker_memory_context.py:157`. | #5 decides future document/chapter block storage; scene versions remain compatibility/history. |
| `TruthContextPackV1` | Governance metadata for priority, staleness, thread pressure, and dropped/compressed context. | Type fields at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:148`; compiler records evidence refs and degraded reasons at `apps/studio/src/features/analysis/server/truthPackGovernance.ts:629`. | It is governance input, not the full story memory category model. |

## Unknowns For Follow-Up

- #11 must define the concrete adapter output and where it lives.
- #11 must decide how to merge TS and Python layer priorities without creating two competing contracts.
- #12 must define promotion, rejection, supersession, and conflict-resolution rules.
- #12 must decide how approved generated prose creates durable event and state memory.
- #5 must define the approval boundary for edited document/chapter blocks before draft-only memory can become durable.
- A later queue taxonomy issue must decide how `WRITING_*`, `NARRATIVE_*`, and V3 tasks are named and exposed.
