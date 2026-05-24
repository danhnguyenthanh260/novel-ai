---
name: chat-first-workspace
description: Use when changing the Novel Lab Write Assistant, chat timeline, composer, slash-command routing, brainstorm flow, durable assistant conversations, or story/chapter context switching in the chat-first writing workspace.
---

# Chat-First Workspace

## Trigger Conditions

Use this skill when the task touches:

- `apps/studio/src/features/scenes/components/writeTab/CommandWorkStream.tsx`
- `apps/studio/src/features/scenes/components/writeTab/chatOrchestration/*`
- assistant conversation APIs under `apps/studio/src/app/api/stories/[slug]/assistant/*`
- `apps/studio/src/features/chat-orchestration/server/*`
- first-open readiness, missing-context chat behavior, slash commands, brainstorm choices, or story/chapter chat history

Do not use this skill for standalone legacy scene controls unless they affect the Write Assistant surface.

## Goal

Keep Novel Lab as a chat-first chapter writing workspace: the center stream captures user intent and compact workflow results; long prose and artifacts stay in the right artifact workspace; missing context is explained conversationally instead of as raw errors.

## Required Investigation Steps

1. Read `AGENTS.md` and `apps/studio/README.md`, especially "Write workspace chat block contracts" and UI rules.
2. Read `docs/operations/specs/studio-chat-orchestration-layer.md`.
3. Read `docs/architecture/conversational-command-orchestrator.md`.
4. Inspect the current files being changed, usually:
   - `CommandWorkStream.tsx`
   - `ChatTimeline.tsx`
   - `ChatComposer.tsx`
   - `TimelineBlocks.tsx`
   - `intentRouter.ts`
   - `commandSurfaceContracts.ts`
   - `useAssistantConversations.ts`
   - `assistantConversationService.ts`
5. If persistence changes, inspect `db/migrations/20260508_assistant_conversation_history.sql`.

## Implementation Rules

- The center chat owns conversation history, commands, compact status, and result summaries.
- Full generated prose, document editing, review details, and artifact content belong in the right artifact workspace or the relevant full workspace link.
- Missing context must render as readiness/recovery language, not as a raw HTTP/database error in primary chat.
- The composer draft is private input state. Persist only submitted messages and completed timeline blocks.
- `choice_group` clicks must carry structured metadata such as `choiceGroupId`, `choiceId`, and intended intent.
- Restored conversation metadata may restore brainstorm mode and choice state, but must not auto-trigger AutoWrite or workflows.
- Active brainstorm mode is soft context. Explicit repo help, run/test help, inspect/analyze/write commands, and quoted-response questions must route before brainstorm continuation.
- Slash commands stay inside Write by default. Commands such as `/inspect`, `/context`, `/pipeline`, `/memory`, `/review chapter`, and `/analyze chapter` should switch inspector/timeline state rather than route away, except for explicit secondary links.
- If a current flow still opens `AutoWriteWizard`, do not add more modal-first command behavior. Prefer timeline blocks plus inspector/artifact handoff for new work.

## Forbidden Actions

- Do not approve drafts, promote memory, publish, delete, reset, or mutate canon from assistant text.
- Do not invent backend-originated `workflow_progress`, `artifact_preview`, `approval_gate`, `failure_recovery`, or `context_digest` payloads in assistant prose.
- Do not render raw reason codes in the primary chat when a plain-language mapping exists.
- Do not persist typing indicators, hover state, slash-menu filters, or incomplete streaming chunks.
- Do not make the slash command menu a permanent command palette.

## Output Format

When reporting a chat-first workspace change, include:

- Changed chat surface or API.
- User-visible behavior before/after.
- Timeline block or conversation persistence contracts affected.
- Verification run.
- Any remaining blocked/degraded behavior.

## Verification Requirements

- From `apps/studio`, run `npm run typecheck` for iterative validation.
- Run `npm run build` before final completion when feasible.
- Lint only changed files, for example `npx eslint src/features/scenes/components/writeTab/CommandWorkStream.tsx`.
- If touching deterministic router or block builders, run or add targeted checks only after confirming the repo has a runnable test command. The current repo has TypeScript `node:test` files but no package `test` script.

## Edge Cases

- No story selected: offer story recovery chips, not a generic greeting.
- No chapter selected: block write/plan/split and explain chapter selection.
- Degraded context: offer proceed-with-caveat versus fix-context choices.
- Blocked context: do not open AutoWrite; surface recovery actions.
- Restored chat with selected choices: selected state must remain visible.
- User asks how to run/test the repo during brainstorm: route as repo help, not story brainstorming.

## Common Failure Modes

Each item below is a real regression that has shipped in this surface. Treat
them as hard tripwires when reviewing new chat-first work. The QA barem at
`docs/operations/implementation/write-assistant-chat-qa-barem.md` is the
canonical manual acceptance checklist that maps each tripwire to a test ID.

- Composer draft echoes into the timeline before the user submits.
  - Symptom: as the user types, partial text appears as a user bubble.
  - Why it matters: violates "composer draft is private input state" and
    creates duplicate or ghost messages.
  - Evidence: PR #130, commit `aff17bd` (`Fix live composer draft echo`).
    QA barem rows C01-C04 (P0).
  - How to apply: when touching the composer or timeline render, verify
    typing without submit produces no timeline mutation, including under
    optimistic-update or controlled-input refactors.

- Brainstorm mode does not capture the first story seed after the
  `brainstorm` keyword.
  - Symptom: user sends `brainstorm`, then sends `a sad girl`, and the
    assistant responds as if it were a new unrelated turn instead of
    expanding angles.
  - Evidence: PR #129 + commit `3843dcd` (`Fix brainstorm intent capture`)
    and `6c91da7` (`fix: make brainstorm chat respond to story seeds`).
    QA barem rows B01-B02 (P1).
  - How to apply: brainstorm mode is soft context that must accept the
    next freeform message as the seed; preserve this when changing
    `intentRouter.ts` or brainstorm continuation logic.

- Restored brainstorm conversations lose selection or fall back to a
  generic flow after refresh.
  - Symptom: user picks `Hidden wound`, refreshes, then types or clicks
    `Character contradiction` and the system starts a fresh unrelated
    flow, or worse, fires Chapter Write preflight.
  - Evidence: PR #131 + commit `7fbea59` (`Fix brainstorm continuation
    routing`). QA barem rows B04 (P0) and H05 (P1).
  - How to apply: when changing `conversationPersistence.ts`,
    `useAssistantConversations.ts`, or restore paths, treat restored
    `brainstormMode` and `selectedChoice` as authoritative inputs into
    the next-turn router. Restoration must never auto-trigger AutoWrite.

- Workspace commands navigate the user away from Write instead of
  switching inspector/timeline state.
  - Symptom: `/inspect`, `/context`, `/pipeline`, `/memory`, `/review
    chapter`, or `/analyze chapter` changes the URL or opens a secondary
    route by default.
  - Evidence: PR #127 + commit `177bbdf` (`Route write commands into
    workspace surfaces`). QA barem rows R01-R05 (P1-P2).
  - How to apply: these commands must update inspector/timeline state in
    place. Only explicit `Open full workspace` clicks may navigate.

- Repo-help and explicit run/test questions are misrouted as brainstorm
  continuation.
  - Symptom: in brainstorm mode, "How do I run this src?" returns a
    creative writing angle instead of repo run/test help.
  - Evidence: AGENTS.md intent rule and QA barem row B07 (P1).
  - How to apply: explicit repo help, run/test help, inspect/analyze/
    write commands, and quoted-response questions must route before
    brainstorm continuation.

- Quoted-response or "what angle?"-style clarifications are treated as a
  new creative seed.
  - Symptom: pasting an earlier assistant choice and asking "what angle?"
    spawns a fresh angle set instead of clarifying the previous one.
  - Evidence: QA barem rows B06 and B08 (P1).
  - How to apply: clarification questions referencing prior assistant
    output must route as clarification, not as a new seed.

- `choice_group` clicks fire without structured metadata, so brainstorm
  state cannot reconstruct the selection.
  - Symptom: clicking `Hidden wound` records a plain user message instead
    of a structured selection event with `choiceGroupId`, `choiceId`, and
    intended intent.
  - Evidence: PR #133 + commit `2830834` (`Add interactive write
    assistant choices`). QA barem rows B03, B05 (P1).
  - How to apply: when extending choice UI or adding new choice surfaces,
    keep the structured metadata contract and the typed-fallback (typing
    `1` matches the first choice).

## Evidence

- Source: `docs/operations/implementation/write-assistant-chat-qa-barem.md`
  (2026-05-09).
- Source: PRs #112, #113, #114, #115, #116, #117, #127, #128, #129, #130,
  #131, #132, #133 (chat-first workspace buildout, 2026-04..05).
- Source: `apps/studio/README.md` Write workspace chat block contracts.
- Source: `docs/operations/specs/studio-chat-orchestration-layer.md`.
- Reason: these failure modes are recurrent enough to have produced their
  own bug PRs and a dedicated manual QA barem; codifying them prevents
  re-introduction during routine chat-surface work.
- Confidence: high.
