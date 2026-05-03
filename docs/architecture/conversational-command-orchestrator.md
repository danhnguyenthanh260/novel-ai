# Conversational Command Orchestrator Contract

Issue: #37
Status: Planning contract
Last updated: 2026-05-03

## Purpose

This contract defines the Novel Lab command workspace boundary. The command plane captures user intent and produces typed workflow requests; deterministic application code validates and executes those requests through existing APIs and worker tasks. The command plane is not the document output surface and is not a raw database or worker console.

## Ownership Model

| Layer | Owns | Must not own |
|---|---|---|
| Command plane | Slash commands, natural-language task intent, compact command events, plan proposals, and status summaries. | Long prose output, canon truth, direct database mutation, raw payload inspection. |
| Orchestrator | Validation, approval gates, lifecycle state, trace records, owner API/task selection, and result references. | Autonomous model execution or unchecked state transitions. |
| Artifact workspace | Document drafts, analysis artifacts, review artifacts, memory candidate artifacts, publish previews, and operations/status artifacts. | Command parsing or hidden memory promotion. |
| Inspector | Progress, context, issues, memory, versions, source traces, and degraded/block reasons for the active artifact. | Raw logs as the default writer-facing experience. |

## Command Request

The first contract shape is semantic. It can be represented as TypeScript later, but this document is the source of truth for the initial implementation.

```ts
type CommandRequest = {
  input_mode: "slash" | "natural_language";
  raw_text: string;
  command_id?: CommandId;
  story_slug: string;
  chapter_id?: string;
  selection_ref?: string;
  artifact_ref?: string;
  user_intent: string;
};
```

`CommandId` for the first workspace slice:

- `/write chapter`
- `/analyze chapter`
- `/rewrite selection`
- `/continue from cursor`
- `/check continuity`
- `/extract memory`
- `/review chapter`
- `/approve draft`
- `/publish preview`
- `/status`
- `/split`

The UI should show the most relevant commands first: `/write chapter`, `/analyze chapter`, `/rewrite selection`, `/continue from cursor`, and `/check continuity`. Lower-frequency commands may live under `More`.

## Tool Registry Contract

Every model-callable workflow action must be registered before it can execute.

Required registry fields:

- `id`: stable internal tool id.
- `command_ids`: slash commands or intents that may request it.
- `owner`: API route, worker task, or missing-contract note.
- `input_summary`: required input fields and safe defaults.
- `output_summary`: result references and artifact handoff target.
- `approval_requirement`: `none`, `confirm`, `required`, or `locked_until_validation`.
- `side_effect_level`: `read_only`, `draft_write`, `canon_affecting`, `publish_affecting`, `destructive`.
- `trace_fields`: intent, payload summary, owner path, status, reason codes, result ref, and approval decision.

The model may propose a tool call or plan, but the orchestrator must validate the registry entry and approval state before execution.

## Lifecycle States

Command runs use one of these states:

| State | Meaning |
|---|---|
| `proposed` | Parsed intent exists, execution has not started. |
| `waiting_approval` | Human approval is required before execution. |
| `running` | Owner API/task is active. |
| `degraded` | Work can continue with explicit reduced context or fallback. |
| `blocked` | Work cannot continue until a required condition is fixed. |
| `failed` | Execution failed with a reason code. |
| `done` | Execution completed and returned a result reference. |
| `cancelled` | User or system stopped the run. |

Context readiness labels are UI-friendly names for the `WritingContext` outcomes:

| UI label | Contract outcome |
|---|---|
| `Context Clean` | `proceed` |
| `Context Partial` | `degraded` |
| `Context Blocked` | `blocked` |

Do not use `Context Ready` for this workspace because it hides degraded and blocked states.

## Artifact Handoff

Every successful command must produce or update an artifact reference.

| Artifact kind | Example source | Primary owner |
|---|---|---|
| `document` | `/write chapter`, `/continue from cursor`, `/rewrite selection` | Right artifact editor |
| `analysis` | `/analyze chapter`, `/check continuity` | Analysis/Issues inspector |
| `review` | `/review chapter` | Review artifact |
| `memory` | `/extract memory` | Memory candidate artifact |
| `publish_preview` | `/publish preview` | Publish preview |
| `operations` | `/status`, failed/blocked worker runs | Operations/status artifact |

For `/write chapter`, the result is an editable document artifact wrapping the generated chapter draft. It is draft-only until validation and approval. It must not feed canon memory, reader output, or publishing directly.

## Approval Gates

Approval gates are explicit:

- `Approve revision` is locked until continuity validation passes or a future override contract is approved.
- Draft editor revisions cannot promote memory.
- Memory extraction may preview draft-only candidates but cannot promote them until an approved revision exists.
- Reader and publish surfaces consume approved document/export state, not raw AI drafts.
- Destructive operations, DB reset, publish, canon mutation, and memory promotion require explicit human approval.

## Trace Requirements

Each command run trace must include:

- raw input and normalized intent;
- selected command/tool and rejected alternatives when relevant;
- story/chapter/artifact scope;
- owner API or task path;
- payload hash or safe summary;
- lifecycle state and reason codes;
- approval requirement and decision;
- result artifact reference;
- degraded, blocked, or failure metadata.

The trace exists so command-driven workflows remain inspectable without putting raw JSON or logs into the writer's primary workspace.
