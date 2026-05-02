# Document Editor Boundary Contract

Status: Approved contract for issue #5.

This document defines the future document editor ownership boundary for human-edited prose, publishing preparation, and memory extraction. It is contract-level only. It does not implement storage, migrations, routes, UI, prompts, workers, or publishing adapters.

## Approved Decision

The future human-editable prose source of truth is a document/chapter block model, stored as ProseMirror/Tiptap-compatible JSON or an equivalent block JSON shape that can be losslessly adapted to ProseMirror/Tiptap.

Approved ownership rules:

- `document/chapter blocks` own human-edited prose, headings, marks, comments, revision metadata, formatting, and export metadata.
- `chapter_draft.full_text` remains the AI-generated chapter draft and staging source until bridged into an editor document.
- `narrative_scene_version.text_content` remains compatibility/history for existing scene flows and read surfaces.
- Canon memory does not own editor formatting, comments, revision threads, or export metadata.
- Memory extraction and promotion may only consume approved document content, not every keystroke, temporary editor state, or raw AI worker payload.
- Publishing/export adapters consume document/export state, not raw AI payloads.

## Why This Boundary Exists

The editor layer has different responsibilities from canon memory and AI runtime state. A document editor needs rich formatting, comments, revisions, and export preparation. Canon memory needs durable story truth. AI runtime state needs task inputs, drafts, diagnostics, and validation outputs. Combining these concerns would make formatting edits capable of corrupting story truth, or make canon state depend on presentation details.

## Evidence Map

| Source | Evidence | Contract implication |
|---|---|---|
| `docs/architecture/writing-pipeline-canonical-map.md:27` | Future generated prose source of truth is document/chapter blocks, not `narrative_scene_version`. | #5 must define the document block and bridge boundary. |
| `docs/architecture/writing-pipeline-canonical-map.md:28` | `narrative_scene_version` remains compatibility/history until the editor model exists. | Scene versions stay readable and bridgeable, but are not the future editor source of truth. |
| `docs/architecture/writing-pipeline-canonical-map.md:43` | Current writes are split across `chapter_draft`, `narrative_chapter_staging`, and `narrative_scene_version`. | #5 must prevent these stores from silently competing as final prose truth. |
| `docs/architecture/writing-pipeline-canonical-map.md:223` | Human document editor is the step where approved editing and formatting happen. | Human editing is a distinct flow step after AI generation. |
| `docs/architecture/writing-pipeline-canonical-map.md:225` | Future document approval marks document/chapter block revision as approved; `repoScene.insertVersion` is history/persistence, not approval. | Approval is explicit and belongs to the document model, not legacy scene insert side effects. |
| `docs/architecture/writing-pipeline-canonical-map.md:226` | Publishing consumes approved document/export state only. | Publishing adapters must not read raw AI payloads as final content. |
| `db/migrations/000_baseline_20260502.sql:1004` | `chapter_draft` stores `full_text`, `scene_markers`, status, and metadata. | Current chapter-first AI output is flat prose with metadata, not rich editor storage. |
| `db/migrations/000_baseline_20260502.sql:1822` | `narrative_scene_version` stores scene-level `text_content`, beats, eval, and summary. | Existing scene versions are prose history/compatibility records. |
| `apps/studio/src/features/scenes/server/scenesApiService.ts:189` | V3 bridge reads `chapter_draft.full_text` and exposes virtual scenes when scene rows are absent. | Current UI bridge is compatibility behavior, not final editor ownership. |
| `apps/studio/src/features/scenes/server/scenesApiService.ts:1411` | Chapter staging endpoint persists prose into `narrative_chapter_staging`. | Staged chapter prose is an intermediate state and needs explicit approval before memory/publishing. |
| `apps/studio/src/features/story/server/storyApiService.ts:441` | Public chapter reads currently use `narrative_scene_version.text_content` and staging fallback. | Reader/publish surfaces must later migrate to approved document/export state. |
| `apps/studio/src/features/story/components/ReaderPageClient.tsx:38` | Reader concatenates `scene.text_content` for full text copy. | Existing public reader consumes scene text, so future migration needs a compatibility bridge. |

## Storage Recommendation

Use one editor storage family for the first implementation: block JSON compatible with ProseMirror/Tiptap.

Required properties:

- Stable document id and revision id.
- Story id and chapter id references.
- Optional scene id and scene version id references on blocks or block ranges.
- Plain-text extraction without formatting loss for analysis workers.
- Rich-text preservation for headings, paragraphs, emphasis, comments, annotations, and export preparation.
- Deterministic serialization for revision diffing and approval audit.
- Versioned schema metadata so future editor changes can migrate documents safely.

Recommended minimum document shape, for future implementation only:

```ts
type EditorDocumentContract = {
  document_id: string;
  story_id: number;
  chapter_id: string;
  schema_version: string;
  editor_format: "prosemirror-json" | "tiptap-json";
  status: "draft" | "approved" | "archived";
  current_revision_id: string;
  content_json: unknown;
  export_metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
```

This is not a TypeScript API or database schema for #5. It is the contract shape later #5 child tasks should refine into concrete types and migrations.

## Storage Trade-Offs

| Option | Decision | Reason |
|---|---|---|
| ProseMirror/Tiptap-compatible block JSON | Chosen | Mature editor ecosystem, preserves rich editing semantics, can export plain text for analysis, and supports comments/revisions through extensions or side tables. |
| Markdown only | Rejected for first editor storage | Good for plain prose and export, but weak for comments, rich revision metadata, block references, and future Google Docs-like editing. |
| Raw HTML | Rejected | Easy to render but too presentation-heavy and brittle for canon-safe analysis. |
| Plain text plus formatting sidecars | Rejected for first implementation | Keeps analysis simple but creates synchronization complexity between text ranges and formatting metadata. |
| Store formatting in canon/memory tables | Rejected | Violates separation between presentation and story truth. |

## Ownership Boundaries

### Editor Document Owns

- Rich prose blocks and block order.
- Marks, headings, comments, annotations, and editor revision metadata.
- Export metadata such as target platform, title overrides, section breaks, and formatting preferences.
- Human-edited text after AI draft import.
- Approval state for document revisions.

### AI Draft And Runtime Own

- Generated draft prose before import or approval.
- Task payloads, model diagnostics, planning artifacts, ledger outputs, and validation diagnostics.
- `CHAPTER_WRITE_V3 -> CHAPTER_LEDGER_EXTRACT -> MEMORY_ROLLUP_V3` as the near-term automated prose path.

### Canon Memory Owns

- Approved story facts, character state, relationship state, timeline anchors, world rules, lore, and thread state.
- Current/historical memory states defined in `docs/architecture/story-memory-contract.md`.
- Source traces from approved content or approved analysis outputs.

### Compatibility Scene Version Owns

- Existing scene-level prose history and read compatibility.
- Current scene workflow outputs until bridge tasks replace or adapt them.
- Backward-compatible references for review, search, and existing reader surfaces.

## Reference Rules

Document blocks may reference existing story records, but references do not transfer ownership of canon truth.

Allowed references:

- `story_id`: required for all editor documents.
- `chapter_id`: required for chapter documents.
- `scene_id`: optional block or range reference for compatibility with scene UI.
- `scene_version_id`: optional reference to the source version imported into a document revision.
- `chapter_draft_id`: optional reference to the AI draft imported into a document revision.
- `approved_source_id`: optional reference to the approved revision used for memory extraction.

Rules:

- A block reference says where prose came from or what compatibility surface it maps to.
- A block reference does not make that block the canon source for facts.
- Canon changes require the approved-content memory extraction flow.
- A stale reference must be surfaced as a sync issue, not silently overwritten.

## Prose State Model

| State | Meaning | Can feed memory extraction? | Can feed publishing? |
|---|---|---:|---:|
| AI generated draft | Prose created by an AI task, usually `chapter_draft.full_text` or staging prose. | No | No |
| Imported editor draft | AI or legacy prose imported into document blocks for human editing. | No | No |
| Human editor draft | User-edited document revision that is not approved. | No | No |
| Approved document revision | Explicitly approved human-readable document content. | Yes | Yes |
| Export snapshot | Rendered/export-ready output derived from an approved document revision. | No, unless separately approved as source | Yes |
| Compatibility scene version | Scene-version history or legacy read bridge. | Only if tied to an approved document revision or legacy approved policy | Legacy only |

## Canonical Flow

The approved future flow is:

```text
CHAPTER_WRITE_V3
  -> chapter_draft.full_text
  -> import into editor document blocks
  -> human edits document revision
  -> continuity/evaluation gates
  -> explicit approval
  -> approved document revision
  -> memory extraction / promotion candidate
  -> export snapshot / publishing adapter
```

Flow rules:

- AI-generated content starts as draft-only.
- Importing AI prose into editor blocks does not approve it.
- Editing document blocks does not update canon memory.
- Approval is the first point where edited prose can become durable source material for memory extraction.
- Memory extraction may create promotion candidates; #12 owns the promotion algorithm and conflict handling.
- Publishing adapters read approved document/export state only.

## Sync Rules

### AI Draft To Editor Document

- Import should preserve source references to `chapter_draft` or staging record.
- Import should create or update an editor draft revision, not overwrite an approved revision.
- Import should record whether the imported prose came from AI generation, staging, scene version, or manual source text.

### Editor Document To Scene Version

- Scene versions are compatibility/history, not editor source of truth.
- A bridge may create scene-version snapshots from approved document revisions for legacy reader/review/search surfaces.
- Bridge writes must record source document revision references where schema allows; if current schema cannot store them, the implementation must record that gap in issue notes before coding.
- A scene-version insert is not approval.

### Editor Document To Memory

- Only approved document revisions can enqueue or trigger memory extraction.
- Draft editor revisions are `draft-only` for memory purposes.
- If an approved revision conflicts with existing memory, #12 owns conflict classification and promotion behavior.
- Analysis workers should consume plain text extracted from approved blocks plus source metadata, not raw rich formatting.

### Editor Document To Publishing

- Publishing/export adapters consume approved document revisions or export snapshots.
- Raw AI task payloads, staging prose, and unapproved editor drafts are invalid publishing sources.
- Platform-specific export lossiness must be recorded in export metadata, not back-written into canon memory.

## Read And Compatibility Migration Principles

Until editor storage exists:

- Existing reader and scene UI may continue reading `narrative_scene_version.text_content`, `narrative_chapter_staging`, and `chapter_draft.full_text` through current bridges.
- New implementation work must avoid making those stores the permanent human-edited source of truth.
- Any future migration must preserve reader access during transition.
- Any future migration must distinguish imported draft content from approved document revisions.

After editor storage exists:

- Reader/publish surfaces should prefer approved document/export state.
- Scene-version reads should become compatibility fallback or history views.
- AI context assembly should use approved document continuity only when #11 adapters are updated to do so.

## Contract-Level Rules Versus Future Ownership

This contract owns:

- The editor/canon/AI/publishing boundary.
- The approved storage family recommendation.
- Approval and sync semantics.
- Non-goals and future ownership boundaries.

#11 owns later:

- Adapting approved document continuity into `WritingContext`.
- Readiness/degraded behavior when approved document continuity is unavailable.
- Source priority between approved document blocks, chapter drafts, scene versions, snapshots, and memory.

#12 owns later:

- Promotion of approved document analysis into durable memory.
- Conflict, stale, superseded, draft-only, low-confidence, and unknown memory handling after extraction.
- Whether ledger outputs become promotion candidates automatically or require manual review.

Future #5 child tasks own later:

- Database schema and migrations for editor documents/revisions/comments.
- Editor UI implementation.
- Import/export bridge implementation.
- Scene-version compatibility bridge implementation.
- Publish/export adapter implementation.

## Non-Goals

Do not implement these inside issue #5 contract work:

- Database schema or migration.
- Full editor UI.
- Prompt rewrite.
- Python worker changes.
- Queue taxonomy.
- Memory extraction implementation.
- Post-write memory promotion.
- Publishing to external platforms.
- Removal of `narrative_scene_version`.
- Replacement of existing reader or scene APIs.
- Runtime behavior changes.

## Known Unknowns

- Exact database table layout for documents, revisions, comments, and export snapshots.
- Whether comments/revisions should be embedded in editor JSON, stored in side tables, or both.
- How block ranges should reference legacy `scene_id` and `scene_version_id`.
- How much formatting each publishing target can preserve.
- Whether approved document revisions require an explicit continuity gate before memory extraction, or whether continuity issues can be created after approval.
- How legacy approved scene versions should be treated when imported into the document model.

## Acceptance Criteria Mapping

| Issue #5 criterion | Contract answer |
|---|---|
| Editor content storage format is chosen or narrowed to a single recommended option. | ProseMirror/Tiptap-compatible block JSON is the recommended first storage family. |
| Document blocks can reference story/chapter/scene/version IDs without owning canon truth. | See `Reference Rules` and `Ownership Boundaries`. |
| Flow from AI-generated prose to human-edited document to approved version is documented. | See `Canonical Flow` and `Prose State Model`. |
| Flow from approved document content to analysis/memory extraction is documented. | See `Editor Document To Memory`. |
| Publishing adapters are consumers of document/export state, not raw AI payloads. | See `Editor Document To Publishing`. |
