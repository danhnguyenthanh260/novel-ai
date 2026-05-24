---
name: story-context-grooming
description: Use when working on WritingContext, story memory, context extraction, context gaps, source traceability, context digest UI, source_doc ingestion, or converting long story material into structured context for generation.
---

# Story Context Grooming

## Trigger Conditions

Use this skill when the task touches:

- `apps/studio/src/features/writing-context/server/*`
- `apps/studio/src/features/autowrite/server/chapterWritingContextAssembler.ts`
- `apps/studio/src/features/autowrite/server/chapterContextService.ts`
- `apps/studio/src/features/analysis/server/truthPackGovernance.ts`
- `apps/studio/src/features/guard/server/storyContextBuilder.ts`
- `services/memory-bridge/worker_memory_context.py`
- `services/memory-bridge/worker_memory_rollup_v3.py`
- context digest, memory hub, source trace, or missing-context diagnosis

## Goal

Prepare enough story and chapter context for safe writing without dumping raw text into the main chat or silently treating draft, stale, or fallback data as clean current truth.

## Required Investigation Steps

1. Read `docs/architecture/writing-context-contract.md`.
2. Read `docs/architecture/chapter-writing-context-assembler.md`.
3. Read `docs/architecture/story-memory-contract.md` and `docs/architecture/post-write-memory-promotion-flow.md` when memory promotion or canon truth is involved.
4. Inspect the concrete builder or adapter under change.
5. If ingest/source text is involved, inspect:
   - `apps/studio/src/features/ingest/server/inputContract.ts`
   - `apps/studio/src/features/ingest/server/uploadParser.ts`
   - `db/migrations/000_baseline_20260502.sql`

## Implementation Rules

- Preserve the canonical readiness outcomes: `proceed`, `degraded`, and `blocked`.
- Minimum viable writing context needs story/chapter scope, chapter intent, usable continuity for non-initial chapters, and no unresolved hard conflict.
- Missing historical memory alone should not block writing.
- Missing intent, missing target chapter, unsafe continuity, hard current-state conflict, timeline conflict, or required forbidden reveal guard should block.
- Draft-only, stale, superseded, low-confidence, fallback-derived, and conflicting records must be explicit uncertainties.
- Every high-impact fact must keep source metadata: source system, table/function, id when known, chapter id when applicable, confidence/currentness/conflict status.
- Convert line-oriented context packs into structured slots before treating them as canonical.
- Keep raw payloads and debug detail in Operations or inspector surfaces. Everyday Write UI should show summarized readiness and recovery.
- For long pasted/imported story material, use `source_doc` and ingest/task contracts for traceability when supported.

## Forbidden Actions

- Do not let lower-priority memory override higher-priority approved current state.
- Do not treat `chapter_draft.full_text`, staging prose, or V3 ledger/rollup candidates as approved canon.
- Do not invent context from chat history when structured context is missing.
- Do not remove source trace to fit a budget. Drop or summarize lower-impact historical detail first.
- Do not hide legacy fallback behind a normal `proceed` state.

## Output Format

For context grooming work, report:

- Context source(s) changed.
- Readiness behavior changed.
- Source trace fields preserved.
- Degraded/block reason codes affected.
- Verification commands.

## Verification Requirements

- For TypeScript context changes, run `cd apps/studio && npm run typecheck`.
- Lint changed TypeScript files with `npx eslint <changed-files>`.
- For Python memory bridge context changes, run targeted `python3 -m unittest services/memory-bridge/tests/<test_file>.py` from the repo root.
- For strict `WritingContext` worker behavior, prefer `python3 -m unittest services/memory-bridge/tests/test_chapter_writer_context_strict.py`.
- Run `git diff --check`.

## Edge Cases

- Optional Qdrant/Neo4j retrieval unavailable: degrade, do not block if SQL/current continuity is safe.
- Placeholder values such as empty arrays, `N/A`, or missing world flags are unknowns, not facts.
- Budget trimming must preserve intent, forbidden reveals, blocking constraints, immediate continuity, current state, and source metadata before historical detail.
- If `writing_context` is present but malformed or blocked, workers must fail fast instead of falling back to old `working_set`.
