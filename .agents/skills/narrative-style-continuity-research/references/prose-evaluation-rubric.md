# Prose Evaluation Rubric

Purpose: provide a compact, repeatable rubric for reviewing generated chapter
prose, A/B model comparisons, and research-backed writing quality claims.

## Required Inputs

For local A/B or generated-chapter review, inspect only the needed artifacts:

```text
.runtime/ab-compare-*/COMPARISON.md
.runtime/ab-compare-*/case*-prose.md
.runtime/ab-compare-*/case*-status.json
.runtime/ab-compare-*/worker_*.log
.runtime/ab-compare-*/source-chapters-*.tsv
.runtime/ab-compare-*/source-memory-snapshots-*.tsv
.runtime/ab-compare-*/source-memory-rollups-*.tsv
```

Use status/log files for runtime conclusions. Use source chapters and memory
exports for canon, continuity, and style-grounding conclusions.

## Literary Evaluation Axes

Score each axis from 1 to 5, where 1 is failing, 3 is usable draft, and 5 is
publication-candidate after human line edit.

```text
1. Canon grounding
   Does the draft preserve known facts, timeline, character state, world rules,
   and unresolved loops?

2. Causal progression
   Does the scene change the story state through discovery, decision,
   consequence, reversal, or sharpened stakes?

3. Scene objective and pressure
   Do characters want something concrete, meet resistance, and leave the scene
   with a changed tactical or emotional position?

4. Character agency
   Do character choices drive the chapter rather than exposition or repeated
   explanation carrying the prose?

5. Sensory embodiment
   Does imagery create reader simulation through concrete physical details
   rather than generic atmosphere?

6. Emotional specificity
   Are fear, curiosity, dread, desire, grief, or resolve anchored to exact
   character perception and action?

7. Style continuity
   Does cadence, diction, point of view, interiority, paragraph shape, dialogue
   texture, and motif use match the selected style_gold source?

8. Information control
   Does the draft reveal enough to advance the plot while preserving mystery and
   avoiding premature exposition?

9. Repetition and padding control
   Does the draft avoid recycled phrases, dialogue loops, circular beats,
   repeated scene locations, and restated decisions?

10. Prose artifact hygiene
    Does the draft avoid prompt-language leakage, all-caps logical connectors,
    meta commentary, malformed quotes, encoding errors, and schema artifacts?

11. Pipeline readiness
    Did critic, refinement, staging, and persistence complete? If not, review
    the prose as a stylist artifact only, not a finalized chapter.
```

## Quantitative Checks

These checks are not a substitute for reading the prose, but they catch common
LLM failure modes quickly:

```text
word_count
sentence_count
paragraph_count
dialogue_quote_count
repeated_trigram_excess
top_repeated_trigrams
all_caps_connector_count
status_json.final_review_ready
status_json.staging_ready
latest failed task and error code
critic max_tokens and schema failures from worker logs
```

Interpretation:

- High repeated-trigram excess usually indicates looped prose or padding.
- A low word count is not automatically bad if the chapter state changes.
- A high word count is not automatically good if it repeats the same beat.
- All-caps connectors such as `BUT`, `IF`, and `THEN` usually indicate prompt
  scaffold leakage unless the style guide explicitly allows them.
- Failed critic or persistence means the comparison can judge prose quality but
  not end-to-end chapter completion.

## Research Basis

- Narrative transportation research treats engagement as attention, emotion,
  and mental imagery working together. For prose review, this supports checking
  sensory embodiment and emotional specificity rather than only factual
  correctness.
- Reader-model and storyworld-state research supports evaluating what the
  reader now believes changed after the scene.
- Plot-planning and long-story coherence research supports judging causal
  progression, state handoff, and explicit continuity checks before approving a
  draft.
- Authorship-style research supports separating style signals from topical
  content, so names, lore terms, and setting nouns should not be mistaken for
  style match.

## Comparative Reading Heuristics

Use well-known long-fiction patterns as analogies, not as imitation targets:

- Epic speculative fiction such as `Dune` often advances plot by tying personal
  choice to ecology, politics, religion, and resource pressure. The lesson for
  Novel Lab review is that worldbuilding should create causal pressure, not sit
  as inert lore.
- Historical survival epics such as `Gone with the Wind` are driven by a
  protagonist's adaptation under social collapse. The lesson is to track
  character survival logic and moral trade-offs, while avoiding uncritical reuse
  of the source's historical ideology.
- Progression fantasy and web serials such as `Shadow Slave` often sustain
  momentum through ordeal, system constraints, mystery escalation, and visible
  capability change. The lesson is to demand concrete state change even in
  short serial chapters.

Do not copy or closely imitate copyrighted prose. Extract reusable craft
principles only.

## Output Contract

When reviewing a generated chapter, return:

- `Verdict`: whether the draft is usable, needs rewrite, or is rejected.
- `Metric table`: scores for the axes above, with one-line evidence.
- `Runtime status`: whether the pipeline finalized or only produced a stylist
  artifact.
- `Best evidence`: local files and, when used, public research sources.
- `Fix list`: concrete changes for prompts, model choice, worker config, or
  follow-up issues.
