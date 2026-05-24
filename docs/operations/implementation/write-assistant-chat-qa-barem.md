# Write Assistant Chat QA Barem

Created at: 2026-05-09 UTC

## Purpose

This barem is the manual acceptance checklist for the Studio Writing Assistant chat workspace after the conversation persistence and interactive choice work.

Use it when reviewing the Write workspace by hand. It is intentionally lightweight: it does not replace unit tests, but it gives a repeatable way to judge whether the chat surface feels correct and whether the main routing regressions are gone.

## Scope

In scope:

- Composer behavior.
- Chat timeline rendering.
- Interactive brainstorm choices.
- Structured choice selection metadata behavior as visible through UI.
- Conversation history and New Chat behavior.
- Brainstorm continuation routing.
- Command/workflow routing staying inside the Write workspace.
- Persistence after refresh.

Out of scope:

- Full backend pipeline correctness.
- LLM prose quality beyond deterministic chat UX expectations.
- Database migration rollout validation.
- Full Playwright automation.
- Mobile visual polish.

## Test Environment

Recommended local setup:

```bash
cd /home/danh/novel-ai/apps/studio
npm run dev -- --port 3002
```

Open:

```text
http://localhost:3002
```

Before testing, confirm:

- You are on a branch that includes the latest `staging` Write Assistant work.
- The Studio app can load a story.
- The Write workspace opens without a browser-level vertical scrollbar.
- If server-backed chat history is being tested, the database migration for assistant conversations has been applied.

## Scoring

Use this scoring model:

| Score | Meaning |
|---|---|
| 1 | Pass: behavior matches expected result. |
| 0.5 | Partial: core behavior works, but visual state, persistence, or routing is incomplete. |
| 0 | Fail: behavior is missing, incorrect, or causes the wrong workflow. |
| N/A | Not applicable in this test run. |

Release judgment:

| Total result | Decision |
|---|---|
| 90% or higher, no P0/P1 failures | Acceptable for staging validation. |
| 75-89%, no P0 failures | Needs targeted fixes before product promotion. |
| Below 75%, or any P0 failure | Not acceptable. Fix before merge/promotion. |

Severity:

| Severity | Definition |
|---|---|
| P0 | Blocks the chat-first workflow or loses submitted user data. |
| P1 | Wrong routing, duplicate messages, missing persisted state, or unusable choice controls. |
| P2 | Visual polish, minor copy, or non-blocking interaction roughness. |

## Barem Matrix

| ID | Area | Check | Expected result | Severity | Score |
|---|---|---|---|---|---|
| C01 | Composer | Type `hello` slowly without submitting. | The timeline does not show `hello` before Enter/Send. | P0 | |
| C02 | Composer | Delete unsent `hello`. | Timeline remains unchanged. | P0 | |
| C03 | Composer | Submit `hello`. | Exactly one user message appears and the composer clears. | P0 | |
| C04 | Composer | Submit a message while assistant pending state appears. | User draft does not stream into the timeline; assistant pending is separate. | P1 | |
| T01 | Timeline | User messages render as compact chat bubbles. | User prose is not monospace and does not look like a debug card. | P2 | |
| T02 | Timeline | Assistant prose renders as compact chat bubbles. | Assistant text stays readable and does not dominate the center panel. | P2 | |
| T03 | Timeline | Copy a message. | Only message text is copied, not role labels, timestamps, or button text. | P2 | |
| B01 | Brainstorm | Send `brainstorm`. | Assistant enters brainstorm mode without starting a workflow. | P1 | |
| B02 | Brainstorm | Send `a sad girl`. | Assistant returns concrete brainstorm angles and renders an interactive single-choice group. | P1 | |
| B03 | Brainstorm | Click `Hidden wound`. | A structured user selection appears once and the selected option is visibly marked. | P1 | |
| B04 | Brainstorm | After angle expansion, click `Character contradiction`. | Assistant expands the contradiction in chat; Chapter Write preflight does not start. | P0 | |
| B05 | Brainstorm | Repeat angle selection by typing `1` instead of clicking. | Typed fallback behaves the same as clicking `Hidden wound`. | P1 | |
| B06 | Brainstorm | Ask `what angle?` after choices are shown. | Assistant explains the choices instead of treating the question as a new seed. | P1 | |
| B07 | Brainstorm | Ask `How do I run this src, and how do I test it?` while in brainstorm mode. | Assistant gives repo run/test help, not brainstorm output. | P1 | |
| B08 | Brainstorm | Paste an earlier assistant choice response and ask `what angle?`. | Assistant treats it as clarification, not a new creative seed. | P1 | |
| H01 | History | Send `hi`, refresh the page. | Submitted user and assistant messages remain visible. | P0 | |
| H02 | History | Type unsent `scene goals`, refresh. | The draft is not persisted as a message. | P0 | |
| H03 | History | Create Chat A and Chat B with different first messages. | Both appear in history and selecting each loads the correct timeline. | P1 | |
| H04 | History | Click `New chat`. | A fresh conversation starts; old chats remain accessible. | P1 | |
| H05 | History | In a brainstorm chat, select an angle, refresh, then click or type `character contradiction`. | Brainstorm state resumes; it does not start a fresh unrelated flow. | P1 | |
| R01 | Routing | Use `/inspect` or `inspect context`. | Context block appears inside Write and right inspector opens context mode; URL does not change. | P1 | |
| R02 | Routing | Use `/analyze chapter` or `analyze source`. | Progress/artifact appears inside Write and inspector opens analysis/context; URL does not change. | P1 | |
| R03 | Routing | Use `/review chapter`. | Review/progress appears inside Write and inspector opens review/artifact; URL does not change. | P1 | |
| R04 | Routing | Use `/pipeline` or `/status`. | Pipeline/context status stays inside Write; URL does not change. | P1 | |
| R05 | Routing | Click explicit `Open full workspace` link if present. | Navigation happens only after the explicit click. | P2 | |
| W01 | Workflow cards | Trigger a missing-context write attempt with explicit `write the chapter`. | Failure/preflight renders as a workflow card, not raw debug text. | P1 | |
| W02 | Workflow cards | Click `Inspect context` from a recovery action. | Inspect action stays in Write and does not route away. | P1 | |
| L01 | Layout | Chat longer than one viewport. | Center timeline scrolls internally; composer remains visible. | P0 | |
| L02 | Layout | Left rail has long content. | Left rail scrolls internally; browser page does not become the scroll surface. | P1 | |
| L03 | Layout | Right inspector has long progress/artifact content. | Right panel scrolls internally; composer position is stable. | P1 | |
| L04 | Layout | Open slash menu. | Menu opens above composer without shifting page layout. | P1 | |

## Manual Test Script

### Script 1: Composer and Timeline Baseline

1. Open the Write workspace.
2. Click the composer.
3. Type `hello` slowly.
4. Confirm no live `hello` appears in the timeline.
5. Delete `hello`.
6. Confirm the timeline remains unchanged.
7. Type `hello` again and press Enter.
8. Confirm exactly one user message appears.
9. Confirm the composer clears.

Pass requires: C01, C02, C03, C04.

### Script 2: Interactive Brainstorm Choices

1. Send `brainstorm`.
2. Send `a sad girl`.
3. Confirm a visible choice group appears with:
   - Hidden wound
   - Trigger event
   - Opening scene
4. Click `Hidden wound`.
5. Confirm the selected state is visible.
6. Confirm the assistant expands Hidden wound.
7. Confirm the next actions appear as interactive choices:
   - Scene goal
   - Character contradiction
   - Chapter opening
8. Click `Character contradiction`.
9. Confirm the assistant expands a contradiction in chat.
10. Confirm no Chapter Write preflight appears.

Pass requires: B01, B02, B03, B04.

### Script 3: Freeform Fallback

1. Start a new chat.
2. Send `brainstorm`.
3. Send `a sad girl`.
4. Type `1` instead of clicking.
5. Confirm the result matches choosing Hidden wound.
6. Ask `what angle?`.
7. Confirm the assistant explains the available angles.

Pass requires: B05, B06.

### Script 4: Intent Override In Brainstorm Mode

1. Stay in an active brainstorm conversation.
2. Ask `How do I run this src, and how do I test it?`.
3. Confirm the assistant answers with project run/test help.
4. Confirm it does not treat the question as a story seed.
5. Paste a prior assistant response and add `what angle?`.
6. Confirm the assistant answers as clarification.

Pass requires: B07, B08.

### Script 5: Chat History Persistence

1. Send `hi`.
2. Send `brainstorm`.
3. Refresh the page.
4. Confirm previous submitted messages remain.
5. Type `scene goals` but do not submit.
6. Refresh the page.
7. Confirm `scene goals` does not appear as a message.
8. Click `New chat`.
9. Send `new idea`.
10. Select the old chat from history.
11. Confirm old messages are still available.

Pass requires: H01, H02, H03, H04.

### Script 6: Restored Brainstorm Continuation

1. Start a new chat.
2. Send `brainstorm`.
3. Send `a girl`.
4. Click `Hidden wound` or type `1`.
5. Refresh the page.
6. Send `character contradiction`.
7. Confirm assistant continues the brainstorm based on the selected angle.
8. Confirm it does not start Chapter Write preflight.

Pass requires: H05.

### Script 7: Workspace Command Routing

1. Send `/inspect` or `inspect context`.
2. Confirm the URL does not change.
3. Confirm the context view opens in the Write workspace.
4. Send `/pipeline` or `/status`.
5. Confirm progress/status remains in Write.
6. Send `/review chapter`.
7. Confirm review/progress stays in Write.
8. Click an explicit `Open full workspace` link if present.
9. Confirm navigation only happens after that click.

Pass requires: R01, R03, R04, R05.

### Script 8: Layout Stability

1. Send enough chat messages to exceed the center panel height.
2. Confirm the browser page itself does not scroll vertically.
3. Confirm only the chat timeline scrolls.
4. Confirm the composer remains visible.
5. Open the slash command menu.
6. Confirm the layout does not jump.
7. Switch right inspector modes.
8. Confirm the full page height remains stable.

Pass requires: L01, L02, L03, L04.

## Failure Log Template

Use this template for each failed item:

```text
ID:
Severity:
Browser / viewport:
Story / chapter:
Conversation:
Steps:
Expected:
Actual:
Screenshot or note:
Suspected area:
```

## Minimum Pass Bar Before Promotion

Do not promote the Write Assistant chat UX if any of these fail:

- C01: composer draft appears before submit.
- C03: submit does not append exactly one user message.
- B04: character contradiction starts Chapter Write preflight.
- H01: submitted history is lost after refresh.
- H02: unsent composer draft is persisted.
- L01: composer leaves the visible viewport during chat.

## Automation Follow-Up

If this barem becomes stable, convert the highest-value checks into Playwright tests:

- Composer draft does not render before submit.
- Submitted message appears exactly once.
- Choice group click selects Hidden wound.
- Character contradiction does not start Chapter Write preflight.
- Refresh restores submitted history and selected choice state.

Keep browser automation as a follow-up until local database setup and seeded story fixtures are stable enough for repeatable runs.
