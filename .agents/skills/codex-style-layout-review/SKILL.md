---
name: codex-style-layout-review
description: Use when reviewing or changing the Novel Lab Codex-like triple-pane Write layout, viewport locking, independent scroll regions, right artifact panel, center chat priority, or responsive fallback behavior.
---

# Codex-Style Layout Review

## Trigger Conditions

Use this skill when the task touches:

- `apps/studio/src/app/globals.css`
- `apps/studio/src/components/AppShell.tsx`
- `apps/studio/src/features/scenes/components/writeTab/NovelLabWorkspace.tsx`
- `CommandWorkStream.tsx`, `ArtifactSurface.tsx`, `ArtifactInspectorRail.tsx`
- triple-pane layout, `100dvh`, independent scrolling, sticky composer/header, right panel collapse/resize, or mobile fallback

## Goal

Protect the Codex-like Write workspace: fixed app shell, left navigation, center chat stream with persistent composer, and right artifact/inspector panel with no page-level overflow.

Layout review is not only a CSS check. Treat every layout change as a writing
journey review: can an author start with a tiny idea, paste or generate long
prose, inspect the result, recover from blocked context, and keep writing
without losing the composer or primary task?

## Required Investigation Steps

1. Read `apps/studio/README.md` UI source-of-truth and visual rules.
2. Inspect `AppShell.tsx` for `write-route-lock`, `app-shell--write`, and route behavior.
3. Inspect `globals.css` for:
   - `html.write-route-lock`, `body.write-route-lock`
   - `.app-shell--write`
   - `.app-shell--write .app-body`
   - `.novel-lab-workspace`
   - `.work-stream`
   - `.work-stream__scroll`
   - `.work-composer-wrap`
   - `.artifact-workspace`
4. Inspect the changed layout components.
5. For UI quality complaints or vague product prompts, first apply the
   UI/Product Journey Lens in `.agents/workflows/prompt-universe.md`.

## Implementation Rules

- Write routes must use viewport containment: `100dvh`, shell topbar reservation, `min-height: 0`, and `overflow: hidden` at the page/shell level.
- Internal panes scroll independently:
  - left navigation scrolls inside `.novel-lab-nav__scroll`;
  - center timeline scrolls inside `.work-stream__scroll`;
  - right document/inspector scrolls inside `.document-artifact` or `.artifact-inspector`.
- The center chat column is the primary command surface. Do not let the right panel make the chat unusably narrow.
- Persistent composer remains visible while timeline content scrolls.
- Slash menu opens above the composer and scrolls internally.
- Use `min-width: 0` on grid/flex children that contain text, chat cards, or editors.
- Mobile fallback should prioritize the center chat and hide or move secondary panes intentionally.
- Use existing semantic classes and tokens before adding new color/layout systems.
- Short-content states should not look empty, inflated, or marketing-like.
- Long-content states must preserve reading, scrolling, and action ownership:
  chat summaries in the center, full prose/artifacts in the right workspace,
  and persistent next actions near the user task.
- Empty, loading, degraded, blocked, error, success, and retry states must each
  have a visible place in the layout without stealing the whole page.

## Forbidden Actions

- Do not make the browser page the scroll surface for `/stories/[slug]/write`.
- Do not add giant cards or hero-like sections into the chat flow.
- Do not nest page-level cards inside other cards.
- Do not remove `write-route-lock` behavior without replacing the viewport contract.
- Do not use fixed pixel heights that ignore `--topbar-height` or mobile safe areas.
- Do not add decorative gradients/orbs that reduce workspace density.

## Output Format

For layout work, report:

- Pane or shell contract changed.
- Scroll ownership before/after.
- User journey checked, including short and long content behavior.
- Desktop and mobile behavior.
- Any known visual risk.
- Verification run.

## Verification Requirements

- Run `cd apps/studio && npm run typecheck`.
- Lint changed files with `npx eslint <changed-files>`.
- Run `npm run build` before final completion when feasible.
- For visual changes, start the dev server and inspect desktop and mobile widths when feasible.
- Check for page-level overflow and composer visibility on long chat and long right-panel content.

## Edge Cases

- Right artifact hidden: inspector still needs usable width.
- Right artifact visible: center chat must remain readable.
- Long conversation: timeline scrolls, composer fixed in pane.
- Long artifact or progress: right panel scrolls, composer stable.
- Narrow screens: nav and artifact can collapse/hide, but center chat remains usable.
- Short story seed: composer and response should stay compact and direct.
- Long pasted prose: chat should summarize/route; right panel or ingest/artifact
  flow handles inspection instead of a giant center bubble.
- Long generated chapter: artifact panel owns reading/editing; center chat owns
  status and next action.

## Common Failure Modes

- The browser page becomes the scroll surface for `/stories/[slug]/write`.
  - Symptom: appending chat messages or expanding the right panel creates
    a window-level vertical scrollbar. Composer drifts out of view.
  - Evidence: commits `a6f2554` (`fix: lock Write workspace viewport`)
    and `948cef9` (`fix: stabilize Write viewport scroll`). QA barem
    row L01 (P0).
  - How to apply: when touching `globals.css`, `AppShell.tsx`, or
    `NovelLabWorkspace.tsx`, verify the `write-route-lock` /
    `app-shell--write` chain still resolves to `100dvh` containment with
    `overflow: hidden` at the page/shell level.

- Long left/right rail content forces window scroll instead of scrolling
  the rail.
  - Symptom: a long nav list or long inspector progress pushes the
    composer off-screen.
  - Evidence: QA barem rows L02, L03 (P1).
  - How to apply: rails must own their internal scroll
    (`.novel-lab-nav__scroll`, `.document-artifact`, `.artifact-inspector`)
    and parent grid/flex children must keep `min-width: 0` and
    `min-height: 0`.

- Slash menu opens by mounting at page level and shifts layout.
  - Symptom: opening the slash menu jumps the composer or grows the
    chat column.
  - Evidence: QA barem row L04 (P1).
  - How to apply: open the slash menu above the composer with its own
    overflow; do not expand the composer pane to host it.

- Decorative gradients, hero sections, or nested page-level cards
  reduce workspace density.
  - Symptom: a chat card or artifact card nested inside another card,
    extra padding chains, or marketing-style hero strips in the Write
    surface.
  - Evidence: AGENTS.md UI density rules and existing skill prohibitions
    above. No specific bug PR; flagged as a recurring review concern.
  - How to apply: reuse existing semantic classes and tokens. Treat
    Write as an information-dense workspace, not a marketing surface.

## Evidence

- Source: commits `a6f2554`, `948cef9`, and the chat orchestration PRs
  #112-#117 that established the viewport-lock contract.
- Source: `apps/studio/README.md` Write workspace chat block contracts.
- Source: `docs/operations/implementation/write-assistant-chat-qa-barem.md`
  Layout section (L01-L04).
- Reason: viewport regressions have shipped twice in the recent window
  and have a dedicated manual QA section, so the failure mode is
  worth codifying.
- Confidence: high.
