import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000135";

async function mockStoryWorkspace(page: Page) {
  const conversations: Array<Record<string, unknown>> = [];
  const messages: Array<{ block: unknown }> = [];
  const conversationBodies: Array<Record<string, unknown>> = [];

  await page.route("**/api/stories", async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ slug: storySlug, title: "Subcurrent", status: "draft" }] } });
  });

  await page.route(`**/api/${storySlug}/scenes`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        items: [
          { id: 1, chapter_id: "1", idx: 1, title: "Opening", status: "DRAFTING", workunit_id: null },
          { id: 2, chapter_id: "2", idx: 1, title: "Follow-up", status: "DRAFTING", workunit_id: null },
        ],
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/chapters`, async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ chapter_id: "1" }, { chapter_id: "2" }] } });
  });

  await page.route(`**/api/stories/${storySlug}/chapters/*/full`, async (route) => {
    const chapterId = route.request().url().match(/chapters\/([^/]+)\/full/)?.[1] ?? "1";
    await route.fulfill({
      json: {
        ok: true,
        items: [{ id: Number(chapterId), idx: 1, title: `Chapter ${chapterId}`, status: "DRAFT", text_content: `Chapter ${chapterId} source text.` }],
        staging: { user_prose: `Chapter ${chapterId} draft text.`, llm_prose: "", status: "draft" },
        v3_draft: null,
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/status**`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        item: {
          scope: "story",
          chapterId: null,
          chapterCount: 2,
          lastWriteAt: "2026-05-18 12:00:00",
          memoryCompleteness: 75,
          analysisFlags: { activeSnapshots: 1, sourceDocs: 2, hasActiveSnapshot: true },
          readiness: "ready",
          missing: [],
          nextAction: "Continue with the next writing command.",
        },
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/conversations**`, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      conversationBodies.push(body);
      const item = {
        id: conversationId,
        chapter_id: body.chapter_id ?? null,
        title: null,
        summary: null,
        status: "active",
        state_json: {},
        updated_at: new Date().toISOString(),
        last_message_preview: null,
      };
      conversations.splice(0, conversations.length, item);
      await route.fulfill({ json: { ok: true, item }, status: 201 });
      return;
    }
    await route.fulfill({ json: { ok: true, items: conversations } });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/conversations/${conversationId}`, async (route) => {
    await route.fulfill({ json: { ok: true, item: conversations[0] ?? null } });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/conversations/${conversationId}/messages`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const metadata = body.metadata_json && typeof body.metadata_json === "object" && !Array.isArray(body.metadata_json)
        ? body.metadata_json as Record<string, unknown>
        : {};
      messages.push({ block: metadata.block ?? null });
      await route.fulfill({ json: { ok: true, item: { id: `${messages.length}`, block: messages.at(-1)?.block } }, status: 201 });
      return;
    }
    await route.fulfill({ json: { ok: true, items: messages } });
  });

  return { conversationBodies };
}

async function submitMessage(page: Page, text: string) {
  await page.getByLabel("Studio chat composer").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function runCommand(page: Page, command: string) {
  await page.getByLabel("Studio chat composer").fill(command);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run preflight" }).click();
}

test.describe("Story-level chat entry", () => {
  test("story route lands in story-scope chat instead of metadata landing", async ({ page }) => {
    await mockStoryWorkspace(page);
    await page.goto(`/stories/${storySlug}`);
    await expect(page).toHaveURL(/\/stories\/subcurrent\/write\?scope=story/);
    await expect(page.getByLabel("Studio chat composer")).toBeVisible();
    await expect(page.getByText("Metadata")).toHaveCount(0);
  });

  test("/status returns a story-level context block", async ({ page }) => {
    await mockStoryWorkspace(page);
    await page.goto(`/stories/${storySlug}/write?scope=story`);
    await runCommand(page, "/status");
    const digest = page.locator(".timeline-card--digest").filter({ hasText: "Story status: ready" }).first();
    await expect(digest.getByRole("heading", { name: "Story status: ready" })).toBeVisible();
    await expect(digest.getByText("Story scope")).toBeVisible();
  });

  test("chapter switch keeps story scope and conversation history", async ({ page }) => {
    const state = await mockStoryWorkspace(page);
    await page.goto(`/stories/${storySlug}/write?scope=story`);
    await submitMessage(page, "Keep this story-level note");
    await page.getByRole("button", { name: "Chapter 2 Not started" }).click();
    await expect(page.getByText("Story scope")).toBeVisible();
    await expect(page.getByText("Keep this story-level note")).toBeVisible();
    expect(state.conversationBodies.at(0)?.workspace).toBe("story");
    expect(state.conversationBodies.at(0)?.chapter_id).toBeNull();
  });
});
