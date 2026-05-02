# Chapter Writing Context Assembler Contract

Issue: #11
Status: Contract draft
Last updated: 2026-05-02

## Purpose

The chapter writing context assembler is the single contract-level entrypoint that prepares `WritingContext` before AutoWrite planning or prose generation. It decides which sources are current, which are historical, which are unsafe, and whether writing may proceed, proceed degraded, or block before an LLM call.

This document does not implement runtime behavior, schema, prompt changes, routes, workers, or UI. It defines the source priority, adapter boundary, readiness semantics, and debug payload that future implementation tasks must follow.

Approved near-term consumer path:

```text
CHAPTER_WRITE_V3 -> CHAPTER_LEDGER_EXTRACT -> MEMORY_ROLLUP_V3
```

## Entrypoint Contract

Future implementation should expose one chapter-scoped assembler boundary used before both planning and prose generation:

```ts
type AssembleChapterWritingContextInput = {
  story_id: number;
  story_slug?: string;
  chapter_id: string;
  user_intent: string;
  target_word_count?: number;
  mode?: "plan" | "prose" | "rewrite" | "validate";
  latest_approved_document_revision_id?: string;
  latest_editor_draft_revision_id?: string;
  latest_chapter_draft_id?: string;
  latest_scene_version_id?: number;
  allow_degraded?: boolean;
};
```

The assembler output is the canonical `WritingContext` plus preflight and debug metadata:

```ts
type AssembleChapterWritingContextOutput = {
  context: WritingContext;
  preflight: {
    status: "proceed" | "degraded" | "blocked";
    degraded_reasons: string[];
    block_reasons: string[];
    minimum_viable_context_met: boolean;
  };
  debug: ChapterWritingContextDebug;
};
```

Exact TypeScript names are future implementation details. The required semantic fields are not optional.

## Required Context Slots

| Slot | Required behavior |
|---|---|
| `intent` | Must include target chapter, user instruction/chapter goal, writing mode, and word-count or mode hints when available. Missing intent blocks. |
| `immediate_continuity` | Must include the safest available continuation source: approved document continuity when available, otherwise approved/staged chapter prose or compatibility scene prose with source status. Missing usable continuity degrades or blocks depending on chapter position and mode. |
| `active_characters` | Must list active cast and current known state. Empty cast is degraded for early/sparse stories and blocked when the chapter intent requires named participants. |
| `relationship_states` | Must represent current participant relationships separately from historical relationship evidence. Conflicting current relationships degrade or block by impact. |
| `causal_chain` | Must include recent causal events and consequences needed to avoid jumps. Missing older history alone must not block. |
| `open_threads` | Must include active unresolved hooks, risks, promises, and questions. Closed or stale threads must not be presented as current. |
| `constraints` | Must include hard canon, timeline, world, active locks, author annotations, and allowed/blocked entity constraints. Hard conflicts block. |
| `world_rules` | Must include relevant setting rules and world state. Missing nonessential lore degrades only when the chapter depends on it. |
| `style_anchor` | Must include tone, pacing, perspective, and style guidance when available. Missing style degrades, never blocks by itself. |
| `forbidden_reveals` | Must include POV-limited knowledge, withheld facts, blocked reveals, and high reveal-sensitivity constraints. Required but missing reveal protection blocks for reveal-sensitive chapters. |
| `uncertainties` | Must preserve unknown, stale, draft-only, conflicting, low-confidence, or fallback-derived signals as explicit uncertainty. |
| `source_trace` | Must exist for every high-impact fact, state, constraint, reveal, event, relationship signal, and uncertainty. |

## Source Priority

The assembler must prefer current approved story state over historical or draft memory. Source priority is:

1. Explicit user intent for the current request, but only for the requested chapter. Intent may guide writing, not rewrite established canon silently.
2. Approved document/chapter revision from the future editor model. This is the future prose source of truth from #5.
3. Approved current-state memory produced by an approved promotion flow from #12.
4. Latest approved or verified chapter analysis snapshots that are clean and ready for writing.
5. Non-stale V3 ledger and rollup outputs when they are marked usable for context; before #12 promotion, treat them as candidates or historical support, not final canon.
6. Current staged prose or `chapter_draft.full_text` for the target chapter, marked `draft_only` unless explicitly approved.
7. Compatibility scene versions and legacy scene prose, marked as compatibility/history unless tied to an approved document revision or approved legacy policy.
8. SQL facts, timeline anchors, worldbuilding, dictionary, and author annotations with source metadata.
9. Optional external retrieval signals from Qdrant-style semantic matches and Neo4j-style relationship neighborhoods.
10. Fallback line-oriented builders such as `StoryContextPack`, `TruthContextPackV1`, and Python `worker_memory_context.py` outputs after adapter normalization.

Conflict rule: a lower-priority source cannot override a higher-priority current source. It may add historical explanation, uncertainty, or debug evidence. If two high-priority current sources conflict and no approved resolution exists, the assembler must return `degraded` or `blocked`.

## Current State And Historical Memory Rules

- `current_state` answers what is true at the target chapter boundary.
- `historical_memory` explains why current state is true and may include stale or superseded evidence only when labeled.
- Draft-only, stale, superseded, low-confidence, and conflicting records must not be emitted as clean current state.
- Missing values must be represented as `unknown`, not default prose assumptions.
- `style_anchor` and semantic similarity can influence voice, but cannot override current state, constraints, or forbidden reveals.

## Preflight Outcomes

| Outcome | Required rule |
|---|---|
| `proceed` | Intent exists, immediate continuity is usable, high-impact current state is clean or explicitly marked as nonblocking uncertainty, and no hard constraint/reveal conflict exists. |
| `degraded` | Writing can continue but one or more nonblocking sections are partial, stale, fallback-derived, low-confidence, externally unavailable, or budget-trimmed. The output must carry degraded reasons and conservative instructions. |
| `blocked` | Intent is missing, target chapter cannot be identified, immediate continuity is too incomplete to continue safely, required reveal protection is unavailable, or a high-impact current-state conflict has no approved resolution. |

Minimum viable AutoWrite requires:

- target `story_id` and `chapter_id`;
- non-empty `user_intent` or approved chapter goal;
- at least one usable continuity source for non-initial chapters;
- no unresolved hard conflict in current state, forbidden reveals, active locks, or timeline constraints.

Historical memory gaps alone must not block writing.

## Reason Taxonomy

Initial degraded reason codes:

- `STYLE_ANCHOR_MISSING`
- `CURRENT_STATE_PARTIAL`
- `RELATIONSHIP_STATE_PARTIAL`
- `WORLD_RULES_PARTIAL`
- `HISTORICAL_MEMORY_MISSING`
- `EXTERNAL_RETRIEVAL_UNAVAILABLE`
- `EXTERNAL_RETRIEVAL_LOW_CONFIDENCE`
- `LEGACY_CONTEXT_FALLBACK_APPLIED`
- `DRAFT_ONLY_CONTINUITY_USED`
- `BUDGET_TRIMMED_CONTEXT`
- `SOURCE_TRACE_PARTIAL`

Initial block reason codes:

- `INTENT_MISSING`
- `TARGET_CHAPTER_INVALID`
- `CONTINUITY_REQUIRED_BUT_MISSING`
- `CURRENT_STATE_HARD_CONFLICT`
- `RELATIONSHIP_HARD_CONFLICT`
- `TIMELINE_HARD_CONFLICT`
- `FORBIDDEN_REVEAL_GUARD_MISSING`
- `ACTIVE_LOCK_VIOLATION`
- `SOURCE_TRACE_REQUIRED_BUT_MISSING`

Implementation may add codes, but must not rename these without updating this contract and downstream issue references.

## Debug Payload

`ChapterWritingContextDebug` must explain how the assembler made decisions without requiring operators to inspect raw prompts.

Required fields:

| Field | Meaning |
|---|---|
| `assembler_version` | Version string for future migration and reproducibility. |
| `source_priority_applied` | Ordered source list actually considered for this request. |
| `included_sources` | Source ids, tables/functions, source status, confidence/currentness, and target slots for included facts. |
| `excluded_candidates` | Dropped or rejected candidates with reason: stale, superseded, lower-priority conflict, low confidence, over budget, duplicate, draft-only, or not chapter-relevant. |
| `conflicts` | Conflicting facts/states with source traces, selected winner if any, and preflight impact. |
| `missing_required_slots` | Required slots with no usable source. |
| `degraded_reasons` | Machine-readable degraded reason codes plus short human-readable notes. |
| `block_reasons` | Machine-readable block reason codes plus short human-readable notes. |
| `budget` | Token/section budget, kept counts, dropped counts, and high-impact metadata preservation status. |
| `external_retrieval` | Adapter availability, timeout/low-confidence state, thresholds, and source count for Qdrant/Neo4j-style retrieval. |

The debug payload is safe for Operations/inspector surfaces. Everyday Write UI should consume only summarized readiness state unless #6 later decides otherwise.

## Adapter Boundary

The assembler should consume current sources through adapters before changing storage or worker behavior.

| Current source | Adapter responsibility | Evidence |
|---|---|---|
| `buildWorkingSet` | Convert `anchor`, `active_state`, `meso_context`, and `ephemeral` into `intent`, `current_state`, `historical_memory`, `style_anchor`, and `open_threads`; mark placeholder values such as `N/A`, empty `world_rules`, and empty `world_flags` as unknown. | `apps/studio/src/features/autowrite/server/chapterContextService.ts:12`, `apps/studio/src/features/autowrite/server/chapterContextService.ts:53`, `apps/studio/src/features/autowrite/server/chapterContextService.ts:131` |
| `writingPipelineService` V3 enqueue | Replace direct `working_set` payload construction with assembled `WritingContext` in a future child task; keep `CHAPTER_WRITE_V3` as the canonical consumer path. | `apps/studio/src/features/autowrite/server/writingPipelineService.ts:537`, `apps/studio/src/features/autowrite/server/writingPipelineService.ts:560` |
| Python `build_planning_context_v5` | Normalize `recent_structured`, `arc`, `saga`, and `core_db` layer priority into canonical source priority and debug counts. | `services/memory-bridge/worker_memory_context.py:715`, `services/memory-bridge/worker_memory_context.py:781`, `services/memory-bridge/worker_memory_context.py:799` |
| Python `build_prose_context_v5` | Normalize `working`, `recent_structured`, `saga`, and `core_db` prose-time layers into immediate continuity and historical memory. | `services/memory-bridge/worker_memory_context.py:821`, `services/memory-bridge/worker_memory_context.py:855`, `services/memory-bridge/worker_memory_context.py:872` |
| `TruthContextPackV1` | Map priority A/B, reveal sensitivity, ambiguity constraints, degraded reasons, token budget, and compression drops into constraints, forbidden reveals, uncertainties, and budget debug metadata. | `apps/studio/src/features/analysis/server/truthPackGovernance.ts:148`, `apps/studio/src/features/analysis/server/truthPackGovernance.ts:596`, `apps/studio/src/features/analysis/server/truthPackGovernance.ts:626`, `apps/studio/src/features/analysis/server/truthPackGovernance.ts:697` |
| `StoryContextPack` | Normalize line-oriented canon, timeline, relationship, world, style, and historian status into structured slots with source trace. | `docs/architecture/writing-context-contract.md` evidence mapping |
| Approved document revisions | Future adapter must provide plain-text continuity plus document/revision source trace. Until editor storage exists, this slot is absent rather than guessed. | `docs/architecture/document-editor-boundary.md` |

## Failure And Fallback Rules

- Optional external retrieval failures degrade; they do not block if SQL/current continuity is safe.
- Legacy context fallback must set `LEGACY_CONTEXT_FALLBACK_APPLIED`.
- Draft-only continuity may be used for the target chapter only when the caller allows degraded writing and no approved continuity exists.
- If the assembler cannot preserve source trace for a high-impact retained fact, it must block or drop the fact and record `SOURCE_TRACE_REQUIRED_BUT_MISSING`.
- Budget trimming must preserve high-impact metadata before optional historical detail.

## Implementation Sequence For Child Tasks

1. Define concrete TypeScript types for assembler input/output and debug payload.
2. Implement read-only adapters for `buildWorkingSet`, `TruthContextPackV1`, and existing Python context outputs without changing prompt behavior.
3. Add preflight classification and reason-code tests against fixture inputs.
4. Wire `CHAPTER_WRITE_V3` enqueue to consume assembled context in a feature branch with an explicit rollback path.
5. Add Operations/debug inspector support only after #6 places the UI surface.

## Non-Goals

- No database migration.
- No prompt quality tuning.
- No editor UI or document storage implementation.
- No memory promotion policy; #12 owns that.
- No publishing/export adapter.
- No queue taxonomy cleanup.
- No removal of legacy scene, `NARRATIVE_*`, or V2 paths.
- No runtime behavior change inside this contract issue.

## Acceptance Criteria Mapping

| Issue #11 criterion | Contract answer |
|---|---|
| One canonical `WritingContext` assembly entrypoint is defined. | See `Entrypoint Contract`. |
| Input includes story, chapter, intent, mode/word count, and latest approved/staged references. | See `AssembleChapterWritingContextInput`. |
| Output includes required slots, optional slots, degraded/block reasons, and debug metadata. | See `Required Context Slots`, `Preflight Outcomes`, and `Debug Payload`. |
| High-impact facts include source trace, confidence, currentness, and conflict status. | See `Source Priority`, `Current State And Historical Memory Rules`, and `Debug Payload`. |
| Current state has priority over historical memory. | See `Source Priority` and `Current State And Historical Memory Rules`. |
| Historical or superseded memory cannot silently override current prose. | See `Conflict rule` and source priority entries. |
| Missing minimum viable context creates degraded or blocked state. | See `Preflight Outcomes` and `Reason Taxonomy`. |
| Debug payload explains included/excluded memories. | See `Debug Payload`. |

## Known Unknowns

- Whether the first implementation lives entirely in TypeScript or uses a shared TS/Python payload bridge.
- Exact approval signal that lets V3 ledger/rollup output become current-state input before #12 is implemented.
- Exact UI placement for context debug, pending #6.
- Exact token budget values for each section.
- Whether future document blocks replace all compatibility scene continuity reads at once or through a staged adapter.
