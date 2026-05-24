---
name: agent-progress-panel
description: Use when changing workflow progress cards, thinking/progress display, right inspector progress mode, pipeline status summaries, streaming states, cancellation/retry state, or separation of chat content from workflow telemetry.
---

# Agent Progress Panel

## Trigger Conditions

Use this skill when the task touches:

- `workflow_progress` timeline events or blocks
- `apps/studio/src/features/scenes/components/writeTab/ArtifactInspectorRail.tsx`
- `apps/studio/src/features/scenes/components/writeTab/chatOrchestration/workflowProgressEvents.ts`
- `apps/studio/src/features/scenes/components/writeTab/chatOrchestration/TimelineBlocks.tsx`
- `apps/studio/src/features/chat-orchestration/server/timelineEvents.ts`
- pipeline inspector components under `apps/studio/src/features/ingest/components/pipelineJob/*`
- active job status, cancel, retry, replan, refine, or streaming UI state

## Goal

Show useful agent/workflow progress without making the writer parse logs or model internals. The chat timeline stays compact; the right inspector owns detailed step state.

## Required Investigation Steps

1. Read `docs/operations/specs/studio-chat-orchestration-layer.md`, especially `workflow_progress` and block source ownership.
2. Read `docs/architecture/conversational-command-orchestrator.md` for lifecycle states.
3. Inspect `TimelineBlocks.tsx`, `workflowProgressEvents.ts`, and `ArtifactInspectorRail.tsx`.
4. If backend events change, inspect `apps/studio/src/features/chat-orchestration/server/timelineEvents.ts`.
5. If pipeline job details change, inspect `PipelineJobClient.tsx`, `NodeInspectorPanel.tsx`, and `pipelineGraphService.ts`.

## Implementation Rules

- Use `workflow_progress` for execution state: workflow name, status, current step, total steps, and safe labels.
- Progress details in the right inspector may be denser than the chat timeline, but still must avoid raw logs as the default.
- Chat text may acknowledge backend progress but must not invent backend event payloads.
- Keep progress non-intrusive: composer remains available unless a specific command form requires preflight.
- Separate progress telemetry from user/assistant prose messages.
- Prefer lifecycle states from the orchestrator contract: `proposed`, `waiting_approval`, `running`, `degraded`, `blocked`, `failed`, `done`, `cancelled`.
- Cancellation/retry/replan/refine actions must be represented as explicit controls or recovery actions, not hidden state changes.

## Forbidden Actions

- Do not expose model scratchpad, chain-of-thought, stack traces, or raw worker logs in the primary progress card.
- Do not use progress blocks for long artifact content.
- Do not mark failed/cancelled runs as complete.
- Do not auto-discard failed drafts.
- Do not route routine progress inspection away from Write when the right inspector can show it.

## Output Format

For progress panel work, report:

- Progress source changed: backend event, timeline block, inspector, or pipeline surface.
- States covered: running, complete, failed, cancelled, blocked/degraded if applicable.
- What remains in chat versus inspector.
- Verification run.

## Verification Requirements

- Run `cd apps/studio && npm run typecheck`.
- Lint changed files with `npx eslint <changed-files>`.
- If event mapping changes, verify `workflowProgressEvents.ts` and `timelineEvents.ts` behavior through existing or new targeted tests after confirming a runnable test command.
- Manually inspect long progress lists for internal scrolling when UI changes are involved.

## Edge Cases

- Job exists but tasks are empty.
- Latest task failed while job status is still running.
- Backend emits unknown task type: render a safe lower-case label.
- Cancelled/canceled spelling differences should normalize to `cancelled`.
- Inspector with long progress must scroll internally and not move the composer.

## Common Failure Modes

- Generated prose or long artifact body is rendered inside a
  `workflow_progress` block.
  - Symptom: the progress card grows into a wall of prose, drowning the
    actual progress signal.
  - How to apply: route long content through `artifact_preview` and the
    right artifact workspace. Progress blocks stay compact.

- Failed/cancelled runs are rendered as `complete` or silently dropped.
  - Symptom: an aborted run appears successful, or a failed run leaves
    the timeline without a terminal block.
  - How to apply: always emit a terminal state matching the orchestrator
    lifecycle (`failed`, `cancelled`, `blocked`, `done`). Do not
    auto-discard the failed draft.

- Chat prose invents progress payloads or step counts the backend never
  emitted.
  - Symptom: assistant text claims `step 3/5` or names a workflow stage
    that does not exist in `workflowProgressEvents.ts`.
  - How to apply: assistant prose may acknowledge progress qualitatively,
    but `workflow_progress` data must originate from the backend event.

- Inspector progress mode renders raw worker logs, stack traces, or
  chain-of-thought.
  - Symptom: scrolling the right panel reveals internal `print(...)`
    output or model scratchpad.
  - How to apply: inspector may be denser than chat, but it still
    surfaces typed states and safe labels, not raw worker output.

## Evidence

- Source: `docs/operations/specs/studio-chat-orchestration-layer.md`
  block registry and source ownership rules.
- Source: `docs/architecture/conversational-command-orchestrator.md`
  lifecycle states.
- Source: PRs #114-#116 (`add chat timeline composer`, `emit workflow
  timeline events`, `wire chat intents to workflow preflight`).
- Source: commit `5a5a45a` (`fix: align chat timeline block contracts`).
- Reason: these failure modes were the original drivers behind the
  block-source-ownership rules; codifying them as tripwires keeps the
  contract intact during routine progress UI work.
- Confidence: medium-to-high. The block ownership rules are documented;
  these specific failure framings are inferred from the recent fix
  commit and the orchestration spec rather than from named bug PRs.
