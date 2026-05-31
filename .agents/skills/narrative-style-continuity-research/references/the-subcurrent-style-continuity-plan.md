# The Subcurrent: Style and Continuity Plan

Source capture:

- Local positioning: `.runtime/story-sources/the-subcurrent/positioning.md`
- Local manifest: `.runtime/story-sources/the-subcurrent/manifest.json`
- Combined source: `.runtime/story-sources/the-subcurrent/the-subcurrent-combined.md`
- Captured chapters: 1-16

## User Context

The user says chapters 1-10 were written with high polish, while later chapters
were less polished. Treat that as an explicit author signal.

## Default Source Bands

```text
style_gold
  chapters 1-10

continuity_source
  chapters 1-16

style_caution
  chapters 11-16
```

Rationale:

- Chapters 1-10 should define prose style unless the user later marks a passage
  outside this range as polished.
- Chapters 11-16 may still contain real events, relationship changes, mystery
  clues, world rules, and timeline state. They should not be discarded.
- Chapters 11-16 should not pull the style profile toward weaker prose with the
  same weight as chapters 1-10.

## Is Ingestion Enough?

Ingestion is enough for raw source preservation only if it keeps chapter identity,
source text, hash/idempotency, and source pointers.

Extraction is enough for continuation only if it produces all of these:

- chapter-level timeline anchors
- event triples or event summaries with source chapter
- character state before and after important events
- relationship deltas
- world rules and anomaly behavior
- object/location state
- unresolved questions and open loops
- style profile from `style_gold`
- confidence/currentness/conflict metadata

If extraction only produces summaries or semantic chunks, it is not enough for
reliable timeline continuity.

## How AI Can Know the Style Pattern

It cannot know with certainty. It can only approximate and then be checked.

Use this pipeline:

1. Build a `Style Profile` from chapters 1-10:
   - sentence length bands
   - paragraph length bands
   - narration distance and point of view
   - degree of abstraction versus concrete action
   - dialogue/action/interiority ratio
   - recurring motif vocabulary
   - transition habits
   - pacing profile
   - forbidden drift patterns from chapters 11-16 if useful
2. Retrieve a small set of style exemplars from chapters 1-10 for each new draft.
3. Draft from a continuity ledger plus style exemplars, not from raw long context.
4. Run a style-delta review:
   - Does the draft over-explain?
   - Does it lose slow-burn restraint?
   - Does it shift diction or rhythm?
   - Does it flatten introspective texture?
   - Does it introduce unearned climax or exposition?
5. Human approval decides whether the draft is acceptable.

## Timeline Synchronization

Use a chronological ledger rather than a flat memory bucket.

Required ledger fields:

```text
event_id
source_chapter
source_span_or_quote_pointer
story_time_order
surface_order
entities
event_summary
cause
effect
character_state_before
character_state_after
world_rule_or_anomaly_change
open_loop_created
open_loop_resolved
confidence
currentness
conflict_status
```

Generation should retrieve:

1. immediate previous-chapter handoff
2. active character states
3. unresolved open loops relevant to the chapter target
4. chronological events that causally constrain the next chapter
5. style exemplars from chapters 1-10

## Recommended Next Skill Work

If the user approves product implementation, create an implementation plan for:

- style-band metadata during ingest or analysis
- source chapter weighting for style extraction
- continuity ledger extraction quality gates
- chronological retrieval for chapter writing context
- style-delta and continuity-delta reports before approval

Do not change runtime behavior until the data contract and human approval flow
are explicitly approved.
