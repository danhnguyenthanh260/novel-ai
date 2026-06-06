---
name: narrative-style-continuity-research
description: Use when researching or planning how Novel Lab should preserve author style, narrative coherence, chapter continuity, timeline order, character consistency, and source-grounded writing patterns across long fiction projects.
---

# Narrative Style Continuity Research

## Purpose

Turn long-fiction continuity and style questions into an evidence-backed plan
before changing extraction, memory, retrieval, chapter writing, or UI behavior.

Use this skill when the user asks whether ingested chapters are enough for
continuation, whether AI can preserve writing style, how timeline consistency
should be handled, or how scientific research should inform Novel Lab's writing
pipeline.

## Required Context

1. Read `AGENTS.md`.
2. Read `.agents/workflows/prompt-universe.md`.
3. Read `apps/studio/README.md` when the answer affects Studio workflows.
4. Read relevant surface skills:
   - `story-context-grooming` for extraction, memory, source trace, and context readiness.
   - `chapter-generation-workflow` for AutoWrite, planning, continuity checks, and draft staging.
   - `long-text-ingestion` when source chapters or imported prose are involved.
5. For research claims, use primary sources where possible: ACL Anthology,
   arXiv, peer-reviewed venues, or official paper pages.

## Reference Files

- `references/research-bibliography.md`: paper notes and design implications.
- `references/the-subcurrent-style-continuity-plan.md`: current application to
  the user's active story source captured under `.runtime/story-sources/the-subcurrent`.
- `references/prose-evaluation-rubric.md`: rubric for judging generated prose,
  A/B chapter outputs, repetition, causal progression, style continuity, and
  critic/persistence readiness.

Load only the reference file needed for the current task.

## Local Report Intake

When the user asks to evaluate a generated chapter, compare models, or mentions
an A/B report, first look for local evidence before making claims:

1. Read the comparison report, for example
   `.runtime/ab-compare-*/COMPARISON.md`.
2. Read the compared prose files, for example `caseA-*-prose.md` and
   `caseB-*-prose.md`.
3. Read the status/log files only for runtime claims, for example
   `case*-status.json`, `worker_*.log`, `start_worker.sh`, and probe scripts.
4. Read source context files only as needed for grounding checks, for example
   `source-chapters-*.tsv`, `source-memory-snapshots-*.tsv`, and
   `source-memory-rollups-*.tsv`.
5. If the report references a pipeline failure, inspect the named worker file
   only after confirming the failure from report/log evidence.

Do not treat a stylist prose artifact as a finalized chapter if critic,
refinement, staging, or persistence failed.

## Core Principles

- Separate `style anchor` from `story truth`.
  - Style anchor: polished prose used to infer cadence, diction, sentence rhythm,
    paragraph shape, point-of-view habits, image density, and dialogue texture.
  - Story truth: events, facts, character states, world rules, timeline anchors,
    unresolved questions, and causal links.
- Do not average weak chapters into the style profile with the same weight as
  polished chapters unless the user explicitly wants that style drift preserved.
- Treat style preservation as probabilistic, not guaranteed. Require measurable
  acceptance checks and human review.
- Treat timeline continuity as source-grounded state, not model memory. Every
  important event and state change needs source chapter, location, confidence,
  currentness, and conflict status.
- Long fiction generation should plan before drafting. The plan must include
  chapter intent, state handoff, causal bridge, character deltas, forbidden
  contradictions, and style target.
- Generated prose remains draft-only until explicit human approval.

## Recommended Workflow

1. Identify source quality bands:
   - `style_gold`: polished chapters or passages.
   - `continuity_source`: chapters that are canon/source truth even if style is weaker.
   - `draft_or_untrusted`: material useful only with caveats.
2. Extract two artifacts:
   - `Style Profile`: linguistic and literary features from `style_gold`.
   - `Continuity Ledger`: event, timeline, character, world, object, and open-loop facts from all approved source chapters.
3. Build a chapter handoff:
   - previous chapter end state
   - active characters and emotional state
   - unresolved questions
   - timeline position
   - causal pressure for the next chapter
   - forbidden reveals or contradictions
4. Create a detailed outline before prose:
   - high-level chapter purpose
   - scene beats
   - entity/event state updates
   - style constraints
5. Draft with retrieval:
   - retrieve chronological events first, then semantically relevant facts.
   - preserve event order when building context.
   - include style exemplars from `style_gold`, not from all chapters equally.
6. Validate output:
   - style delta against the style profile
   - event and timeline contradictions
   - character state contradictions
   - unresolved loop handling
   - source trace coverage for high-impact facts
   - causal progression and scene state change
   - repetition, padding, and dialogue-loop risk
   - prompt artifacts or meta-connectors leaking into prose

## Output Contract

For research or planning, return:

- `Research basis`: papers used and what each supports.
- `Ingestion sufficiency`: whether available source is enough for style, truth,
  continuity, and timeline.
- `Style strategy`: which chapters/passages should act as style anchors and why.
- `Continuity strategy`: how events, character states, timeline, causality, and
  open loops should be represented.
- `Confidence limits`: what the AI cannot know for certain without human review.
- `Implementation implications`: likely files, data contracts, or workflows that
  would change if the user approves implementation.
- `Verification plan`: concrete checks for extraction, retrieval, generation,
  and human review.

For approved implementation planning, produce an issue-ready scope with file
manifest, acceptance criteria, quality gates, and rollback notes. Stop before
encoding a new data model, workflow, or product decision unless the user has
approved it.

## Guardrails

- Do not claim that ingestion alone guarantees future style or continuity.
- Do not treat model long context as a substitute for a source-grounded ledger.
- Do not let later weak prose override an earlier polished style anchor by default.
- Do not collapse timeline, character state, and world facts into one generic
  embedding bucket when chronological order matters.
- Do not promote generated continuations into canon or memory without approval.
