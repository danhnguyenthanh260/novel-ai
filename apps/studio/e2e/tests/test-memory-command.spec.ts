import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000139";

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

function contextPayload(commandUrl: string) {
  const url = new URL(commandUrl);
  const scope = url.searchParams.get("scope") === "story" ? "story" : "chapter";
  return {
    ok: true,
    item: {
      scope,
      chapterId: scope === "chapter" ? url.searchParams.get("chapter_id") ?? "1" : null,
      title: scope === "story" ? "Story context snapshot" : "Chapter 1 context snapshot",
      characters: scope === "story" ? ["Mira: signal diver", "Noor: radio cartographer"] : ["Mira: signal diver"],
      arcs: scope === "story" ? ["Main current (main)"] : ["Recovery thread (sub)"],
      tags: ["subcurrent", "coastal"],
      styleNotes: ["Voice: sparse, sensory prose"],
      included: [],
      missing: [],
      degraded: [],
      conflicts: [],
    },
  };
}

async function mockWriteWorkspace(page: Page) {
  const conversations: ConversationItem[] = [];
  const messages: Array<{ block: unknown }> = [];

  await page.route("**/api/stories", async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ slug: storySlug, title: "Subcurrent", status: "draft" }] } });
  });

  await page.route(`**/api/${storySlug}/scenes`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        items: [{ id: 1, chapter_id: "1", idx: 1, title: "Opening", status: "DRAFTING", workunit_id: null }],
      },
    });
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

  await page.route(`**/api/stories/${storySlug}/assistant/context**`, async (route) => {
    await route.fulfill({ json: contextPayload(route.request().url()) });
  });

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

async function openWriteWorkspace(page: Page, scope: "story" | "chapter" = "chapter") {
  await mockWriteWorkspace(page);
  await page.goto(scope === "story" ? `/stories/${storySlug}/write?scope=story` : `/stories/${storySlug}/write`);
  await expect(page.getByLabel("Studio chat composer")).toBeVisible();
}

async function runCommand(page: Page, command: "/memory" | "/extract memory") {
  await page.getByLabel("Studio chat composer").fill(command);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run preflight" }).click();
}

test.describe("Memory command", () => {
  test("/memory renders a compact memory artifact without navigation", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/memory");

    const card = page.locator("[data-artifact-card][data-artifact-type='memory']").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-artifact-status", "draft");
    await expect(page.locator(".timeline-card--digest").filter({ hasText: "Chapter 1 memory snapshot" })).toBeVisible();
    await expect(page.getByText("Open full Memory Hub")).toBeVisible();
    await expect(page).not.toHaveURL(/\/memory(\/|$)/);
  });

  test("memory card opens inspector with characters, arcs, and tags", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/memory");

    await page.locator("[data-artifact-card][data-artifact-type='memory']").getByRole("button", { name: "Open" }).click();
    const inspector = page.locator(".artifact-inspector");
    await expect(page.getByRole("tab", { name: "Memory" })).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByText("Mira: signal diver")).toBeVisible();
    await expect(inspector.getByText("Recovery thread (sub)")).toBeVisible();
    await expect(inspector.getByText("subcurrent")).toBeVisible();
    await expect(inspector.getByText("Voice: sparse, sensory prose")).toBeVisible();
  });

  test("/extract memory uses the same in-workspace snapshot contract", async ({ page }) => {
    await openWriteWorkspace(page, "story");
    await runCommand(page, "/extract memory");

    await expect(page.locator("[data-artifact-card][data-artifact-type='memory']").first()).toBeVisible();
    await expect(page.locator(".timeline-card--digest").filter({ hasText: "Story memory snapshot" })).toBeVisible();
    await expect(page).toHaveURL(/\/stories\/subcurrent\/write\?scope=story/);
  });
});
