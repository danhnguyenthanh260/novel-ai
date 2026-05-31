import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { archiveTestStory, createTestStory, writeWorkspaceUrl, type StoryFixture } from "../helpers/story-fixtures";
import { sendChatMessage } from "../helpers/ai-generation";
import { S } from "../helpers/selectors";
import { seedSubcurrentRealContext, subcurrentOutputPath } from "../helpers/subcurrent-real-fixture";

const REAL_LLM = process.env.E2E_REAL_LLM === "1";
const RUNTIME_DIR = path.resolve(process.cwd(), "../../.runtime/e2e");
const TIER_TIMEOUTS_MS = [600_000, 900_000, 1_200_000, 1_800_000] as const;
const CHAPTER_ID = "ch11";

type ChapterStatusResponse = {
  ok?: boolean;
  error?: string;
  job_id?: number;
  status?: string;
  staging_ready?: boolean;
  prose?: string;
  word_count?: number;
  historian_snapshot?: unknown;
  latest_task?: {
    task_type?: string | null;
    status?: string | null;
    error?: string | null;
  } | null;
};

type AutoWriteStartResponse = ChapterStatusResponse & {
  plan?: unknown;
  blocking_reason?: string | null;
};

let story: StoryFixture;

function readActiveTier(): number {
  const file = path.join(RUNTIME_DIR, "llama-tier.txt");
  if (!existsSync(file)) return 0;
  const tier = Number(readFileSync(file, "utf8").trim());
  return Number.isInteger(tier) && tier >= 0 && tier <= 3 ? tier : 0;
}

function generationTimeoutMs(): number {
  if (process.env.E2E_GENERATION_TIMEOUT_MS) {
    return Number(process.env.E2E_GENERATION_TIMEOUT_MS);
  }
  return REAL_LLM ? TIER_TIMEOUTS_MS[readActiveTier()] : 20_000;
}

const GENERATION_TIMEOUT_MS = generationTimeoutMs();

function writeWorkspaceChapterUrl(slug: string, chapterId: string): string {
  return `${writeWorkspaceUrl(slug)}?chapter_id=${encodeURIComponent(chapterId)}`;
}

function chapter11Goal(): string {
  return [
    "write the chapter: Chapter 11 of The Subcurrent.",
    "Use chapters 1-10 as style_gold and continuity truth.",
    "Continue immediately after Chapter 10: Kuro, Mike, and Cerin are in Kuro's room after the tablet timestamp jumps from 19:42:11 to 19:42:23; the space barely answers Kuro; Kuro says they know we exist now; the Hollow is waiting.",
    "Preserve the slow-burn psychological sci-fi mystery voice: restrained third-person close narration, ordinary physical details turning strange, quiet dialogue, no exposition dump, no assistant meta-commentary.",
    "Keep Kuro, Mike, Cerin, Noctis, the Hollow, the twelve-second resonance check, and Professor Halden's remote observation coherent.",
    "Write roughly 700 words of prose only.",
  ].join(" ");
}

async function waitForChapterWorkspaceReady(page: Page): Promise<void> {
  await expect(async () => {
    const bodyText = await page.locator("body").textContent();
    expect(bodyText ?? "").not.toContain("Wait for workspace state");
    expect(bodyText ?? "").not.toContain("Loading current chapter artifact");
    expect(bodyText ?? "").not.toContain("Loading chapters");
  }).toPass({ timeout: 20_000 });
}

async function attachRuntimeLogTail(testInfo: import("@playwright/test").TestInfo, fileName: string): Promise<void> {
  const file = path.join(RUNTIME_DIR, fileName);
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  const tail = content.split(/\r?\n/).slice(-160).join("\n");
  await testInfo.attach(fileName, {
    contentType: "text/plain",
    body: tail,
  });
}

function persistGeneratedOutput(status: ChapterStatusResponse): void {
  const draftPath = subcurrentOutputPath("chapter-11-real-llm-draft.md");
  const statusPath = subcurrentOutputPath("chapter-11-real-llm-status.json");
  mkdirSync(path.dirname(draftPath), { recursive: true });
  writeFileSync(draftPath, status.prose ?? "", "utf8");
  writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf8");
}

async function waitForRealGeneration(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  jobId: number | undefined,
  testInfo: import("@playwright/test").TestInfo
): Promise<ChapterStatusResponse> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  let latestStatus: ChapterStatusResponse | null = null;
  while (Date.now() < deadline) {
    const statusUrl = new URL(
      `${baseURL}/api/stories/${encodeURIComponent(story.slug)}/chapters/${encodeURIComponent(CHAPTER_ID)}/auto-write/status`
    );
    if (jobId) statusUrl.searchParams.set("job_id", String(jobId));
    const res = await request.get(statusUrl.toString());
    latestStatus = (await res.json().catch(() => null)) as ChapterStatusResponse | null;

    if (
      res.ok() &&
      latestStatus?.staging_ready &&
      typeof latestStatus.prose === "string" &&
      latestStatus.prose.trim().length > 600
    ) {
      persistGeneratedOutput(latestStatus);
      await testInfo.attach("subcurrent-chapter-11-real-llm-output.md", {
        contentType: "text/markdown",
        body: latestStatus.prose,
      });
      await testInfo.attach("subcurrent-chapter-11-real-llm-status.json", {
        contentType: "application/json",
        body: JSON.stringify(latestStatus, null, 2),
      });
      return latestStatus;
    }

    const terminalStatus = String(latestStatus?.status || latestStatus?.latest_task?.status || "").toUpperCase();
    if (["FAILED", "CANCELLED", "PAUSED"].includes(terminalStatus)) {
      throw new Error(`Subcurrent Chapter 11 generation failed: ${JSON.stringify(latestStatus)}`);
    }
    await page.waitForTimeout(2_000);
  }

  throw new Error(`Timed out waiting for real Subcurrent Chapter 11 prose: ${JSON.stringify(latestStatus)}`);
}

async function runChapterWriteFromChat(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  testInfo: import("@playwright/test").TestInfo
): Promise<ChapterStatusResponse> {
  await sendChatMessage(page, chapter11Goal());
  const confirmWrite = page.getByRole("button", { name: /Confirm write/i }).first();
  await expect(confirmWrite).toBeVisible({ timeout: 15_000 });
  const noEarlyAutoWrite = page.getByText("AutoWrite v2: Chapter Architect");
  await expect(noEarlyAutoWrite).toBeHidden({ timeout: 2_000 });
  await confirmWrite.click();

  const wizardTitle = page.getByText("AutoWrite v2: Chapter Architect");
  const preflightStopped = page.getByText("Chapter Write stopped");
  await expect(async () => {
    const wizardVisible = await wizardTitle.isVisible().catch(() => false);
    const blockedVisible = await preflightStopped.isVisible().catch(() => false);
    expect(wizardVisible || blockedVisible).toBe(true);
  }).toPass({ timeout: 15_000 });

  if (!(await wizardTitle.isVisible().catch(() => false))) {
    const bodyText = await page.locator("body").textContent();
    await testInfo.attach("subcurrent-ui-write-preflight-blocker.txt", {
      contentType: "text/plain",
      body: bodyText ?? "",
    });
    const directResponse = await request.post(
      `${baseURL}/api/stories/${encodeURIComponent(story.slug)}/chapters/${encodeURIComponent(CHAPTER_ID)}/auto-write`,
      {
        data: {
          target_word_count: 700,
          user_prompt: chapter11Goal(),
          writing_intent_mode: "CONTINUE_CANON",
        },
        timeout: GENERATION_TIMEOUT_MS,
      }
    );
    const directJson = (await directResponse.json().catch(() => null)) as AutoWriteStartResponse | null;
    await testInfo.attach("subcurrent-chapter-11-direct-auto-write-start.json", {
      contentType: "application/json",
      body: JSON.stringify(directJson, null, 2),
    });
    const startStatus = String(directJson?.status || "").toUpperCase();
    if (!directResponse.ok() || directJson?.ok === false || startStatus.startsWith("BLOCKED_BY_")) {
      throw new Error(`Direct AutoWrite did not start for Subcurrent Chapter 11: ${JSON.stringify(directJson)}`);
    }
    const jobId = Number(directJson?.job_id || 0) || undefined;
    return waitForRealGeneration(page, request, baseURL, jobId, testInfo);
  }

  const wizard = page.locator(".surface-card").filter({ hasText: "AutoWrite v2: Chapter Architect" }).last();
  const targetSlider = wizard.locator('input[type="range"]').first();
  if (await targetSlider.isVisible().catch(() => false)) {
    await targetSlider.fill("700");
    await expect(targetSlider).toHaveValue("700");
  }

  const writeAutoButton = page.getByRole("button", { name: /WRITE AUTO/i }).first();
  await expect(writeAutoButton).toBeVisible({ timeout: 10_000 });
  const autoWriteResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/stories/${story.slug}/chapters/${CHAPTER_ID}/auto-write`) &&
      response.request().method() === "POST",
    { timeout: GENERATION_TIMEOUT_MS }
  );
  await writeAutoButton.click();
  const autoWriteResponse = await autoWriteResponsePromise;
  const autoWriteJson = (await autoWriteResponse.json().catch(() => null)) as AutoWriteStartResponse | null;
  await testInfo.attach("subcurrent-chapter-11-auto-write-start.json", {
    contentType: "application/json",
    body: JSON.stringify(autoWriteJson, null, 2),
  });

  const startStatus = String(autoWriteJson?.status || "").toUpperCase();
  if (!autoWriteResponse.ok() || autoWriteJson?.ok === false || startStatus.startsWith("BLOCKED_BY_")) {
    throw new Error(`AutoWrite did not start for Subcurrent Chapter 11: ${JSON.stringify(autoWriteJson)}`);
  }

  const jobId = Number(autoWriteJson?.job_id || 0) || undefined;
  return waitForRealGeneration(page, request, baseURL, jobId, testInfo);
}

test.describe("The Subcurrent real Chapter 11 route", () => {
  test.describe.configure({
    mode: "serial",
    timeout: REAL_LLM ? Math.max(GENERATION_TIMEOUT_MS + 120_000, 720_000) : 60_000,
  });

  test.skip(!REAL_LLM, "This spec is intentionally no-mock only. Run with E2E_REAL_LLM=1.");

  test.beforeAll(async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    story = await createTestStory(request, baseURL, {
      slug: `subcurrent_real_${Date.now().toString(36)}`,
      title: "The Subcurrent - Real Chapter 11 E2E",
    });
    const seedResult = await seedSubcurrentRealContext(story.slug);
    await testInfo.attach("subcurrent-real-seed.json", {
      contentType: "application/json",
      body: JSON.stringify({ story, seedResult }, null, 2),
    });
  });

  test.afterAll(async ({ request }, testInfo) => {
    if (!story) return;
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    await archiveTestStory(request, baseURL, story.slug);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    await attachRuntimeLogTail(testInfo, "studio-dev.log");
    await attachRuntimeLogTail(testInfo, "llama-server.log");
  });

  test("writes Chapter 11 from real Subcurrent source context without mocks", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";

    await page.goto(`${baseURL}${writeWorkspaceChapterUrl(story.slug, CHAPTER_ID)}`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });
    await waitForChapterWorkspaceReady(page);
    await expect(page.locator(S.chapterItem(CHAPTER_ID))).toBeVisible({ timeout: 10_000 });
    await page.locator(S.chapterItem(CHAPTER_ID)).click();

    const status = await runChapterWriteFromChat(page, page.request, baseURL, testInfo);
    const prose = status.prose ?? "";
    const bodyText = await page.locator("body").textContent();

    expect(prose).toContain("Kuro");
    expect(prose).toMatch(/\bMike\b/);
    expect(prose).toMatch(/\bCerin\b/);
    expect(prose).toMatch(/\bHollow\b/i);
    expect(prose).toMatch(/\b(19:42|twelve|timestamp|tablet|Halden|Noctis|current|resonance)\b/i);
    expect(prose).not.toMatch(/\b(as an ai|i cannot write|i can't write|here is chapter)\b/i);
    expect(bodyText ?? "").not.toMatch(/TypeError:|ReferenceError:|Unhandled Runtime Error|at Object\./);
  });

  test("opens main Subcurrent from the book picker and reads Chapter 11 in the artifact column", async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    await seedSubcurrentRealContext("the_subcurrent");

    await page.goto(`${baseURL}/`);
    await expect(page.locator(S.writeWorkspace)).toBeVisible({ timeout: 15_000 });
    await page.locator(S.storyPickerButton).click();
    await expect(page.locator(S.storyPickerModal)).toBeVisible({ timeout: 10_000 });
    await page.locator(S.storyPickerOption("the_subcurrent")).click();
    await expect(page).toHaveURL(/\/stories\/the_subcurrent\/write/);
    await page.goto(`${baseURL}/stories/the_subcurrent/write?chapter_id=${CHAPTER_ID}`);
    await expect(page.locator(S.chapterItem(CHAPTER_ID))).toBeVisible({ timeout: 15_000 });
    await page.locator(S.chapterItem(CHAPTER_ID)).click();
    await page.getByRole("button", { name: /^Artifacts$/ }).click();

    const reader = page.locator(S.artifactDraftReader);
    await expect(reader).toBeVisible({ timeout: 15_000 });
    await expect(reader).toContainText("Kuro", { timeout: 10_000 });
    await expect(reader).toContainText("Mike");
    await expect(reader).toContainText("Cerin");
    await expect(reader).toContainText(/Hollow/i);
  });
});
