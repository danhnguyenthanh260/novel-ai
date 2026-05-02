# Post-Write Memory Promotion Flow

Issue: #12
Status: Contract draft
Last updated: 2026-05-02

## Purpose

Post-write promotion defines how chapter prose becomes future story memory after writing. It closes the loop between chapter N and chapter N+1: approved prose creates extraction candidates; candidates are reviewed or trusted by policy; promoted memory becomes usable by the chapter writing context assembler.

This document is contract-level only. It does not implement schema, routes, workers, prompts, editor storage, UI, or publishing adapters.

Approved near-term automated path:

```text
CHAPTER_WRITE_V3 -> CHAPTER_LEDGER_EXTRACT -> MEMORY_ROLLUP_V3
```

Approved future prose source:

```text
approved document/chapter revision -> extraction candidates -> promoted story memory -> WritingContext for chapter N+1
```

## Source State Flow

| Source state | Meaning | Memory behavior |
|---|---|---|
| `AI generated draft` | Output from `CHAPTER_WRITE_V3`, `chapter_draft.full_text`, staging prose, or equivalent runtime output. | May create draft-only extraction candidates. Must not promote directly to current memory. |
| `Imported editor draft` | AI or legacy prose imported into document blocks for human editing. | Remains draft-only. Edits do not mutate memory. |
| `Human editor draft` | User-edited document revision that is not approved. | Remains draft-only. May be analyzed for preview diagnostics only. |
| `Approved document revision` | Explicitly approved document/chapter content from #5 boundary. | May trigger extraction for promotion candidates and publishing/export state. |
| `Approved legacy compatibility source` | Existing scene/version source accepted by a temporary legacy policy. | May trigger extraction only when a child task documents the legacy approval policy. |
| `Promoted memory` | Candidate accepted by human review or trusted gate. | May feed `WritingContext.current_state` or `historical_memory` according to category/currentness. |

## Candidate Taxonomy

Extraction must produce candidates, not direct canon writes.

| Candidate type | Meaning | Promotion target |
|---|---|---|
| `fact` | A durable fact about entity, place, object, rule, or situation. | `canon_fact` or equivalent durable fact memory. |
| `event` | Something that happened in prose and may explain future state. | Historical event memory and timeline evidence. |
| `character_state_change` | Location, status, injury, role, motivation, knowledge, possession, or ability change. | Current or historical `character_state`. |
| `relationship_state_change` | Trust, conflict, alliance, obligation, secrecy, hierarchy, or emotional distance between entities. | Current or historical `relationship_state`. |
| `emotion_state_change` | Chapter or entity affective state that matters later. | `emotion_state` when entity-specific; style/scene guidance when chapter-level only. |
| `open_thread` | New unresolved question, promise, risk, mystery, objective, or hook. | Current open-thread memory. |
| `closed_thread` | Existing thread resolved, abandoned, deferred, or transformed. | Closed-thread memory with source reference to the prior open thread when available. |
| `lore_addition` | New worldbuilding, rule, place, history, object, power, social fact, or constraint. | World rule, lore, or canon fact depending on impact. |
| `style_signal` | Reusable tone, pacing, perspective, density, motif, or author-style evidence. | Style memory only; never canon override. |
| `continuity_issue` | Contradiction, missing bridge, unresolved conflict, impossible timeline, or source mismatch. | Review/operations issue; not story memory until resolved. |

## Truth Classification

Every candidate must carry one truth classification:

| Classification | Meaning | Default promotion behavior |
|---|---|---|
| `durable_fact` | Narrator-level or system-level story truth from approved content. | Eligible for current or historical memory after gate. |
| `character_belief` | What a character believes, knows, misunderstands, hides, or suspects. | Eligible only as belief/POV memory, not global fact. |
| `uncertain_inference` | Plausible inference not explicitly established by approved content. | Requires human approval before current memory. |
| `draft_only_observation` | Extracted from unapproved AI/editor draft or preview analysis. | Not promotable until source revision is approved. |
| `rejected` | Reviewed and rejected as false, irrelevant, duplicated, or unsafe. | Must not feed future context except as debug/audit history. |
| `superseded` | Was valid but replaced by newer approved content or retcon. | Historical/debug only; not current state. |

Belief rule: a character belief cannot be promoted as `durable_fact` unless approved content establishes it as objectively true.

## Promotion States

Promotion state is separate from candidate type and truth classification.

| State | Meaning | May feed `WritingContext`? |
|---|---|---:|
| `candidate` | Extracted and waiting for gate/review. | No, except debug/preview. |
| `needs_review` | Candidate is high impact, conflicting, uncertain, or low confidence. | No. |
| `approved` | Candidate passed human review or trusted gate. | Yes, after currentness resolution. |
| `promoted_current` | Approved candidate is the best current value at target chapter boundary. | Yes, as `current_state`. |
| `promoted_historical` | Approved candidate explains past events but is not current. | Yes, as `historical_memory`. |
| `rejected` | Candidate was rejected. | No. |
| `superseded` | Candidate was replaced by later approved memory. | Historical/debug only. |
| `stale` | Candidate or promoted memory is unsafe because of retcon or downstream invalidation. | No current-state usage. |

## Trigger Rules

Approved future trigger:

```text
approved document revision
  -> plain-text extraction with document/revision source trace
  -> candidate taxonomy
  -> promotion gate
  -> durable promoted memory
  -> #11 assembler source priority for next chapter
```

Near-term V3 trigger:

```text
CHAPTER_WRITE_V3 output
  -> CHAPTER_LEDGER_EXTRACT
  -> chapter_ledger candidates
  -> MEMORY_ROLLUP_V3 summary/rollup candidates
  -> promotion gate before current-state authority
```

Rules:

- Draft output may run extraction for preview, diagnostics, or ledger candidates, but stays `draft_only_observation`.
- Approved document revision is the first normal source allowed to create promotion-eligible candidates.
- A trusted automated gate may auto-promote low-risk candidates only when a future child task defines the gate, thresholds, rollback, and audit fields.
- High-impact state changes, relationship changes, forbidden reveal changes, timeline changes, and conflicts require human review unless explicitly covered by a trusted gate.
- Continuity issues block promotion for affected candidates until resolved or accepted as intentional.

## Category Promotion Rules

| Category | Promotion rule |
|---|---|
| `fact` | Promote as current only if approved source states it directly and no higher-priority current source conflicts. Otherwise mark uncertain or historical. |
| `event` | Promote as historical event with source trace; update current state only through explicit state-change candidates. |
| `character_state_change` | Promote one current value per entity/property unless conflict is intentional and represented. Supersede older current values. |
| `relationship_state_change` | Promote with participants, directionality, confidence, and currentness. Conflicts require review. |
| `emotion_state_change` | Entity-specific emotion may become current/historical state; chapter-level mood remains guidance unless reviewer promotes it. |
| `open_thread` | Promote when approved prose creates an unresolved promise/question/objective. Include urgency and origin source when available. |
| `closed_thread` | Promote only when it references an existing open thread or enough evidence to avoid accidental closure. |
| `lore_addition` | Promote as world rule/lore only when approved content establishes it beyond a passing draft detail. |
| `style_signal` | Promote to style memory when repeated or reviewer-approved. It cannot override canon, current state, or forbidden reveals. |
| `continuity_issue` | Do not promote as story memory. Keep as review/operations state that can block or degrade affected promotions. |

## Conflict And Supersession Rules

- A new approved candidate that changes an existing current value must supersede the old current value rather than delete it.
- Superseded memory remains historical with source trace unless it was rejected as extraction error.
- A retcon or approved edit to chapter N must mark downstream chapter ledgers, milestones, and promoted candidates stale until revalidated.
- If two approved sources conflict and neither supersedes the other, affected memory is `conflicting` and must not feed `WritingContext.current_state`.
- If a candidate conflicts with forbidden reveals or POV knowledge, it must become `needs_review`.

## Failure And Degraded Behavior

| Condition | Required behavior |
|---|---|
| Extraction task fails | Keep approved prose source intact; mark extraction status failed; do not promote partial candidates silently. |
| Candidate JSON is malformed | Reject malformed candidate batch or isolate invalid candidates with diagnostics. |
| Continuity audit finds critical issue | Block affected promotions until resolved, accepted, or manually overridden. |
| Low confidence extraction | Mark `needs_review` or `uncertain_inference`; do not auto-promote. |
| Rollup unavailable | Candidate memory may remain chapter-scoped; assembler must degrade if no promoted current memory exists. |
| Retcon invalidates downstream memory | Mark downstream ledgers, rollups, and promotions stale; assembler must exclude stale current state. |
| External memory store unavailable | Durable SQL memory remains source of truth; external index refresh can retry later. |

## Relationship To Current V3 Surfaces

| Current surface | Current behavior | Promotion contract role |
|---|---|---|
| `chapter_ledger` | Stores `added_facts`, `modified_states`, `resolved_loops`, `unresolved_loops`, stale fields, and metadata. | Treat as chapter-scoped extraction candidates until approval/promotion semantics exist. |
| `chapter_continuity_issue` | Stores audit findings with severity and payload. | Can block or degrade affected promotion candidates. |
| `story_milestone` | Stores V3 rollup summaries and merged `world_state`, with stale fields. | Treat as rollup/historical support unless candidate approval marks it current. |
| `writing_snapshot_v3` | Stores analysis readiness, fact status, open loops, emotional target, degraded mode, approval status, and truth context pack. | Can provide approved analysis evidence; snapshot JSON still needs category normalization. |
| `invalidateDownstream` | Marks downstream ledgers and milestones stale after retcon. | Future promotion records must follow the same invalidation rule. |

Evidence:

- `chapter_ledger` schema includes stale fields at `db/migrations/000_baseline_20260502.sql:1043`.
- `story_milestone` schema includes stale fields at `db/migrations/000_baseline_20260502.sql:2778`.
- `writing_snapshot_v3` includes `approval_status`, `fact_status`, and readiness fields at `db/migrations/000_baseline_20260502.sql:3575`.
- `process_chapter_ledger_task` writes `chapter_ledger` and `chapter_continuity_issue` at `services/memory-bridge/worker_task_handlers.py:2088`.
- `process_memory_rollup_v3_task` calls `run_memory_rollup_v3` at `services/memory-bridge/worker_task_handlers.py:2199`.
- `run_memory_rollup_v3` merges ledger facts/state into `story_milestone` at `services/memory-bridge/worker_memory_rollup_v3.py:8`.
- `invalidateDownstream` marks downstream ledgers and milestones stale at `apps/studio/src/features/autowrite/server/writingPipelineService.ts:640`.

## Handoff To Chapter N+1

Before chapter N+1 assembly:

1. Approved chapter N source must be known.
2. Extraction candidate batch must have a status.
3. Promotions affecting current state must be either approved/promoted or explicitly unavailable.
4. Stale, rejected, superseded, draft-only, and conflicting candidates must be excluded from `current_state`.
5. Missing promoted memory must be visible to #11 as degraded context, not silently filled from historical memory.

The #11 assembler may use:

- `promoted_current` for `current_state`;
- `promoted_historical` for `historical_memory`;
- unresolved promoted threads for `open_threads`;
- approved style signals for `style_anchor`;
- promotion diagnostics for debug output;
- unavailable or failed promotion as degraded reasons.

## Future Schema Shape

Future implementation should consider a durable promotion state family, but this issue does not create migrations.

Required fields for future schema:

- source story/chapter/document revision ids;
- source text hash;
- extraction run id and extractor version;
- candidate type and truth classification;
- source quote/range or block reference when available;
- source trace;
- confidence;
- promotion state;
- currentness;
- conflict/supersession references;
- reviewer/trusted-gate metadata;
- stale flag and stale reason;
- created/updated timestamps.

## Non-Goals

- No database migration.
- No worker implementation.
- No prompt tuning.
- No editor storage or UI.
- No memory candidate review UI.
- No publishing adapter.
- No queue taxonomy cleanup.
- No automatic promotion of V3 ledger/rollup outputs as final canon.
- No runtime behavior change inside this contract issue.

## Acceptance Criteria Mapping

| Issue #12 criterion | Contract answer |
|---|---|
| Flow from generated prose to edited prose to approved prose to memory candidates is documented. | See `Source State Flow` and `Trigger Rules`. |
| Candidates distinguish fact, belief, uncertainty, draft-only, rejected, and superseded memory. | See `Candidate Taxonomy` and `Truth Classification`. |
| Character, relationship, emotion, causal event, thread, and lore promotion rules are defined. | See `Category Promotion Rules`. |
| Promotion requires approval or trusted gate before future AutoWrite treats a candidate as current. | See `Promotion States` and `Trigger Rules`. |
| `CHAPTER_LEDGER_EXTRACT` and `MEMORY_ROLLUP_V3` participation is defined. | See `Near-term V3 trigger` and `Relationship To Current V3 Surfaces`. |
| Chapter N updates inputs for chapter N+1 context assembly. | See `Handoff To Chapter N+1`. |
| Failure, degraded, and partial extraction states are documented. | See `Failure And Degraded Behavior`. |

## Known Unknowns

- Which exact candidates can use trusted auto-promotion without human review.
- Whether the first durable promotion schema should be a generic candidate table or category-specific tables.
- Whether memory candidate review belongs in Memory, Reviews, Operations, or the simplified Write surface.
- How approved legacy scene versions should be promoted during the editor migration window.
- Whether rollup should run before or after human candidate review once durable promotion state exists.
