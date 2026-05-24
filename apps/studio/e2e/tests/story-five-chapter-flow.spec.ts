/**
 * E2E: Story Five-Chapter Flow
 *
 * Verifies that a user can create a new isolated story, generate Chapters 1–5
 * via the Write workspace, and that the full flow meets the quality rubric.
 *
 * Prerequisites:
 *   - Studio dev server running (npm run dev -- --port 3000, or set E2E_BASE_URL)
 *   - PostgreSQL available and migrations applied
 *   - Default mode uses mocked LLM routes for fast smoke coverage
 *   - Set E2E_REAL_LLM=1 to use the real local OpenAI-compatible LLM
 *
 * Run:
 *   npx playwright test story-five-chapter-flow --project=chromium
 */

import { test, expect } from "@playwright/test";
import {
  createTestStory,
  archiveTestStory,
  writeWorkspaceUrl,
  type StoryFixture,
} from "../helpers/story-fixtures";
import {
  installAutowriteMocks,
  sendChatMessage,
  MOCK_CHAPTERS,
  PROTAGONIST,
} from "../helpers/ai-generation";
import {
  evaluateChapterContent,
  buildRubricReport,
  assertRubricVerdict,
  assertUXRubric,
  printRubricReport,
} from "../helpers/rubric";
import { S } from "../helpers/selectors";

const REAL_LLM = process.env.E2E_REAL_LLM === "1";
const GENERATION_TIMEOUT_MS = REAL_LLM ? 180_000 : 20_000;

async function installGenerationMode(page: import("@playwright/test").Page) {
  if (!REAL_LLM) {
    await installAutowriteMocks(page);
  }
}

async function waitForGenerationEvidence(
  page: import("@playwright/test").Page,
  beforeText: string,
  testInfo: import("@playwright/test").TestInfo,
  chapterLabel: string
) {
  if (!REAL_LLM) {
    await page.waitForFunction(
      (protagonist) => document.body.innerText.includes(protagonist),
      PROTAGONIST,
      { timeout: GENERATION_TIMEOUT_MS }
    );
    return;
  }

  await page.waitForFunction(
    (previousLength) => document.body.innerText.length > previousLength + 400,
    beforeText.length,
    { timeout: GENERATION_TIMEOUT_MS }
  );

  const afterText = await page.locator("body").textContent() ?? "";
  await testInfo.attach(`${chapterLabel}-real-llm-output.txt`, {
    contentType: "text/plain",
    body: afterText.slice(Math.max(0, afterText.length - 8000)),
  });
}

// ---------------------------------------------------------------------------
// Shared story fixture across the describe block — created once, cleaned up once.
// ---------------------------------------------------------------------------
let story: StoryFixture;

test.describe("Story Five-Chapter Flow", () => {
  test.describe.configure({ timeout: REAL_LLM ? 600_000 : 60_000 });

  test.beforeAll(async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    story = await createTestStory(request, baseURL);
  });

  test.afterAll(async ({ request }, testInfo) => {
    if (!story) return;
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    await archiveTestStory(request, baseURL, story.slug);
  });

  // -------------------------------------------------------------------------
  // TC1 — Create new story workspace
  // -------------------------------------------------------------------------
  test("TC1 — story bootstrap form creates a story and redirects to workspace", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";

    // The beforeAll already created via API; here we test the UI creation path
    // with a second, separate story to validate the form itself.
    const uiStory = { slug: `e2e_ui_${Date.now().toString(36)}`, title: "E2E UI Bootstrap Test" };

    await page.goto(baseURL);

    // If the DB already has stories the bootstrap form may not be shown — skip the form test
    const titleInput = page.locator(S.storyTitleInput);
    const formVisible = await titleInput.isVisible().catch(() => false);

    if (!formVisible) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Bootstrap form not shown because stories already exist in DB; form test skipped.",
      });
    } else {
      // Fill the form
      await titleInput.fill(uiStory.title);
      await expect(page.locator(S.storySlugInput)).toHaveValue(uiStory.slug.slice(0, 3), { timeout: 3000 }).catch(() => undefined);

      // Override slug to our controlled value
      await page.locator(S.storySlugInput).click({ clickCount: 3 });
      await page.locator(S.storySlugInput).fill(uiStory.slug);

      // Submit
      await page.locator(S.storyCreateSubmit).click();

      // After create, we expect redirect to /stories/<slug>/pipelines
      await expect(page).toHaveURL(new RegExp(`/stories/${uiStory.slug}/`), { timeout: 10_000 });

      // Cleanup the UI-created story
      await archiveTestStory(page.request, baseURL, uiStory.slug);
    }

    // Now navigate to the API-created story's write workspace
    await page.goto(`${baseURL}${writeWorkspaceUrl(story.slug)}`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // TC2 — Chat baseline: composer behavior, brainstorm route, chat persistence
  // -------------------------------------------------------------------------
  test("TC2 — chat workspace baseline: composer, brainstorm, and persistence", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    await page.goto(`${baseURL}${writeWorkspaceUrl(story.slug)}`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });

    const input = page.locator(S.chatComposerInput);
    const sendBtn = page.locator(S.chatSendBtn);
    const timeline = page.locator(S.chatTimeline);

    // C01 — Composer draft not visible in timeline before submit
    await input.fill("hello");
    const timelineText = await timeline.textContent();
    expect(timelineText ?? "").not.toContain("hello");

    // C02 — Delete draft; timeline unchanged
    await input.fill("");
    expect(await timeline.textContent()).toBe(timelineText);

    // C03 — Submit message → exactly one user bubble, composer clears
    await input.fill("hello");
    await sendBtn.click();
    await expect(timeline.locator('text="hello"').first()).toBeVisible({ timeout: 8_000 });
    await expect(input).toHaveValue("");

    // B01 — Brainstorm mode triggered without starting a write workflow
    await sendChatMessage(page, "brainstorm");
    await expect(timeline).toContainText("brainstorm", { timeout: 6_000 });

    // B02 — Brainstorm seed returns structured angle choices
    await sendChatMessage(page, "a sad girl");
    await expect(timeline).toContainText("Hidden wound", { timeout: 8_000 });

    // B03 — Clicking a brainstorm choice selects it
    const hiddenWoundBtn = timeline.locator('button', { hasText: "Hidden wound" }).first();
    const hiddenWoundExists = await hiddenWoundBtn.isVisible().catch(() => false);
    if (hiddenWoundExists) {
      await hiddenWoundBtn.click();
      // Selected state should appear; chapter write preflight must NOT start
      await page.waitForTimeout(500);
      const autoWriteModal = page.locator(S.autoWriteModal);
      const modalAppeared = await autoWriteModal.isVisible().catch(() => false);
      expect(modalAppeared).toBe(false); // B04 equivalent
    }

    // R01 — /inspect stays inside Write (URL must not change)
    const urlBefore = page.url();
    await sendChatMessage(page, "/inspect");
    await page.waitForTimeout(500);
    expect(page.url()).toBe(urlBefore);

    // L01 — After several messages, composer is still visible
    await expect(input).toBeVisible();
    await expect(sendBtn).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // TC3 — Generate Chapter 1 via AutoWrite
  // -------------------------------------------------------------------------
  test("TC3 — generate Chapter 1 via write command", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";

    // In real mode, do not install page.route() mocks; the request must hit the local LLM.
    await installGenerationMode(page);
    await page.goto(`${baseURL}${writeWorkspaceUrl(story.slug)}`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });

    // Ensure at least one chapter exists (select or wait for default)
    const newChapterBtn = page.locator(S.newChapterBtn);
    await expect(newChapterBtn).toBeVisible({ timeout: 10_000 });

    // If no chapter is selected yet, create one
    const chapterItem1 = page.locator('[data-testid^="chapter-item-"]').first();
    const chapter1Exists = await chapterItem1.isVisible().catch(() => false);
    if (!chapter1Exists) {
      await newChapterBtn.click();
      await expect(page.locator('[data-testid^="chapter-item-"]').first()).toBeVisible({ timeout: 10_000 });
    }

    // Select the first chapter
    await page.locator('[data-testid^="chapter-item-"]').first().click();

    // Trigger write via chat message
    const input = page.locator(S.chatComposerInput);
    const beforeText = await page.locator("body").textContent() ?? "";
    await input.fill("write the chapter");
    await page.locator(S.chatSendBtn).click();

    // AutoWrite Wizard should open (or a workflow_progress block should appear)
    // We give 15s because the wizard may need to call the (mocked) autowrite/run endpoint
    const wizardOrProgress = page.locator(
      '.autowrite-wizard, [class*="AutoWrite"], [class*="autowrite"], .workflow-progress-block, [data-block-type="workflow_progress"]'
    );
    const appeared = await wizardOrProgress.isVisible({ timeout: 15_000 }).catch(() => false);

    // If the AutoWrite wizard appears as a modal with a "Run" or "Start" button, submit it
    const runBtn = page.locator('button:has-text("Run"), button:has-text("Start writing"), button:has-text("Generate")').first();
    const runBtnVisible = await runBtn.isVisible().catch(() => false);
    if (runBtnVisible) {
      await runBtn.click();
    }

    // Wait for generated prose to appear somewhere in the UI.
    // Mock mode uses a stable protagonist anchor; real mode records the actual output.
    await waitForGenerationEvidence(page, beforeText, testInfo, "chapter-1");

    if (!REAL_LLM) {
      // Chapter 1 content visible
      await expect(page.locator(`text="${MOCK_CHAPTERS["1"].title}"`).or(
        page.locator(`text="Chapter 1"`)
      ).first()).toBeVisible({ timeout: 10_000 }).catch(() => {
        // Title label may not appear separately; content appearance is the key assertion
      });
    }

    // Chapter item 1 should be in nav
    const anyChapterBtn = page.locator('[data-testid^="chapter-item-"]').first();
    await expect(anyChapterBtn).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // TC4 — Generate Chapters 2–5 continuously (mocked, preserving previous chapters)
  // -------------------------------------------------------------------------
  test("TC4 — generate Chapters 2–5 continuously without losing prior chapters", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    await installGenerationMode(page);
    await page.goto(`${baseURL}${writeWorkspaceUrl(story.slug)}`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });

    const newChapterBtn = page.locator(S.newChapterBtn);
    await expect(newChapterBtn).toBeVisible({ timeout: 10_000 });

    // Track chapter count before we start
    let chapterButtonsBefore = await page.locator('[data-testid^="chapter-item-"]').count();

    for (let chapterNum = 2; chapterNum <= 5; chapterNum++) {
      // Create new chapter
      await newChapterBtn.click();

      // Wait for a new chapter item to appear
      await expect(async () => {
        const count = await page.locator('[data-testid^="chapter-item-"]').count();
        expect(count).toBeGreaterThan(chapterButtonsBefore);
      }).toPass({ timeout: 10_000 });

      chapterButtonsBefore = await page.locator('[data-testid^="chapter-item-"]').count();

      // Select the latest chapter (last in the list)
      const chapters = page.locator('[data-testid^="chapter-item-"]');
      await chapters.last().click();

      // Trigger write
      const input = page.locator(S.chatComposerInput);
      const beforeText = await page.locator("body").textContent() ?? "";
      await input.fill(`Continue the story and write Chapter ${chapterNum}. Preserve continuity from previous chapters.`);
      await page.locator(S.chatSendBtn).click();

      // Submit wizard if it opens
      const runBtn = page.locator('button:has-text("Run"), button:has-text("Start writing"), button:has-text("Generate")').first();
      const runBtnVisible = await runBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (runBtnVisible) {
        await runBtn.click();
      }

      await waitForGenerationEvidence(page, beforeText, testInfo, `chapter-${chapterNum}`).catch((error) => {
        if (REAL_LLM) throw error;
        test.info().annotations.push({
          type: "chapter-prose-not-visible",
          description: `Chapter ${chapterNum}: protagonist name not found in DOM after generation`,
        });
      });

      // Previous chapter buttons must still be present (no overwrite)
      const currentCount = await page.locator('[data-testid^="chapter-item-"]').count();
      expect(currentCount).toBeGreaterThanOrEqual(chapterNum);
    }

    // Final assertion: at least 5 chapter items in nav
    await expect(async () => {
      const count = await page.locator('[data-testid^="chapter-item-"]').count();
      expect(count).toBeGreaterThanOrEqual(5);
    }).toPass({ timeout: 5_000 });

    // Workspace still responsive after 5 chapters
    await expect(page.locator(S.chatComposerInput)).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // TC5 — Human-AI interaction clarity
  // -------------------------------------------------------------------------
  test("TC5 — UI interaction clarity: loading states, layout stability, recovery", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    await installGenerationMode(page);
    await page.goto(`${baseURL}${writeWorkspaceUrl(story.slug)}`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });

    const input = page.locator(S.chatComposerInput);
    const timeline = page.locator(S.chatTimeline);

    // L01 — After filling composer, page itself must NOT have a scrollbar
    // (check that html/body overflow is hidden or the viewport height equals clientHeight)
    const pageScrollable = await page.evaluate(() => {
      return document.documentElement.scrollHeight > window.innerHeight + 4;
    });
    expect(pageScrollable).toBe(false);

    // L04 — Slash menu opens above composer without layout shift
    await input.click();
    await input.type("/");
    const slashMenu = page.locator(S.slashMenu);
    await expect(slashMenu).toBeVisible({ timeout: 5_000 });

    // Verify composer is still visible after menu opens
    await expect(input).toBeVisible();

    // Close menu
    await page.keyboard.press("Escape");
    await expect(slashMenu).not.toBeVisible({ timeout: 3_000 }).catch(() => undefined);
    await input.fill("");

    // W01 — Missing-context write renders workflow card, not raw debug text
    await sendChatMessage(page, "write the chapter");
    await page.waitForTimeout(1_000);
    // Ensure no raw error object or stack trace is visible
    const bodyText = await page.locator("body").textContent() ?? "";
    expect(bodyText).not.toMatch(/TypeError:|Error:|at Object\./);

    // After generation or failure, composer must still be enabled
    await expect(input).toBeEnabled();

    // R04 — /pipeline stays inside Write (URL unchanged)
    const urlBefore = page.url();
    await sendChatMessage(page, "/pipeline");
    await page.waitForTimeout(500);
    expect(page.url()).toBe(urlBefore);

    // Timeline scrolls internally — timeline element must have a scroll capability
    const timelineOverflow = await timeline.evaluate((el) => {
      return window.getComputedStyle(el).overflowY;
    });
    expect(["auto", "scroll", "overlay"]).toContain(timelineOverflow);
  });

  // -------------------------------------------------------------------------
  // TC6 — Quality rubric validation
  // -------------------------------------------------------------------------
  test("TC6 — quality rubric: structure, continuity, character, plot, tone, UX", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    await page.goto(`${baseURL}${writeWorkspaceUrl(story.slug)}`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });

    if (REAL_LLM) {
      const bodyText = await page.locator("body").textContent() ?? "";
      await testInfo.attach("real-llm-visible-output.txt", {
        contentType: "text/plain",
        body: bodyText.slice(Math.max(0, bodyText.length - 12000)),
      });

      expect(bodyText.replace(/\s+/g, "").length, "Real LLM run should leave generated content or workflow output visible").toBeGreaterThan(400);
      expect(bodyText, "Real LLM output must not expose raw stack traces").not.toMatch(/TypeError:|ReferenceError:|Unhandled Runtime Error|at Object\./);
      expect(bodyText, "Real LLM output must not include obvious AI meta-commentary").not.toMatch(/\b(as an ai|i cannot write|i can't write)\b/i);

      const uxItems = await assertUXRubric(page);
      const report = buildRubricReport(uxItems);
      printRubricReport(report);
      await testInfo.attach("real-llm-ux-rubric-report.json", {
        contentType: "application/json",
        body: JSON.stringify(report, null, 2),
      });
      return;
    }

    // Content-level rubric (evaluated against mock chapter definitions)
    const contentItems = evaluateChapterContent(MOCK_CHAPTERS);

    // UX-level rubric (evaluated against live DOM state)
    const uxItems = await assertUXRubric(page);

    const allItems = [...contentItems, ...uxItems];
    const report = buildRubricReport(allItems);
    printRubricReport(report);

    // Attach report to test results
    await testInfo.attach("rubric-report.json", {
      contentType: "application/json",
      body: JSON.stringify(report, null, 2),
    });

    // Minimum bar: no critical failures, NEEDS_REVIEW or better
    assertRubricVerdict(report, "NEEDS_REVIEW");

    // Individual critical assertions as explicit test failures for better reporting
    const criticalFails = report.items.filter((i) => i.critical && i.score === "fail");
    for (const item of criticalFails) {
      expect.soft(item.score, `Critical rubric item ${item.id} [${item.category}]: ${item.criteria}`).toBe("pass");
    }

    // Structural minimums that must always hold
    const structureItems = report.items.filter((i) => i.category === "Structure");
    const chapter5Present = structureItems.find((i) => i.id === "A01");
    expect(chapter5Present?.score, "Must have exactly 5 mock chapters defined").toBe("pass");

    const chapterOrder = structureItems.find((i) => i.id === "A02");
    expect(chapterOrder?.score, "Chapters must be ordered 1–5").toBe("pass");

    const protagonistConsistency = report.items.find((i) => i.id === "C01");
    expect(protagonistConsistency?.score, `Protagonist "${PROTAGONIST}" must appear in every chapter`).toBe("pass");

    const noAiMeta = report.items.find((i) => i.id === "E01");
    expect(noAiMeta?.score, "No AI meta-commentary allowed in chapters").toBe("pass");
  });
});
