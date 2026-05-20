import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000143";

type ConversationItem = {
  id: string;
  chapter_id: string | null;
  title: string | null;
  summary: string | null;
  status: "active";
  state_json: Record<string, unknown>;
  updated_at: string;
  last_message_preview: string | null;
};

async function mockWriteWorkspace(page: Page) {
  const conversations: ConversationItem[] = [];
  const messages: Array<{ block: unknown }> = [];
  let validatePosts = 0;

  await page.route("**/api/stories", async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ slug: storySlug, title: "Subcurrent", status: "draft" }] } });
  });

  await page.route(`**/api/${storySlug}/scenes`, async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ id: 1, chapter_id: "1", idx: 1, title: "Opening", status: "DRAFTING", workunit_id: null }] } });
  });

  await page.route(`**/api/stories/${storySlug}/chapters`, async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ chapter_id: "1" }] } });
  });

  await page.route(`**/api/stories/${storySlug}/chapters/*/full`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        items: [{ id: 1, idx: 1, title: "Opening", status: "DRAFT", text_content: "Chapter 1 source text." }],
        staging: { user_prose: "Chapter 1 draft text.", llm_prose: "", status: "draft" },
        v3_draft: null,
      },
    });
  });

  await page.route(`**/api/${storySlug}/ingest/validate`, async (route) => {
    validatePosts += 1;
    await route.fulfill({
      json: {
        ok: true,
        summary: { mode: "PASTE_TEXT", total_chapters: 1, total_scenes_estimate: 2 },
      },
    });
  });

  await page.exposeFunction("ingestValidatePostCount", () => validatePosts);

  await page.route(new RegExp(`/api/stories/${storySlug}/assistant/conversations(?:\\?.*)?$`), async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const item: ConversationItem = {
        id: conversationId,
        chapter_id: typeof body.chapter_id === "string" ? body.chapter_id : null,
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

  await page.route(new RegExp(`/api/stories/${storySlug}/assistant/conversations/${conversationId}(?:\\?.*)?$`), async (route) => {
    await route.fulfill({ json: { ok: true, item: conversations[0] ?? null } });
  });

  await page.route(new RegExp(`/api/stories/${storySlug}/assistant/conversations/${conversationId}/messages(?:\\?.*)?$`), async (route) => {
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
}

async function openWriteWorkspace(page: Page) {
  await mockWriteWorkspace(page);
  await page.goto(`/stories/${storySlug}/write`);
  await expect(page.getByLabel("Studio chat composer")).toBeVisible();
}

async function openIngestForm(page: Page) {
  await page.getByLabel("Studio chat composer").fill("/ingest");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Attach source file")).toBeVisible();
}

test.describe("Ingest command", () => {
  test("/ingest accepts a source URL and renders split preview without navigation", async ({ page }) => {
    await openWriteWorkspace(page);
    await openIngestForm(page);

    await page.getByLabel("Source URL or text").fill("https://example.test/subcurrent/source.txt");
    await page.getByRole("button", { name: "Run preflight" }).click();

    const card = page.locator("[data-artifact-card][data-artifact-type='source']").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-artifact-status", "pending");
    await expect(page.getByText("Scene boundary 1: External source fetch - word count pending")).toBeVisible();
    await expect(page.getByText("Open full ingest workspace")).toBeVisible();
    await expect(page).not.toHaveURL(/\/ingest(\/|$)/);
    await expect.poll(() => page.evaluate(() => (window as unknown as { ingestValidatePostCount: () => number }).ingestValidatePostCount())).toBe(0);
  });

  test("/ingest accepts a file attachment and validates pasted text", async ({ page }) => {
    await openWriteWorkspace(page);
    await openIngestForm(page);

    await page.getByLabel("Attach source file").setInputFiles({
      name: "chapter-11.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("## Scene 1\nMira follows the tide signal.\n\n---\n\nNoor maps the radio current."),
    });
    await expect(page.getByText("Attached: chapter-11.txt")).toBeVisible();
    await page.getByRole("button", { name: "Run preflight" }).click();

    const card = page.locator("[data-artifact-card][data-artifact-type='source']").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-artifact-status", "pending");
    await expect(page.getByText(/Validated: 1 chapter\(s\), 2 scene estimate\(s\)/)).toBeVisible();
    await expect(card.getByRole("button", { name: "approve splits" })).toBeVisible();
    await expect(card.getByRole("button", { name: "reject splits" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { ingestValidatePostCount: () => number }).ingestValidatePostCount())).toBe(1);
  });

  test("inline split approval updates the ingest artifact state", async ({ page }) => {
    await openWriteWorkspace(page);
    await openIngestForm(page);

    await page.getByLabel("Source URL or text").fill("## Scene 1\nMira follows the tide signal.\n\n---\n\nNoor maps the radio current.");
    await page.getByRole("button", { name: "Run preflight" }).click();

    await page.locator("[data-artifact-card][data-artifact-type='source']").first().getByRole("button", { name: "approve splits" }).click();
    await expect(page.locator("[data-artifact-card][data-artifact-type='source'][data-artifact-status='approved']").last()).toBeVisible();
    await expect(page).not.toHaveURL(/\/ingest(\/|$)/);
  });
});
