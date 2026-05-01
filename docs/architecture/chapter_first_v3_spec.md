# Technical Specification: Chapter-First V3 Foundation

## 1. Overview

The V3 foundation moves Novel-AI from scene-first writing toward chapter-first writing. A chapter becomes the primary execution unit for automated writing, while the ledger records durable narrative state changes created by that chapter.

## 2. Table Specifications

### `chapter_draft` (Prose SSOT)

Stores the complete prose draft for a chapter.

- **scene_markers**: `[{ "idx": number, "title": string, "offset": number }]`. Used to virtualize scenes for legacy UI surfaces without splitting chapter prose into separate scene rows.

### `chapter_ledger` (Narrative Delta)

Stores the narrative delta produced by a chapter.

- **added_facts**: `[{ "id": string, "fact": string, "confidence": number }]`. New facts introduced by the chapter.
- **modified_states**: `{ "character_id": { "prop": "value" } }`. Character or world-state changes, such as location, mood, status, or relationship state.
- **resolved_loops**: `[string]`. Story loops or subplots resolved by the chapter.
- **unresolved_loops**: `[{ "description": string, "urgency": number }]`. Open hooks that should influence later chapters.

### `chapter_continuity_issue` (Validation Audit)

Stores continuity and consistency issues detected by validation.

## 3. Source Of Truth Mapping (V2 -> V3)

| V2 entity | V3 entity | Notes |
| :--- | :--- | :--- |
| `source_doc` | `chapter_draft` input | V3 treats source text as the first draft input. |
| `narrative_scene` | `chapter_draft` virtual scenes | Separate scene records are replaced by markers where possible. |
| `scene_version` | `chapter_draft.version_no` | Versioning moves to the chapter level. |
| `writing_snapshot_v3` | `chapter_ledger` | Ledger stores deltas instead of static snapshots. |
| `story_milestone` | `chapter_ledger` meso memory | Milestone behavior is consolidated into ledger-driven memory. |
| `scope_snapshot_v1` | `chapter_ledger` global memory | Used to filter context loaded into the working set. |

## 4. Backward Compatibility And Migration

- **Co-existence**: V2 and V3 run side by side. Existing V2 stories continue to use `narrative_scene`.
- **Virtual scene provider**: `GET /scenes` can parse `chapter_draft.scene_markers` when no scene rows exist for a chapter.
- **Feature flag**: `story_series.config_json -> "use_v3_core"` determines whether chapter-first execution is enabled.
