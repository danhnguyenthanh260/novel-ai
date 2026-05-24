---
name: artifact-context-contract
description: Use when changing document artifacts, artifact preview timeline cards, right artifact workspace behavior, context digest blocks, context/progress/artifact inspector toggles, or draft approval/display contracts.
---

# Artifact Context Contract

## Trigger Conditions

Use this skill when the task touches:

- `artifact_preview`, `context_digest`, `approval_gate`, or `failure_recovery` timeline blocks
- `apps/studio/src/features/scenes/components/writeTab/ArtifactSurface.tsx`
- `apps/studio/src/features/scenes/components/writeTab/ArtifactInspectorRail.tsx`
- `apps/studio/src/features/scenes/components/writeTab/chatOrchestration/TimelineBlocks.tsx`
- `apps/studio/src/features/scenes/components/writeTab/types.ts`
- document/editor boundary, draft preview, artifact tabs, or right-panel behavior

## Goal

Keep artifacts as typed, inspectable objects. Chat shows compact summaries and actions; the right artifact workspace shows document/prose/review/detail; draft content remains non-canon until approval.

## Required Investigation Steps

1. Read `docs/architecture/document-editor-boundary.md`.
2. Read `docs/operations/specs/studio-chat-orchestration-layer.md` block registry.
3. Read `docs/architecture/conversational-command-orchestrator.md` artifact handoff and approval gates.
4. Inspect `ArtifactSurface.tsx`, `ArtifactInspectorRail.tsx`, `TimelineBlocks.tsx`, and `types.ts`.
5. If backend payload shape changes, inspect `apps/studio/src/features/chat-orchestration/server/timelineEvents.ts`.

## Implementation Rules

- `artifact_preview` is a compact summary card with title, status, short description, preview lines, and actions/links.
- Full artifact content belongs in `ArtifactSurface` or a full workspace, not the main chat.
- Right inspector modes should reuse existing block contracts where possible:
  - Context uses `context_digest`.
  - Progress uses `workflow_progress`.
  - Artifacts use `artifact_preview`.
  - Memory is read-only unless a dedicated memory block contract is added.
- AI-generated drafts must display draft/not-approved semantics until explicit approval.
- `ApprovalGateBlock` is a visible decision gate, not a modal that the assistant resolves.
- Use existing artifact kinds and block types before adding bespoke components.
- Context partial display should explain missing/degraded slots without raw payload dumps.

## Forbidden Actions

- Do not put huge documents or full generated prose into chat bubbles.
- Do not treat `chapter_draft.full_text`, staging prose, or artifact edit text as approved document state.
- Do not add one-off artifact cards when a standard timeline block type fits.
- Do not let artifact UI mutate memory, publish, or approve without an explicit approved workflow.
- Do not hide blocked/degraded context behind a successful-looking artifact card.

## Output Format

For artifact changes, report:

- Block type or artifact surface changed.
- Data contract fields added/changed.
- Chat summary versus right-panel full view.
- Approval/draft semantics.
- Verification run.

## Verification Requirements

- Run `cd apps/studio && npm run typecheck`.
- Lint changed files with `npx eslint <changed-files>`.
- Run `npm run build` before final completion when feasible.
- If layout changes accompany artifact work, use the `codex-style-layout-review` skill as well.

## Edge Cases

- No chapter selected: artifact surface must offer selection/create recovery.
- No draft: show empty artifact state and disable approval.
- Context blocked: approval stays locked.
- Continuity running: approval stays locked and progress stays visible.
- Full reviews, memory, analysis, or pipeline workspaces may be linked as secondary escape hatches.
