---
name: long-text-ingestion
description: Use when handling pasted or uploaded long story text, mega files, ZIP chapter imports, source_doc traceability, chapter splitting, or converting large prose into context artifacts instead of chat messages.
---

# Long Text Ingestion

## Trigger Conditions

Use this skill when the task touches:

- long pasted text in chat or ingest
- `PASTE_TEXT`, `MEGA_FILE`, or `ZIP_UPLOAD`
- `source_doc`, source hashes, split drafts, chapter split approval, or context artifacts
- `apps/studio/src/features/ingest/server/inputContract.ts`
- `apps/studio/src/features/ingest/server/uploadParser.ts`
- `apps/studio/src/features/ingest/server/ingestJobsService.ts`
- `apps/studio/src/features/ingest/components/ingestJobs/panels/*`

## Goal

Keep long source material traceable and manageable. Chat should summarize and route long content; ingest/source-doc flows should preserve the original text, source path/name, chapter mapping, and hash/idempotency metadata.

## Required Investigation Steps

1. Read `apps/studio/README.md` ingest section.
2. Inspect `inputContract.ts` and `uploadParser.ts`.
3. Inspect `ingestJobsService.ts`, `ingestValidateService.ts`, and split draft panels when source-doc or split behavior changes.
4. Inspect `db/migrations/000_baseline_20260502.sql` for `source_doc`, `ingest_job`, and `ingest_task` fields when storage changes.
5. If chat behavior changes, also use `chat-first-workspace` and inspect timeline block contracts.

## Implementation Rules

- Keep short user intent in chat; convert long story/source material into ingest input, source document, or artifact flow when supported.
- `PASTE_TEXT` supports a single pasted text and optional chapter number.
- `MEGA_FILE` supports chapter markers such as `=== CHAPTER N ===` or `# Chapter N`.
- `ZIP_UPLOAD` expects chapter-like filenames and UTF-8 text.
- In manual split mode, scene delimiters are required; in auto split mode, missing delimiters can be handled by worker split.
- Preserve original source text through `source_doc` when the flow supports it.
- Preserve source identity: source path/name, chapter number, `source_doc_id`, `source_doc_sha256`, source type/role, and character length.
- Summaries must point back to source docs or artifact references. Do not replace the original.
- Split approval should operate from source pointers where available, not duplicated raw chapter text.

## Forbidden Actions

- Do not paste huge chapter drafts into the main chat timeline as assistant/user message content.
- Do not summarize long text without preserving the original source somewhere durable or explicitly saying it is only a temporary summary.
- Do not drop markdown/code fences silently; either preserve as source text or explain unsupported formatting.
- Do not treat imported text as approved canon or final prose.
- Do not create new dependencies for simple validation/parsing.

## Output Format

For long-text ingestion work, report:

- Input mode affected.
- How original text is preserved.
- How chapter/source trace is exposed.
- Split/validation behavior changed.
- Verification run.

## Verification Requirements

- Run `cd apps/studio && npm run typecheck`.
- Lint changed files with `npx eslint <changed-files>`.
- Use relevant doctor scripts only when infrastructure/API is running, for example `npm run doctor:ingest-validate` or `npm run doctor:ingest-upload`.
- For Python split worker changes, run targeted tests under `services/memory-bridge/tests`.
- Run `git diff --check`.

## Edge Cases

- Pasted markdown with chapter headings.
- Code blocks or delimiter-like text inside prose.
- Malformed UTF-8 upload: return explicit encoding error.
- Huge single chapter with no delimiters: prefer auto split plus diagnostics, not one raw chat blob.
- Duplicate source text: preserve idempotency through hash behavior.
- Split artifact coverage gaps or oversized chunks: surface operator guidance, not silent approval.
