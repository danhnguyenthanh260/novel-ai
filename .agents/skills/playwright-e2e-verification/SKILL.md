---
name: playwright-e2e-verification
description: Use when adding, running, or reviewing Playwright/E2E coverage for Novel Lab chat-first writing flows, layout containment, artifact panel behavior, missing-context onboarding, 5-chapter story generation, or browser-level regression checks.
---

# Playwright E2E Verification

## Trigger Conditions

Use this skill when the task involves:

- Playwright or browser E2E tests for this repo.
- Layout containment verification (viewport-locked Write workspace).
- Chat-first chapter generation flows (brainstorm, `/write chapter`, AutoWrite).
- Artifact panel behavior (Read/Edit/Analyze/Review/Approve tabs).
- Missing-context onboarding or blocked write recovery.
- 5-chapter story quality rubric validation.
- Screenshots, traces, or route-level browser checks.

## Current Repo Reality (verified 2026-05-22)

Playwright is installed and configured in `apps/studio`.

| Item | State |
|---|---|
| Playwright version | `@playwright/test@1.60.0` |
| Config | `apps/studio/playwright.config.ts` |
| Test directory | `apps/studio/tests/e2e/` |
| Test files | `story-five-chapter-flow.spec.ts` |
| Total tests | 6 (TC1–TC6) |
| Browsers installed | Chromium (run `npx playwright install chromium` on new machine) |
| Base URL | `http://localhost:3000` (override with `E2E_BASE_URL`) |
| Run command | `npm run test:e2e` |
| UI mode | `npm run test:e2e:ui` |
| Report | `npm run test:e2e:report` |

**Infrastructure requirement**: Docker must be running and `npm run dev` must be started before executing tests. See the `e2e-infra-preflight` skill for full preflight steps.

## Helper Files

All helpers live in `apps/studio/tests/e2e/helpers/`:

| File | Purpose |
|---|---|
| `selectors.ts` | All `data-testid` and ARIA selector constants |
| `story-fixtures.ts` | `createTestStory`, `archiveTestStory`, `writeWorkspaceUrl` — isolated test story management |
| `ai-generation.ts` | `installAutowriteMocks(page)` — intercepts `/api/*/autowrite/run` and `/api/stories/*/chapters/*/writing-status`; defines 5 mock chapters with narrative continuity |
| `rubric.ts` | `evaluateChapterContent`, `buildRubricReport`, `assertUXRubric`, `assertRubricVerdict` — 22-item quality barem across 6 categories |

## data-testid Hooks Added (2026-05-22)

| Selector | Component | Element |
|---|---|---|
| `story-title-input` | `RootStoryBootstrap.tsx` | Title input |
| `story-slug-input` | `RootStoryBootstrap.tsx` | Slug input |
| `story-create-submit` | `RootStoryBootstrap.tsx` | Create Story button |
| `story-create-error` | `RootStoryBootstrap.tsx` | Error alert div |
| `chat-context-bar` | `ChatTimeline.tsx` | Context mini bar |
| `chat-timeline` | `ChatTimeline.tsx` | Scroll container |
| `chat-composer-input` | `ChatComposer.tsx` | Textarea |
| `chat-send-btn` | `ChatComposer.tsx` | Send button |
| `write-workspace` | `NovelLabWorkspace.tsx` | Main `<main>` element |
| `new-chapter-btn` | `NovelLabWorkspace.tsx` | New chapter button |
| `chapter-item-<id>` | `NovelLabWorkspace.tsx` | Chapter nav buttons |

## Test Cases Covered

| ID | Name | Key assertions |
|---|---|---|
| TC1 | Create story workspace | Form creates story; URL changes; workspace loads |
| TC2 | Chat baseline | Composer privacy (C01-C04); brainstorm routing (B01-B04); command routing stays in Write (R01, R04); layout lock (L01, L04) |
| TC3 | Generate Chapter 1 | WRITE intent opens AutoWrite; mocked autowrite/run returns; prose appears in DOM |
| TC4 | Generate Chapters 2–5 | New chapter button works; chapter count grows; previous chapters not overwritten; composer stays enabled |
| TC5 | Interaction clarity | No page scroll; slash menu doesn't shift layout; no raw error stack traces; timeline scrolls internally |
| TC6 | Quality rubric | 22 rubric items across Structure/Continuity/Character/Plot/Tone/UX; no critical failures required |

## Running the Tests

```bash
# Prerequisites (run once on a new machine)
cd apps/studio
npx playwright install chromium

# Start the dev server in a separate terminal
npm run dev

# Run all E2E tests
npm run test:e2e

# Run with Playwright UI (interactive, recommended for debugging)
npm run test:e2e:ui

# Run a single spec
npx playwright test story-five-chapter-flow --project=chromium

# Custom base URL (e.g., Docker port 3001)
E2E_BASE_URL=http://localhost:3001 npm run test:e2e

# Show last HTML report
npm run test:e2e:report
```

## Implementation Rules

- Prefer user-observable assertions over implementation details.
- Use `data-testid` selectors from `helpers/selectors.ts` — do not duplicate selector strings in test files.
- For Write workspace layout, always assert:
  - `document.documentElement.scrollHeight <= window.innerHeight + 4` (no page scroll).
  - Center timeline `overflowY` is `auto`, `scroll`, or `overlay`.
  - Composer (`chat-send-btn`) is visible after generation completes.
- For chat-first flows, test first-open readiness, slash command menu open/close, structured brainstorm choices, and command result blocks.
- For chapter generation: always use `installAutowriteMocks(page)` before navigation — never call real AI in CI.
- For data isolation: always use `createTestStory(request, baseURL)` with unique slug in `beforeAll`; archive in `afterAll`.
- For rubric assertions: always attach the report as a test artifact; always call `assertRubricVerdict(report, "NEEDS_REVIEW")` at minimum.

## Adding New Tests

When adding a new test file:

1. Import helpers from `./helpers/selectors`, `./helpers/story-fixtures`, `./helpers/ai-generation`.
2. Use `test.beforeAll` / `test.afterAll` with `createTestStory` / `archiveTestStory`.
3. Call `installAutowriteMocks(page)` before any navigation to write workspace.
4. Use `S.*` selector constants — never write raw selectors in test bodies.
5. Run `npm run typecheck` via `tsconfig.e2e.json` after changes:
   ```bash
   npx tsc --project tsconfig.e2e.json --noEmit
   ```

## Forbidden Actions

- Do not depend on real external LLM calls in any E2E test.
- Do not write brittle selectors tied to Tailwind utility class names or DOM depth.
- Do not make tests approve drafts, promote memory, publish chapters, or reset DB without explicit user confirmation.
- Do not add Playwright infrastructure (config, helpers, deps) for a task that only needs unit or integration tests.
- Do not claim an E2E run passed without the dev server and DB actually running.

## Verification Requirements

After TypeScript changes to test files:
```bash
cd apps/studio
npx tsc --project tsconfig.e2e.json --noEmit
```

After changes to production components (e.g., adding `data-testid`):
```bash
cd apps/studio
npm run typecheck
npx eslint src/app/RootStoryBootstrap.tsx src/features/scenes/components/writeTab/NovelLabWorkspace.tsx
```

## Manual Acceptance Fallback

For flows not yet covered by Playwright, use the canonical manual barem:

`docs/operations/implementation/write-assistant-chat-qa-barem.md`

Priority rows to automate next (not yet covered):

1. **H01/H05**: Refresh restores submitted messages and brainstorm state.
2. **B03**: Choice click shows selected state and assistant expansion.
3. **B04**: Character contradiction does not trigger AutoWrite preflight.
4. **L02/L03**: Left rail and right inspector scroll internally, not the page.

## Common Failure Modes

- **0 tests pass, all timeout**: Dev server not running or `E2E_BASE_URL` wrong.
  - Fix: Start `npm run dev` and verify `curl http://localhost:3000/api/stories`.

- **TC2/TC3 fail with "chat-timeline not visible"**: DB not running → `assistant_conversation` insert fails → workspace crashes.
  - Fix: Start Docker (`docker compose -f infra/docker-compose.yml up -d`) and verify `psql $DATABASE_URL -c "select 1;"`.

- **TC3 fails at "write the chapter" — AutoWrite modal never appears**: `WRITE` intent requires a chapter to be selected and `readiness !== "blocked"`. Check that `selectedChapterId` is populated before the write trigger.
  - Workaround: ensure at least one chapter item (`[data-testid^="chapter-item-"]`) is clicked before sending the write message.

- **TC4 chapter count doesn't grow**: `createNewChapter` calls an API that may fail if DB is down or story has no chapter ID sequence.
  - Fix: ensure DB is running and the story was created via `createTestStory` in `beforeAll`.

- **Rubric TC6 fails with `LLM_API_BASE` error in logs**: Studio is trying to call a real LLM because `installAutowriteMocks` was not called or a route wasn't intercepted.
  - Fix: verify `page.route("**/api/*/autowrite/run", ...)` is installed and that navigation happens after `installAutowriteMocks(page)`.

- **Layout assertion fails in CI**: `scrollHeight` check is viewport-sensitive. Playwright desktop Chrome defaults to 1280×720. If changed, the grid column calculation in `NovelLabWorkspace.tsx` may overflow.
  - Fix: lock viewport in `playwright.config.ts` via `devices["Desktop Chrome"]` (already set).

## Evidence

- Source: `apps/studio/playwright.config.ts` (created 2026-05-22).
- Source: `apps/studio/tests/e2e/story-five-chapter-flow.spec.ts` (created 2026-05-22).
- Source: `apps/studio/tests/e2e/helpers/*.ts` (created 2026-05-22).
- Source: `apps/studio/package.json` — `@playwright/test@1.60.0` in devDependencies.
- Source: `npx playwright test --list` output — 6 tests confirmed discoverable.
- Source: `docs/operations/implementation/write-assistant-chat-qa-barem.md` — manual barem still the fallback for uncovered flows.
- Confidence: high.
