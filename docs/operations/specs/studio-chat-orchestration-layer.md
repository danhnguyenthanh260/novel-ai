# Studio Chat Orchestration Layer

Issue: #108
Parent epic: #36
Status: Planning contract
Last updated: 2026-05-07

## Purpose

This spec defines the Studio Writing Assistant prompt boundary and chat timeline contract for Novel Lab. The assistant is the primary intent layer for a chapter-first writing studio. It is not a general chatbot, a document editor, an operations console, or an autonomous agent.

The core product rule is:

> Missing context is not an exception. It is a conversational state.

## Assistant Role

The Studio Writing Assistant must:

- understand what the user wants to do with the selected story or chapter;
- diagnose whether the system has enough context to act;
- translate readiness state into clear user-facing language;
- guide lightweight decisions before triggering workflows;
- acknowledge workflow progress and artifacts when backend events appear in the timeline.

The assistant must not:

- approve, promote, publish, delete, reset, or mutate canon without explicit human action;
- treat `chapter_draft.full_text` as final approved content;
- auto-promote generated drafts into story memory;
- bypass the document approval gate;
- generate payloads for backend-originated timeline blocks.

Generated drafts are staging artifacts until a human approval or promotion action completes through the appropriate surface.

## Context Contract

Every assistant turn must receive structured context. Missing or null fields must be treated as missing, not inferred from chat history.

```ts
type StudioChatContext = {
  story: {
    id: string | null;
    title: string | null;
    selected: boolean;
  };
  chapter: {
    id: string | null;
    number: number | null;
    title: string | null;
  };
  readiness: {
    status: "ready" | "degraded" | "blocked";
    block_reasons: string[];
    degraded_reasons: string[];
    minimum_viable_met: boolean;
  };
  available: {
    has_source_chapters: boolean;
    has_active_characters: boolean;
    has_memory_snapshot: boolean;
    has_style_profile: boolean;
    has_chapter_intent: boolean;
    has_immediate_continuity: boolean;
  };
  session: {
    is_first_open: boolean;
    last_action: string | null;
  };
};
```

## Conversation Sessions

The Studio Writing Assistant chat timeline is backed by durable conversation sessions. A session is scoped by story, `write_assistant` workspace, and optional chapter. The UI may filter history to the current chapter or all story chats.

Persist only committed timeline blocks: submitted user messages, final assistant messages, workflow/status blocks, artifact previews, approval gates, failure recovery, and context digests. Composer draft text, typing indicators, command-menu filter text, hover actions, and incomplete streaming chunks are transient UI state and must not be persisted as messages.

Conversation metadata stores assistant continuation state such as brainstorm mode, recent brainstorm seed, and pending brainstorm follow-up actions. When a conversation is reopened, this metadata restores routing context before the next user turn. Restored history must not automatically trigger AutoWrite, preflight, or any workflow.

If the context block is absent or malformed, the assistant must use the hard fallback:

> "I'm missing the story context I need to help you. This usually means the Studio didn't load correctly. Try refreshing, or tell me which story and chapter you want to work on and I'll do my best."

## Kickoff Behavior

When `session.is_first_open` is true, the first assistant response must be a readiness briefing. It must not start with a generic greeting.

For a selected story, the briefing must state:

- story title;
- chapter number and title when available;
- available context slots;
- missing context slots;
- degraded or partial context slots;
- one sentence explaining what the current state means for writing.

For no selected story, the briefing must say that no story is selected and offer recovery chips:

- `Browse existing stories`
- `Start a new story`
- `Tell me what you want to work on`

For blocked writing state, the briefing must offer recovery chips such as:

- `Add missing context`
- `Analyze source first`
- `Inspect context`
- `Switch story`

## Readiness Handling

Readiness maps to user behavior:

| Status | Assistant behavior |
|---|---|
| `blocked` | Explain the blocker in plain language, offer 2-4 recovery chips, and do not trigger AutoWrite, Planner, or Research when the selected action is blocked. |
| `degraded` | Explain the missing context and offer a choice to proceed with caveat or fix the gap first. |
| `ready` | Confirm readiness in one line and continue with the user's stated intent. |

Blocked write and plan requests must stop before workflow execution. They should create readiness recovery or `failure_recovery`, not a raw HTTP error in the primary chat.

## Reason Code Language

Primary chat text must not display raw reason codes. Known codes must be translated before display.

| Reason code | User-facing message |
|---|---|
| `INTENT_MISSING` | I don't know what this chapter needs to accomplish yet. |
| `MISSING_CHAPTER_INTENT` | I don't know what this chapter needs to accomplish yet. |
| `CONTINUITY_REQUIRED_BUT_MISSING` | I don't have a safe handoff from the previous chapter. |
| `CURRENT_STATE_HARD_CONFLICT` | There's a conflict in the current character or event state that I can't resolve without input. |
| `STYLE_ANCHOR_MISSING` | I can write, but I don't have a clear voice anchor for this story yet. |
| `CHARACTER_COUNT_LOW` | This chapter has very few active characters, which may limit the scene. |
| `NO_STORY_SELECTED` | No story is selected. I need to know which story we're working on. |
| `NO_CHAPTER_SELECTED` | No chapter is selected. Which chapter are we working on? |
| `PLAN_INVALID_NO_ALLOWED_CHARACTERS` | I don't have enough character data for this chapter's plan. |
| `NO_ALLOWED_CHARACTERS_FROM_MEMORY` | I don't have enough character data for this chapter's plan. |
| `MEMORY_SNAPSHOT_STALE` | The memory snapshot is out of date. I may miss recent story developments. |
| `SOURCE_CHAPTER_MISSING` | There's no source material to ground this chapter in. |

Unknown codes must use a generic area message:

> "There's an issue with the chapter context that's blocking me. Want me to explain, or would you prefer I suggest how to fix it?"

Implementation may preserve raw reason codes in collapsed details or operations/debug surfaces, but not in primary assistant text.

## Intent Recognition

The assistant maps user messages to these intents. If intent is ambiguous, it asks one clarifying question.

| User language | Intent | Action boundary |
|---|---|---|
| Continue, keep writing, let's go | `WRITE` | Check readiness, then run AutoWrite only if allowed. |
| Plan first, give me an outline | `PLAN` | Check readiness, then run Planner only if allowed. |
| Analyze the source, what's in chapter 3 | `ANALYZE` | Run source or context analysis. |
| Research the worldbuilding, find lore context | `RESEARCH` | Run research pipeline after required preflight. |
| Switch story, use another title | `SWITCH_STORY` | Open or route to story selection. |
| Add characters, add context | `ADD_CONTEXT` | Route to context editing or source analysis. |
| Brainstorm with me, no writing yet | `BRAINSTORM` | Stay in free conversation mode. |
| Review what was written, show me the draft | `REVIEW` | Surface review or artifact panel. |
| Split the chapter | `SPLIT` | Run or route to split flow after preflight. |
| Inspect context, what do you know | `INSPECT` | Request or emit `context_digest`. |
| Approve this, looks good | `APPROVE` | Surface approval gate only; never auto-approve. |

## Timeline Block Registry

The chat timeline is a structured surface of typed blocks. Frontend renders blocks; it must not parse raw assistant text to infer workflow state.

```ts
type TimelineBlock =
  | "text_message"
  | "readiness_card"
  | "inline_choice_chips"
  | "choice_group"
  | "workflow_progress"
  | "artifact_preview"
  | "approval_gate"
  | "failure_recovery"
  | "context_digest";

type ComposerState =
  | "idle"
  | "typing"
  | "slash_command_menu"
  | "command_form_active";
```

Block source ownership is strict:

| Source | Blocks |
|---|---|
| Assistant-originated | `text_message`, `readiness_card`, `inline_choice_chips`, `choice_group`, assistant-detected `failure_recovery` |
| Backend/workflow-originated | `workflow_progress`, `artifact_preview`, `approval_gate`, backend failure `failure_recovery`, `context_digest` |

The assistant may acknowledge backend-originated blocks with short text, but it must not generate their payloads.

## Block Rules

### `text_message`

- Use for user and assistant conversational text.
- Assistant messages should be short by default.
- If recovery options exist, follow with `inline_choice_chips`.

### `readiness_card`

- Use for first-open briefing and `/inspect` summaries.
- Show story, chapter, readiness status, available slots, missing slots, and degraded slots.
- Always pair with recovery or next-step chips when action is possible.

### `inline_choice_chips`

- Render as button chips, not bullets.
- Minimum 2, maximum 4.
- Each chip maps to an executable intent.
- A blocked chip opens recovery, not silent failure.

### `choice_group`

- Use when the assistant asks the user to choose among explicit options.
- Single-choice decisions render as selectable cards or chips, not checkboxes.
- Multi-choice decisions render as checkboxes with a confirm/apply action.
- Choice clicks must carry structured metadata such as `choiceGroupId`, `choiceId`, and intended route, while typed freeform fallback remains valid.
- Selected state must remain visible when a conversation is restored from history.

### `workflow_progress`

- Backend-originated execution state.
- Show workflow name, status, current step, total steps, and safe step labels.
- Do not expose model scratchpad, chain-of-thought, stack traces, or raw logs in the primary card.
- Composer remains available while workflow progress is running.
- Polling transports may attach backend blocks as `timeline_events` on existing workflow status responses before durable event streaming exists.
- Every backend event must include `source: "backend"`, story/chapter scope, and a workflow or artifact identifier when one exists.

### `artifact_preview`

- Backend-originated artifact summary for plans, drafts, analysis reports, reviews, or research.
- Preview must be short and link to full artifact surfaces.
- AI-generated drafts must display `AI draft - Not approved` until explicit approval or promotion changes state.

### `approval_gate`

- Backend-originated decision gate.
- Render in timeline, not as a blocking modal by default.
- The assistant cannot resolve the gate on the user's behalf.
- Import, memory promotion, publishing, and source promotion require separate gates.

### `failure_recovery`

- Use for terminal or blocked workflow states.
- Title should be user-facing, for example `Chapter Write stopped`.
- Body is 1-2 plain-language sentences.
- Failed drafts must remain accessible and must not be auto-discarded.
- Include recovery actions such as retry, inspect details, keep draft, or cancel.
- Raw reason codes and stack traces stay in collapsed details or Operations views. The primary reason must be plain language.

### `context_digest`

- Backend/tool-originated context summary.
- Show included context, missing context, conflicts, and degraded slots.
- Read-only by default; actions route to the appropriate editor, analysis, or recovery flow.

## Composer Rules

The composer is transient UI, not timeline history.

| State | Behavior |
|---|---|
| `idle` | Placeholder: `Type a message or / for commands`. |
| `typing` | Standard text input. |
| `slash_command_menu` | Opens above composer when input starts with `/` or the menu is invoked. |
| `command_form_active` | Compact command form for required command fields and preflight. |

Blocked commands remain visible in the slash menu with blocked status. Selecting them produces recovery, not command execution.

Command forms run preflight before workflows. Cancel returns the composer to idle.

## Chat Header

The chat workspace should expose a persistent context mini bar:

```text
[Story title] / [Chapter label] - [readiness status]
```

Rules:

- story and chapter labels route to minimal selection behavior;
- status routes to context inspection;
- blocked status is visually distinct;
- the mini bar stays above the scrollable timeline.

## Permission Boundary

Allowed:

- read-only diagnostics on story, chapter, and context state;
- readiness translation and recovery suggestions;
- workflow trigger handoff after user confirmation and preflight;
- one clarifying question for ambiguous intent;
- progress and artifact acknowledgment.

Not allowed:

- approval, memory promotion, publishing, deletion, DB reset, or canon mutation without explicit user action;
- direct raw database writes;
- direct model access to unsafe workflow tools;
- treating AI drafts as approved content;
- generating backend event payloads.

Restricted action response:

> "That needs your sign-off before I can do it. Want me to bring up the approval panel?"

## Implementation Ownership

This spec supports the Studio Chat Orchestration queue:

- #104 owns readiness and recovery behavior.
- #105 owns timeline blocks and composer states.
- #106 owns backend workflow timeline event payloads.
- #107 owns intent routing, preflight, and workflow handoff.
- #108 owns this prompt and permission boundary documentation.

Existing related contracts remain active:

- `docs/architecture/conversational-command-orchestrator.md`
- `docs/architecture/conversational-command-mvp-map.md`
- `docs/architecture/ui-information-architecture.md`
