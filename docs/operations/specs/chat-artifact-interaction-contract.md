# Chat Artifact Interaction Contract

Issue: #144
Parent epic: #134
Status: Active interaction contract
Last updated: 2026-05-19

## Artifact Cards

Rule: chat renders compact artifact cards only. Full artifact content stays in the right artifact workspace or an explicit secondary link after the card exists.

Correct example: `/analyze chapter` appends an `artifact_preview` block, opens the inspector, and the card action focuses artifact details in the right panel.

Incorrect example: `/analyze chapter` redirects to `/stories/[slug]/analysis` or prints the full analysis payload into a chat message.

Playwright assertion: an artifact card rendered in chat has height at or below 200px and clicking its open action keeps the URL on `/write`.

## Long Input

Rule: pasted text with at least 8000 characters or at least 120 lines must not be submitted as a normal chat message. The composer asks the user to create a source artifact.

Correct example: a 8001-character paste opens a confirmation surface labelled `Create source artifact from pasted text?`; confirming creates a source artifact card.

Incorrect example: the raw 8001-character paste is appended as a user chat bubble.

Playwright assertion: pasting 8001 characters shows the confirmation UI and the resulting timeline card is a source artifact.

## Inspector

Rule: the inspector is workspace UI state, not route state. Opening an artifact card changes inspector mode and, on narrow screens, opens the artifact drawer.

Correct example: clicking `Open` on a memory, analysis, source, review, or progress artifact opens the right inspector and leaves the current route unchanged.

Incorrect example: clicking `Open` calls `router.push(...)` to Memory, Analysis, Reviews, Ingest, or Pipelines.

Playwright assertion: after clicking an artifact card action, the page URL does not contain `/memory`, `/analysis`, `/reviews`, `/ingest`, or `/pipelines`.

## Progress Blocks

Rule: progress cards show compact step state in chat and detailed step state in the inspector. Logs and diagnostics stay out of the primary chat card.

Correct example: `/pipeline` renders a `workflow_progress` block with step labels and a secondary `Open full pipelines workspace` link.

Incorrect example: `/pipeline` redirects to `/pipelines` or dumps worker logs in the chat card.

Playwright assertion: a progress card appears in the timeline and the inspector can show detailed step state without page navigation.

## Review State Machine

Rule: review artifacts move through the approved state machine only: `draft -> staged -> pending -> approved/rejected -> applied -> published`.

Correct example: approve and reject actions are visible only for a `pending` review artifact; applying requires `approved`.

Incorrect example: a `draft` review artifact exposes an apply action or the assistant approves a review in prose.

Playwright assertion: review state labels render on artifact cards and invalid state actions are not exposed.

## Layout Safety

Rule: the Write workspace owns the viewport. Chat scroll, inspector scroll, and artifact scroll are independent. On screens below 1024px, the artifact/inspector area behaves as a drawer.

Correct example: long chat history scrolls in the center pane while the composer remains visible; long artifact content scrolls inside the right pane.

Incorrect example: the browser page becomes the scroll container for `/stories/[slug]/write`, hiding the composer.

Playwright assertion: timeline and inspector have independent scroll containers, the composer remains visible, and mobile width uses the artifact drawer instead of a third grid column.
