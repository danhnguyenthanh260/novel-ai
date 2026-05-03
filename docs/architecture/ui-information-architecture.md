# UI Information Architecture

Issue: #6
Status: Planning contract
Last updated: 2026-05-02

## Purpose

This document defines the first information architecture boundary for Studio writing surfaces. It classifies current writing-related controls by user necessity, assigns debug and operational workflows to explicit surfaces, and defines the first simplified Write surface without changing runtime behavior.

This is a planning contract only. It does not implement components, routes, storage, prompts, workers, notifications, or visual redesign.

## Design Principles

The Studio UI is story-first, not pipeline-first.

Primary principles:

- Keep the main writing flow focused on chapter prose, context readiness, review, and approval.
- Use progressive disclosure for diagnostics, retries, raw payloads, worker state, and operational controls.
- Show system confidence clearly, but do not make the writer parse task internals to continue.
- Preserve access to debug and recovery tools by moving them to Operations or inspectors, not by deleting them.
- Follow the existing ownership contracts instead of inventing UI-owned source-of-truth rules.

Reference inputs:

- `apps/studio/README.md` defines Story-first Studio and current UI source-of-truth rules.
- `docs/architecture/writing-context-contract.md` defines `WritingContext` sections and readiness.
- `docs/architecture/chapter-writing-context-assembler.md` owns context assembly, preflight, degraded/block state, and debug metadata.
- `docs/architecture/document-editor-boundary.md` owns future editor document approval and export source-of-truth.
- `docs/architecture/post-write-memory-promotion-flow.md` owns post-write memory candidate promotion.
- `docs/architecture/story-memory-contract.md` owns memory truth boundaries.
- `docs/architecture/conversational-command-orchestrator.md` owns Novel Lab command intent, typed workflow requests, artifact handoff, approval gates, and command trace semantics.
- `docs/architecture/conversational-command-mvp-map.md` maps the first slash commands to existing workflows or explicit missing contracts.

## Surface Map

| Surface | One-sentence job | Primary user question | Must not own |
|---|---|---|---|
| Write | Help the writer produce, edit, review, and approve chapter prose. | What am I writing now, is it safe to continue, and what action approves the prose? | Worker lifecycle, raw payload review, memory truth promotion, export adapters. |
| Memory | Review durable story truth, candidate promotion, conflicts, stale state, and current canon. | What is true now, what changed, and what needs human validation? | Everyday drafting controls, worker start/stop, visual timeline layout. |
| Timeline | Show causal order, recent consequences, unresolved loops, and continuity gaps. | What happened before this chapter and what must follow from it? | Relationship graph ownership, raw queue diagnostics, prose editing. |
| Relationships | Show current character/entity states and relationship edges relevant to decisions. | Who is connected, how, with what current state and confidence? | Full memory promotion workflow, worker operations, prose editor state. |
| Publish | Prepare approved document/export snapshots for reader or platform output. | Which approved revision is ready to publish or export? | AI draft payloads, unapproved editor drafts, canon memory mutation. |
| Operations | Control and inspect worker lanes, queues, pipeline jobs, retries, raw payloads, and failure recovery. | What is running, blocked, failed, or recoverable? | Writer-facing prose approval, memory truth decisions, editor source-of-truth. |

## Current Control Classification

Classification keys:

- `Keep primary`: visible in the primary surface because it directly advances the surface job.
- `Compress`: keep visible but summarize, combine, or hide detail until requested.
- `Move`: move to another named surface or inspector before removing from the current surface.
- `Remove later`: remove only after replacement workflow exists and issue notes document the change.

| Current area | Current control or data | Classification | Target location | Reason |
|---|---|---|---|---|
| Write header | Chapter selector | Keep primary | Write | Selecting the active chapter is required before writing or reviewing. |
| Write header | `+ CHAPTER` | Compress | Write secondary action | Useful, but should not compete with writing/approval actions. |
| Write header | `PROSE VIEW` | Compress | Write secondary action or Publish preview | Useful preview link; it is not the main writing action. |
| Write header | `AUTO WRITE` | Keep primary | Write | Starts the core chapter-generation path. |
| Write header | Scene status badge | Keep primary | Write | Writer needs immediate confidence about locked/draft state. |
| Write header | `UNLOCK FOR EDIT` | Move | Write inspector or Operations | Unlock is a recovery/edit-state control, not everyday writing. |
| Write dock | `Actions`, `Context`, `Assist`, `Report` tabs | Compress | Write right rail | The rail should become focused cards rather than a generic tab bucket. |
| Draft editor | Edit/Split/Preview mode | Keep primary | Write editor | These are direct document interaction modes. |
| Draft editor | Markdown tools `B`, `I`, `H1`, `List`, `More` | Compress | Editor toolbar | Keep editor tools compact and subordinate to prose. |
| Draft editor | Autosave dirty/clean state | Keep primary | Write editor footer | Writer needs save confidence. |
| Draft editor | Keyboard shortcut copy | Compress | Tooltip/help | Persistent shortcut text adds noise to the editor footer. |
| Draft control panel | `Commit Version` | Move | Future editor approval flow | Approval belongs to document/editor revision semantics from #5. |
| Draft control panel | `Check Consistency` | Compress | Write context readiness card | A summary should be primary; detailed check output goes to inspector. |
| Draft control panel | `Evaluate`, `Rewrite Targeted`, `AutoWrite v1`, `Lock` | Move | Operations or legacy scene inspector | These are legacy scene workflow controls, not the chapter-first primary path. |
| Draft control panel | Token budget, guard tokens, char counts | Move | Context inspector | Important diagnostics, but too technical for everyday writing. |
| AutoWrite wizard | Target word count | Keep primary | Write run setup | A writer-facing generation constraint. |
| AutoWrite wizard | User prompt/chapter instruction | Keep primary | Write run setup | A writer-facing generation input. |
| AutoWrite wizard | Writing intent mode | Keep primary with stronger copy | Write run setup | `CONTINUE_CANON` versus `RETCON_REWRITE` is a high-impact user decision. |
| AutoWrite wizard | One-click AutoWrite | Keep primary | Write run setup | Directly advances the writing flow. |
| AutoWrite wizard | Plan first | Compress | Write run setup | Advanced but useful when the user wants manual plan review. |
| AutoWrite wizard | Editable plan title, summary, beats, context guard | Compress | Plan review step | Plan editing should be a focused review step, not mixed with runtime diagnostics. |
| AutoWrite wizard | Pipeline dashboard | Compress | Write progress card | Writer needs progress, not every lane detail. |
| AutoWrite wizard | Pause/Abort pipeline | Move | Operations with Write escape hatch | These are operational controls; Write may expose a minimal cancel affordance only during active runs. |
| AutoWrite wizard | Integrity, quality, conflict, canon, planning guard summaries | Compress | Write review rail | Keep pass/block/degraded result visible; detailed root cause goes to inspector. |
| AutoWrite wizard | Raw `PLANNING_INPUT_PACK_JSON`, `PLANNING_OUTPUT_JSON`, `PROSE_INPUT_PACK_JSON`, `PROSE_OUTPUT_JSON`, `CONFLICT_REPORT_V1`, `PLAN_CONTINUITY_GATE_V1` | Move | Operations job inspector | Raw payloads are required for debugging but should never dominate the write completion step. |
| AutoWrite wizard | `APPROVE & SPLIT INTO SCENES` | Remove later | Future editor import/approval flow | Scene splitting is compatibility behavior and must yield to #5 document approval. |
| AutoWrite wizard | `SAVE CHAPTER DRAFT (NO SPLIT)` | Keep primary until editor exists | Write completion | This is the near-term bridge from AI prose to staged chapter draft. |
| AutoWrite wizard | `EDIT PLAN`, retry refine/replan, `PROCEED AS RETCON` | Move with summary | Write recovery card plus Operations inspector | Recovery decisions are important, but retry mechanics and root cause details belong in inspector/Operations. |
| AutoWrite wizard | `JUST VIEW PROSE (MANUAL)` | Compress | Write completion secondary action | Useful manual escape hatch, but lower priority than draft save or approval. |
| App shell | `Worker Ctrl` | Move | Operations | Worker lifecycle is global operational state, not primary navigation chrome. |
| App shell | Llama toggle | Move | Operations | Runtime service toggles belong with worker controls. |
| App shell | Worker lanes, queue metrics, start/restart/stop all/lane | Move | Operations | These are operational controls and should be out of story-writing chrome. |
| Memory Hub | Chapter/Arc/Saga/Core/Conflict tabs | Keep primary | Memory | They map to memory review responsibilities. |
| Memory Hub | `Advanced Operations` link | Keep secondary | Memory to Operations | Correctly sends batch/chapter-range work away from memory truth review. |
| Analysis Operations | Batch/chapter-range console | Keep primary | Operations | This is already explicitly operational and should remain outside Memory. |
| Map Board | Structure filters | Keep primary | Timeline/Structure | Structural navigation is core to map work. |
| Map Board | Checkout, Commit, Import, Export | Compress | Timeline/Structure toolbar and Publish | State-changing structure actions remain map-specific; export also informs Publish. |
| Map Board | Metrics | Compress | Timeline inspector | Metrics are diagnostics for structure, not the main canvas. |
| Map Board | Scene drawer beat editing | Keep primary for Structure | Timeline/Structure | Beat editing is structural planning, not relationship graph ownership. |
| Map Board | Notes JSON | Move | Structure inspector | Raw JSON belongs in inspector. |

## Simplified Write Surface

The first simplified Write surface should become the Novel Lab command artifact workspace. It keeps a chapter-first writing loop while separating command work, artifact work, and inspector state.

The workspace has three stable global zones:

| Zone | Job | Must not do |
|---|---|---|
| Left navigation | Select story, chapter, and product surface. | Execute tasks or show raw pipeline diagnostics. |
| Center work stream | Capture commands, task progress, result summaries, next-action CTAs, and the bottom composer. | Display long generated prose, stay as a permanent command palette, or show raw diagnostics. |
| Right artifact workspace | Show the active artifact, editable chapter draft, review actions, and attached inspector. | Parse commands, silently approve/promote memory, or own global navigation. |

Slash commands are invoked from the center composer by typing `/` or opening the command menu. They should not render as a static command list when the author is idle. The right artifact workspace owns a resizable inspector with `Progress`, `Context`, `Issues`, `Memory`, and `Versions` tabs, but the default view summarizes state and expands details on demand.

The previous simplified Write surface can still be interpreted as four internal responsibilities.

| Zone | Primary content | Secondary content | Hidden or moved |
|---|---|---|---|
| Header | Story/chapter label, chapter selector, status/readiness badge, primary run or save action. | Secondary prose preview or create chapter action. | Worker controls, llama toggle, queue metrics. |
| Document area | Editor document or current chapter prose, autosave state, edit/preview modes. | Compact formatting toolbar and manual prose view. | Legacy scene workflow controls unless the user opens a legacy scene inspector. |
| Context and review rail | Context readiness, current blockers/degraded reasons, memory candidate summary, continuity warning, approval readiness. | Plan review summary, quality gate summary, recovery recommendation. | Raw JSON payloads, token accounting, worker lane details. |
| Inspector entry | Link/button to open job/context inspector for this run. | Latest job id, high-level status, failure code. | Inline raw payload blocks inside the main completion view. |

Primary Write flow:

```text
Select chapter
  -> set target/instruction/intent
  -> assemble WritingContext
  -> show proceed/degraded/blocked readiness
  -> generate or plan-review-generate
  -> review prose and quality status
  -> save/import editor draft
  -> approve document revision when #5 editor exists
  -> send approved source to #12 memory candidate flow
```

Write readiness display:

- `proceed`: render `Context Clean`, show concise confidence, selected continuity source, and primary write action.
- `degraded`: render `Context Partial`, show degraded reason codes and a conservative recommendation before write starts.
- `blocked`: render `Context Blocked`, show blocker reason codes and the exact surface that can resolve them, such as Memory conflict review or Operations job recovery.

Approval display rule:

- `Run continuity check` is the enabled primary action while validation is pending.
- `Approve revision` is visible but locked/disabled until continuity validation passes or an approved override contract exists.
- The generated chapter draft remains draft-only until approval; it must not feed memory, reader, or publish output directly.

Fallback display rule:

- Fallbacks must be explicit. A Write card may summarize fallback status, but the full reason code, metadata, and source trace belong in the context/job inspector.
- If a new context is present but invalid, the UI should render a blocked/error state from #11 metadata rather than presenting silent fallback as a normal write path.

## Operations Surface

Operations owns runtime control and diagnostics.

Required first responsibilities:

- Worker lane status for split, analysis, writing, and all lanes.
- Llama/runtime service state.
- Queue counts by status.
- Start, stop, restart, refresh controls.
- Active writing job progress.
- Pause, abort, retry, replan, refine, and recovery operations.
- Raw payload inspector for planning/prose inputs and outputs.
- Failure reason codes, fallback metadata, and source traces.
- Links back to the affected story, chapter, and Write inspector.

Operations must not approve prose, promote memory truth, or change editor document source-of-truth state.

## Memory Surface

Memory owns story truth review, not writing controls.

Primary responsibilities:

- Current canon facts, character state, relationship state, world rules, and lore.
- Candidate promotion review from #12.
- Conflict review and stale/superseded/draft-only classification.
- Arc and saga memory summaries.
- Links to affected Write or Timeline contexts when a conflict blocks writing.

Memory may expose operational links for batch analysis, but batch execution remains Operations.

## Timeline And Relationships Surfaces

The current Map Board covers part of Timeline/Structure, but issue #6 requires a first canvas data contract for Timeline and Relationships. This contract is UI-facing only and does not define database ownership.

### Timeline Canvas Data Needs

| Element | Required fields | Source owner |
|---|---|---|
| Chapter node | `chapter_id`, title/label, draft/approved/readiness status, word count when available. | Document/editor boundary and writing pipeline adapters. |
| Scene/event node | `event_id` or compatibility `scene_id`, chapter id, sequence, summary, status, source trace. | Timeline/memory adapters. |
| Causal edge | source event, target event, relation type, confidence/currentness, conflict status. | Memory/timeline adapters. |
| Open loop marker | loop id, description, urgency, opened/resolved chapter, currentness. | #11/#12 memory contract adapters. |
| Continuity gap marker | reason code, affected chapter/event, severity, suggested resolving surface. | #11 preflight/debug metadata. |
| Structural metric | beat coverage, orphan scenes, overdue threads, validation issues. | Current map metrics until replaced by timeline adapter. |

### Relationships Canvas Data Needs

| Element | Required fields | Source owner |
|---|---|---|
| Entity node | entity id, display name, type, current state summary, confidence/currentness. | Memory contract adapters. |
| Relationship edge | source entity, target entity, relation type, current state, polarity/tension when available, confidence/currentness. | Memory and relationship-state adapters. |
| Evidence reference | source table/system, source id, chapter id, quote/range or summary, timestamp/hash when available. | #3/#11 source metadata. |
| Conflict marker | conflict status, reason code, competing values, required resolving surface. | Memory conflict review. |
| Timeline anchor | event id/chapter id, currentness, causal relation to the edge or state. | Timeline adapter. |

Canvas scope rule:

- Timeline answers sequence and causality.
- Relationships answers current entity state and edges.
- A coordinated view may show both, but each datum must retain its owner and source trace.
- The canvas must show decision context first, not every historical fact at once.

## Publish Surface

Publish exists after the editor/document boundary becomes concrete.

Primary responsibilities:

- Approved document revision list.
- Export snapshot status.
- Platform-specific export settings.
- Reader preview from approved document/export state.
- Export diagnostics such as lossiness or unsupported formatting.

Publish must not consume raw AI payloads, unapproved editor drafts, or scene compatibility text as final source once #5 implementation exists.

## Navigation Rules

- Primary story navigation should expose product surfaces: Write, Memory, Timeline, Relationships, Publish, Operations.
- Operations should be reachable from blocked/error states and from a global runtime indicator, but worker controls should not occupy the primary writing header.
- Write may link to Memory or Relationships when a conflict blocks generation.
- Memory may link back to Write when a candidate or conflict affects the active chapter.
- Timeline and Relationships may link to Write by chapter/event, but must not embed the full writing editor.

## Implementation Sequencing

No UI implementation should begin until a child task lists file manifests and quality gates.

Recommended sequence:

1. Move global worker/llama controls from App shell into an Operations page or drawer, leaving a compact runtime indicator.
2. Replace inline AutoWrite raw JSON blocks with a job/context inspector entry.
3. Simplify Write completion into prose review, readiness summary, save/import action, and explicit blocked/degraded state.
4. Convert Write dock tabs into stable cards: Readiness, Memory/Continuity, Assist, Review.
5. Align legacy scene controls with a legacy scene inspector or remove them after the document editor flow exists.
6. Draft Timeline and Relationships canvas adapters after #3/#11/#12 data ownership is stable enough for implementation.

## Non-Goals

- No visual redesign implementation.
- No component or route changes.
- No database migration.
- No prompt or worker changes.
- No notification implementation.
- No creation of new issue scope beyond #6.
- No removal of current working debug controls before replacement surfaces exist.
- No claim that Timeline or Relationships owns memory truth.

## Acceptance Criteria Mapping

| Issue #6 criterion | Contract answer |
|---|---|
| Current UI buttons/data in writing-related screens are classified by necessity. | See `Current Control Classification`. |
| First simplified Write surface is documented. | See `Simplified Write Surface`. |
| Memory, Timeline, Relationships, Publish, and Operations surfaces have clear responsibilities. | See `Surface Map` and per-surface sections. |
| Debug/worker/pipeline controls are assigned to Operations or inspector surfaces. | See `Current Control Classification` and `Operations Surface`. |
| Relationship/timeline canvas has a first data contract draft. | See `Timeline And Relationships Surfaces`. |
| Write UI information architecture reflects #3, #5, #11, and #12 ownership boundaries instead of inventing new data ownership. | See `Reference inputs`, `Simplified Write Surface`, `Canvas scope rule`, and `Publish Surface`. |

## Review Focus

Reviewers should check:

- Whether any primary Write control still requires the writer to understand worker internals.
- Whether every moved debug or recovery control has a replacement target.
- Whether the simplified Write surface depends on #3/#5/#11/#12 instead of becoming a new source of truth.
- Whether Timeline and Relationships remain scoped to decision context instead of becoming a noisy all-data dashboard.
