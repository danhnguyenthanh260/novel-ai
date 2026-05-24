---
name: chapter-generation-workflow
description: Use when implementing or debugging chapter planning, AutoWrite, CHAPTER_WRITE_V3, chapter writing status polling, staged draft output, retry/replan/refine behavior, or chapter generation acceptance checks.
---

# Chapter Generation Workflow

## Trigger Conditions

Use this skill when the task touches:

- `apps/studio/src/features/scenes/components/writeTab/AutoWriteWizard.tsx`
- `apps/studio/src/app/api/stories/[slug]/chapters/[chapterId]/*`
- `apps/studio/src/features/scenes/server/scenesApiService.ts`
- `apps/studio/src/features/scenes/server/workflow/steps/chapterPlanning.ts`
- `apps/studio/src/features/scenes/server/workflow/steps/chapterWriting.ts`
- `apps/studio/src/features/autowrite/server/writingPipelineService.ts`
- `services/memory-bridge/worker_chapter_writer.py`
- `services/memory-bridge/worker_chapter_ledger_extractor.py`
- `services/memory-bridge/worker_memory_rollup_v3.py`

## Goal

Keep chapter generation deterministic and inspectable: validate inputs, assemble/write with `WritingContext`, emit progress/artifact/recovery events, preserve draft-only status, and stop safely on blocked context.

## Required Investigation Steps

1. Read `apps/studio/README.md` sections on API, workflow scenes, and Write workspace chat contracts.
2. Read `docs/architecture/chapter-writing-context-assembler.md`.
3. Read `docs/architecture/writing-context-contract.md`.
4. Inspect the route handler and service function for the target endpoint.
5. Inspect `AutoWriteWizard.tsx` if user-visible generation flow changes.
6. Inspect worker code when task types or payloads change.

## Implementation Rules

- Expected chapter generation inputs include story slug/id, `chapterId`, `target_word_count`, `user_prompt`, `writing_intent_mode`, and a plan or chapter intent.
- Planning must run before canonical chapter writing unless the task is explicitly a status/read-only operation.
- Blocked plans return a user-recoverable state such as `BLOCKED_BY_CONFLICT_REVIEW` or `BLOCKED_BY_CANON_CONFLICT`, not a silent write.
- Canonical near-term prose path is `CHAPTER_WRITE_V3 -> CHAPTER_LEDGER_EXTRACT -> MEMORY_ROLLUP_V3`.
- `WritingContext` and preflight metadata must travel in the `CHAPTER_WRITE_V3` payload when assembled.
- Generated prose is draft-only until explicit approval. Do not feed it to canon memory, reader, or publishing as approved content.
- Progress belongs in `workflow_progress`; plan/draft/review summaries belong in `artifact_preview`; blocked terminal states belong in `failure_recovery`.
- Retry behavior must distinguish refine from replan and reuse stored plan only when safe.
- Stage/save behavior must preserve draft semantics and avoid claiming durable document approval.

## Forbidden Actions

- Do not bypass preflight because UI state appears ready.
- Do not collapse plan blocked states into generic 500 errors.
- Do not write long generated prose into the chat timeline.
- Do not make legacy `NARRATIVE_*` or scene-level AutoWrite v1 the default for new chapter-first work.
- Do not run destructive split/resplit/reset behavior without explicit user intent.

## Output Format

For chapter generation changes, report:

- Endpoint/component/worker changed.
- Inputs validated.
- Progress/artifact/recovery events affected.
- Draft/output state affected.
- Verification run and any manual acceptance checks.

## Verification Requirements

- From `apps/studio`, run `npm run typecheck`.
- Run `npm run build` before final completion when feasible.
- Lint changed files only with `npx eslint <changed-files>`.
- For worker changes, run targeted Python tests and `python3 -m py_compile` on changed worker files.
- For context strictness, run `python3 -m unittest services/memory-bridge/tests/test_chapter_writer_context_strict.py`.

## Edge Cases

- Missing chapter intent blocks planning/writing.
- Missing continuity for non-initial chapters blocks or degrades per `WritingContext` rules.
- Conflict review and canon conflict must preserve plan details and recovery actions.
- Status polling can return job not found, failed task, draft unavailable, staging ready, or terminal failure.
- Retcon mode requires explicit intent and must not silently rewrite established canon.
