import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000138";

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

async function mockWriteWorkspace(page: Page, options: { emptyStory?: boolean } = {}) {
  const conversations: ConversationItem[] = [];
  const messages: Array<{ block: unknown }> = [];

  await page.route("**/api/stories", async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ slug: storySlug, title: "Subcurrent", status: "draft" }] } });
  });

  await page.route(`**/api/${storySlug}/scenes`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        items: options.emptyStory
          ? []
          : [{ id: 1, chapter_id: "1", idx: 1, title: "Opening", status: "DRAFTING", workunit_id: null }],
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/chapters`, async (route) => {
    await route.fulfill({ json: { ok: true, items: options.emptyStory ? [] : [{ chapter_id: "1" }, { chapter_id: "2" }] } });
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
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope") === "story" ? "story" : "chapter";
    const empty = options.emptyStory && scope === "story";
    await route.fulfill({
      json: {
        ok: true,
        item: {
          scope,
          chapterId: scope === "chapter" ? url.searchParams.get("chapter_id") ?? "1" : null,
          chapterCount: empty ? 0 : scope === "story" ? 10 : 1,
          lastWriteAt: empty ? null : "2026-05-18 12:00:00",
          memoryCompleteness: empty ? 25 : scope === "story" ? 88 : 63,
          analysisFlags: { activeSnapshots: empty ? 0 : 1, sourceDocs: empty ? 0 : 10, hasActiveSnapshot: !empty },
          readiness: empty ? "needs-context" : "ready",
          missing: empty ? ["Source chapter", "Source material"] : [],
          nextAction: empty ? "Create first chapter or ingest source material." : "Continue with the next writing command.",
        },
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/context**`, async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope") === "story" ? "story" : "chapter";
    await route.fulfill({
      json: {
        ok: true,
        item: {
          scope,
          chapterId: scope === "chapter" ? url.searchParams.get("chapter_id") ?? "1" : null,
          title: scope === "story" ? "Story context snapshot" : "Chapter 1 context snapshot",
          characters: scope === "story" ? ["Mira: signal diver"] : ["Mira: injured but active"],
          arcs: scope === "story" ? ["Main current (main)"] : ["Recovery thread (sub)"],
          tags: ["subcurrent", "coastal"],
          styleNotes: ["Voice: sparse, sensory prose"],
          included: [],
          missing: [],
          degraded: [],
          conflicts: [],
        },
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/conversations**`, async (route) => {
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
}

async function openWorkspace(page: Page, scope: "story" | "chapter" = "chapter", options: { emptyStory?: boolean } = {}) {
  await mockWriteWorkspace(page, options);
  await page.goto(scope === "story" ? `/stories/${storySlug}/write?scope=story` : `/stories/${storySlug}/write`);
  await expect(page.getByLabel("Studio chat composer")).toBeVisible();
}

async function runCommand(page: Page, command: string) {
  await page.getByLabel("Studio chat composer").fill(command);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run preflight" }).click();
}

test.describe("Status and context commands", () => {
  test("/status renders readiness and missing list without navigation", async ({ page }) => {
    await openWorkspace(page, "story", { emptyStory: true });
    await runCommand(page, "/status");
    const digest = page.locator(".timeline-card--digest").filter({ hasText: "Story status: needs-context" }).first();
    await expect(digest.getByRole("heading", { name: "Story status: needs-context" })).toBeVisible();
    await expect(digest.getByText("Source chapter")).toBeVisible();
    await expect(digest.getByText(/Next action: Create first chapter/)).toBeVisible();
    await expect(page).toHaveURL(/\/stories\/subcurrent\/write\?scope=story/);
  });

  test("/context renders characters and arcs in the inspector contract", async ({ page }) => {
    await openWorkspace(page);
    await runCommand(page, "/context");
    const digest = page.locator(".timeline-card--digest").filter({ hasText: "Chapter 1 context snapshot" }).first();
    await expect(digest.getByRole("heading", { name: "Chapter 1 context snapshot" })).toBeVisible();
    await expect(digest.getByText(/Characters: Mira/)).toBeVisible();
    await expect(digest.getByText(/Arcs: Recovery thread/)).toBeVisible();
    await expect(page.getByText("Open full Memory Hub")).toBeVisible();
    await expect(page).not.toHaveURL(/\/memory(\/|$)/);
  });

  test("story and chapter scopes return different status summaries", async ({ page }) => {
    await openWorkspace(page, "story");
    await runCommand(page, "/status");
    await expect(page.locator(".timeline-card--digest").filter({ hasText: "Story scope" }).getByText("Chapters: 10")).toBeVisible();
    await page.getByLabel("Chat scope").getByRole("button", { name: "Chapter", exact: true }).click();
    await runCommand(page, "/status");
    await expect(page.locator(".timeline-card--digest").filter({ hasText: "Chapter scope" }).getByText("Chapters: 1")).toBeVisible();
  });

  test("/status and /context complete quickly from mocked command APIs", async ({ page }) => {
    await openWorkspace(page);
    const startedAt = Date.now();
    await runCommand(page, "/status");
    await expect(page.locator(".timeline-card--digest").getByRole("heading", { name: "Chapter status: ready" })).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(1000);
    await runCommand(page, "/context");
    await expect(page.locator(".timeline-card--digest").filter({ hasText: "Chapter 1 context snapshot" }).first()).toBeVisible();
  });
});
