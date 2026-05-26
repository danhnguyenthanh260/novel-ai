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

## Current Repo Reality (verified 2026-05-26)

Playwright is installed and configured in `apps/studio`.

| Item | State |
|---|---|
| Playwright version | `@playwright/test` `^1.51.1` in `apps/studio/package.json` |
| Config | `apps/studio/playwright.config.ts` |
| Test directory | `apps/studio/e2e/tests/` |
| Fixtures/helpers | `apps/studio/e2e/fixtures/`, `apps/studio/e2e/helpers/` |
| Test files | `test-*.spec.ts`, `chat-first-chapter11.spec.ts`, `story-five-chapter-flow.spec.ts` |
| Browsers installed | Chromium (run `npx playwright install chromium` on new machine) |
| Base URL | `http://127.0.0.1:3000` by default in config; override with `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_PORT` |
| Run command | `npm run test:e2e` |
| Real local LLM run command | `npm run e2e:start-and-test` |
| UI mode | `npm run test:e2e:ui` |
| Report | `npm run test:e2e:report` |

**Infrastructure requirement**: local quality E2E uses real local LLM mode. Run `npm run e2e:start` or `npm run e2e:start-and-test` so Docker services, llama.cpp, and Studio are started by the agent-managed startup script.

## Helper Files

Helpers live in `apps/studio/e2e/helpers/`:

| File | Purpose |
|---|---|
| `selectors.ts` | All `data-testid` and ARIA selector constants |
| `story-fixtures.ts` | `createTestStory`, `archiveTestStory`, `writeWorkspaceUrl` — isolated test story management |
| `ai-generation.ts` | `installAutowriteMocks(page)` — smoke-mode helper only; in `E2E_REAL_LLM=1`, generation requests must hit the local LLM |
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
| TC3 | Generate Chapter 1 | WRITE intent opens AutoWrite; real mode records actual LLM output as an attachment; smoke mode uses mocked prose |
| TC4 | Generate Chapters 2–5 | New chapter button works; chapter count grows; previous chapters not overwritten; real mode records per-chapter output |
| TC5 | Interaction clarity | No page scroll; slash menu doesn't shift layout; no raw error stack traces; timeline scrolls internally |
| TC6 | Quality rubric | 22 rubric items across Structure/Continuity/Character/Plot/Tone/UX; no critical failures required |

## Running the Tests

```bash
# Prerequisites (run once on a new machine)
cd apps/studio
npx playwright install chromium

# Standard local real-LLM startup
npm run e2e:start

# Run all E2E tests against the already-started real stack
npm run test:e2e:real

# Or start the real stack and run tests in one command
npm run e2e:start-and-test

# Run with Playwright UI (interactive, recommended for debugging)
E2E_REAL_LLM=1 npm run test:e2e:ui

# Run a single spec
npx playwright test e2e/tests/story-five-chapter-flow.spec.ts --project=chromium

# Custom base URL
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e

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
- For local chapter generation quality checks, run with `E2E_REAL_LLM=1` and do not install `installAutowriteMocks(page)`.
- For CI/smoke checks, mocked mode may use `installAutowriteMocks(page)` to keep the suite deterministic.
- Read `.runtime/e2e/llama-tier.txt` for tier-specific generation timeouts. Tier 0 uses 600s, Tier 1 900s, Tier 2 1200s, Tier 3 1800s per generation.
- For data isolation: always use `createTestStory(request, baseURL)` with unique slug in `beforeAll`; archive in `afterAll`.
- For rubric assertions: always attach the report as a test artifact; always call `assertRubricVerdict(report, "NEEDS_REVIEW")` at minimum.

## Adding New Tests

When adding a new test file:

1. Import helpers from `../helpers/selectors`, `../helpers/story-fixtures`, `../helpers/ai-generation` when adding specs under `e2e/tests`.
2. Use `test.beforeAll` / `test.afterAll` with `createTestStory` / `archiveTestStory`.
3. Gate generation mocks behind `process.env.E2E_REAL_LLM !== "1"` before navigation to write workspace.
4. Use `S.*` selector constants — never write raw selectors in test bodies.
5. Run the narrow Playwright discovery gate after changes:
   ```bash
   npm run test:e2e -- --list
   ```

## Forbidden Actions

- Do not depend on remote external LLM calls in E2E. Local real E2E must use the llama.cpp server on `http://localhost:8080/v1`.
- Do not write brittle selectors tied to Tailwind utility class names or DOM depth.
- Do not make tests approve drafts, promote memory, publish chapters, or reset DB without explicit user confirmation.
- Do not add Playwright infrastructure (config, helpers, deps) for a task that only needs unit or integration tests.
- Do not claim an E2E run passed without the dev server and DB actually running.

## Verification Requirements

After E2E test file changes:
```bash
cd apps/studio
npm run test:e2e -- --list
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

- **llama-server fails to start or crashes with OOM**: `scripts/ops/start_e2e_stack.sh` drops tiers and persists the selected tier in `.runtime/e2e/llama-tier.txt`.
  - Tier 0: `LLAMA_NGL=28`, `LLAMA_CONTEXT=16384`, `LLAMA_BATCH=512`.
  - Tier 1: `LLAMA_NGL=20`, `LLAMA_CONTEXT=8192`, `LLAMA_BATCH=256`.
  - Tier 2: `LLAMA_NGL=12`, `LLAMA_CONTEXT=4096`, `LLAMA_BATCH=128`.
  - Tier 3: `LLAMA_NGL=0`, `LLAMA_CONTEXT=4096`, `LLAMA_BATCH=64`, CPU-only.
  - Use `npm run e2e:start -- --reset-tier` after a hardware upgrade to rediscover the ceiling.

- **Docker is down before E2E**: `npm run e2e:start-and-test` attempts platform-aware Docker startup, then waits for Compose health.
  - If Docker Desktop cannot be started from WSL, the run stops with a human-side setup message.

- **Orphaned processes consume VRAM or port 3000**: owned PIDs are stored in `.runtime/e2e/*.pid`; startup kills only PIDs it owns and refuses to kill unknown processes.

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

- Source: `apps/studio/playwright.config.ts` (`testDir: "./e2e/tests"`).
- Source: `apps/studio/e2e/tests/*.spec.ts`.
- Source: `apps/studio/e2e/helpers/*.ts`.
- Source: `apps/studio/package.json` - `@playwright/test` `^1.51.1` in devDependencies.
- Source: `npm run test:e2e -- --list` output.
- Source: `docs/operations/implementation/write-assistant-chat-qa-barem.md` — manual barem still the fallback for uncovered flows.
- Confidence: high.
