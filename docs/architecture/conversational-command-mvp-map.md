# Conversational Command MVP Map

Issue: #38
Status: Planning contract
Last updated: 2026-05-03

## Purpose

This document maps the first Novel Lab commands to existing `novel-ai` workflows or explicit missing contracts. The command plane is a workflow entrypoint. It does not execute raw database actions and does not replace artifact, editor, memory, review, or operations surfaces.

Related contract: `docs/architecture/conversational-command-orchestrator.md`.
Related chat prompt and timeline contract: `docs/operations/specs/studio-chat-orchestration-layer.md`.

The Studio chat timeline renders command results and workflow lifecycle blocks according to `docs/operations/specs/studio-chat-orchestration-layer.md`; backend/runtime events own progress, artifact, approval, failure, and context digest payloads.

## MVP Commands

| Command | User intent | Owner surface | Result artifact | Approval gate |
|---|---|---|---|---|
| `/write chapter` | Generate or continue a chapter draft. | `POST /api/stories/[slug]/chapters/[chapterId]/auto-write` and current AutoWrite/V3 flow where available. | `document` draft artifact. | Draft-only until continuity validation and approval. |
| `/analyze chapter` | Inspect current chapter context, continuity, and risks. | Existing analysis/writing snapshot and context inspector contracts; exact public route remains a missing-contract note if not exposed. | `analysis` artifact. | Read-only. |
| `/rewrite selection` | Rewrite selected prose in the active artifact. | Existing scene rewrite and Muse prose helpers can inform behavior; document-selection rewrite needs future editor contract. | `document` artifact update. | Draft write only; cannot approve. |
| `/continue from cursor` | Continue prose from the editor cursor. | Existing Muse/prose streaming can inform behavior; cursor continuation against document blocks is future editor scope. | `document` artifact update. | Draft write only; cannot approve. |
| `/check continuity` | Find canon, timeline, forbidden reveal, and relationship issues. | `WritingContext` assembler/debug plus continuity issue surfaces from V3 ledger/rollup. | `analysis` or Issues inspector artifact. | Required before approval in the first UI slice. |
| `/extract memory` | Preview memory candidates from the active draft. | #12 promotion contract and current ledger/rollup outputs. | `memory` candidate artifact. | Draft-only until approved revision exists. |
| `/review chapter` | Open review checklist and scoring for current chapter. | Current review APIs and review panel concepts. | `review` artifact. | Human review action only. |
| `/approve draft` | Approve current document revision. | Future document approval endpoint from #5 boundary. | Approved `document` revision. | Locked until continuity validation passes. |
| `/publish preview` | Preview reader-facing output. | Future publish/export adapter. | `publish_preview` artifact. | Requires approved revision/export state. |
| `/status` | Show current workflow, worker, and artifact state. | Existing worker/job/status APIs and Operations surface. | `operations` artifact. | Read-only. |
| `/split` | Split imported source or chapter draft into scenes. | Ingest split APIs and split-draft approval flow. | `operations` or analysis artifact. | Split draft approval remains human-gated. |

## Default UI Prioritization

Primary slash menu commands:

1. `/write chapter`
2. `/analyze chapter`
3. `/rewrite selection`
4. `/continue from cursor`
5. `/check continuity`

Commands under `More`:

- `/extract memory`
- `/review chapter`
- `/approve draft`
- `/publish preview`
- `/status`
- `/split`

## Command-Specific Rules

### `/write chapter`

- Required inputs: `story_slug`, `chapter_id`, user intent or approved chapter goal.
- Safe default: write against the selected chapter only.
- Uses the existing chapter-first generation path where available.
- Produces an editable document artifact wrapping the generated draft.
- Must show `Context Clean`, `Context Partial`, or `Context Blocked` from `WritingContext` readiness.
- Must not update canon, promote memory, publish, or reader-facing output.

### `/check continuity`

- Required inputs: active artifact reference and chapter id.
- Result goes to the artifact inspector `Issues` or `Progress` state.
- Can unlock approval only after a future implementation defines pass/fail validation output.
- Until that implementation exists, the UI presents `Run continuity check` as the next action and keeps approval locked.

### `/approve draft`

- Required inputs: approved document revision candidate and validation result.
- Current status: missing backend implementation contract.
- UI behavior: visible but disabled/locked while continuity validation is pending.
- Must create an approved revision before memory extraction, reader output, or publish preview can consume the prose.

### `/extract memory`

- Draft behavior: preview candidates only, tagged `Draft-only`.
- Approved behavior: after document approval, extraction can create promotion candidates under #12.
- Must not silently promote memory.

### `/status`

- Reads current job, worker, artifact, save, and context state.
- Result belongs in Operations/status artifact or compact header pills.
- Must not expose raw logs by default.

## Inspector Handoff

| Result | Inspector tab |
|---|---|
| WritingContext progress | `Progress` |
| Context readiness and source state | `Context` |
| Continuity, reveal, timeline, or relationship warnings | `Issues` |
| Draft-only or promotion-ready memory candidates | `Memory` |
| AI draft, human draft, checked draft, approved revision, export snapshot | `Versions` |

The inspector is attached to the right artifact workspace and may be resized horizontally on desktop.

## Missing Contracts To Track

- Document revision approval endpoint and durable storage remain future #5 implementation work.
- Cursor-aware document rewrite and continuation require editor block/range references.
- Continuity validation pass/fail output must be made stable before approval can unlock.
- Publish preview requires approved document/export state.
- Memory promotion requires #12 implementation; this MVP may only show draft-only candidate previews.
