import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000144";

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
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { ok: true, chapter_id: "2" }, status: 201 });
      return;
    }
    await route.fulfill({ json: { ok: true, items: [{ chapter_id: "1" }] } });
  });

  await page.route(`**/api/stories/${storySlug}/chapters/1/full`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        items: [
          {
            id: 1,
            idx: 1,
            title: "Opening",
            status: "DRAFT",
            text_content: "A compact fixture chapter with enough prose for artifact search and inspector scroll checks.",
          },
        ],
        staging: {
          user_prose: Array.from({ length: 60 }, (_, index) => `Fixture paragraph ${index + 1} with artifact search text.`).join("\n\n"),
          llm_prose: "",
          status: "draft",
        },
        v3_draft: null,
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/context**`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        item: {
          scope: "chapter",
          chapterId: "1",
          title: "Chapter 1 context snapshot",
          characters: ["Mira: signal diver"],
          arcs: ["Recovery thread (sub)"],
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
    const request = route.request();
    if (request.method() === "POST") {
      const item: ConversationItem = {
        id: conversationId,
        chapter_id: "1",
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
      let body: Record<string, unknown> = {};
      try {
        body = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        body = {};
      }
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

async function runCommand(page: Page, command: string) {
  await page.getByLabel("Studio chat composer").fill(command);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run preflight" }).click();
}

test.describe("Chat artifact interactions", () => {
  test("long paste creates a source artifact confirmation", async ({ page }) => {
    await openWriteWorkspace(page);
    await page.getByLabel("Studio chat composer").fill("x".repeat(8001));
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Create source artifact from pasted text?")).toBeVisible();
    await page.getByRole("button", { name: "Create source artifact" }).click();
    await expect(page.locator("[data-artifact-card][data-artifact-type='source']")).toBeVisible();
  });

  test("artifact cards remain compact", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/analyze chapter");
    const card = page.locator("[data-artifact-card][data-artifact-type='analysis']").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box?.height ?? 999).toBeLessThanOrEqual(200);
  });

  test("artifact open updates inspector without navigation", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/review chapter");
    await page.locator("[data-artifact-card][data-artifact-type='review']").getByRole("button", { name: "Open" }).click();
    await expect(page.getByRole("tab", { name: "Artifacts" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/(memory|analysis|reviews|ingest|pipelines)(\/|$)/);
  });

  test("inspector scroll is independent from chat scroll", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/analyze chapter");
    await page.locator("[data-artifact-card][data-artifact-type='analysis']").getByRole("button", { name: "Open" }).click();
    await expect(page.locator(".work-stream__scroll")).toHaveCSS("overflow-y", "auto");
    await expect(page.locator(".artifact-inspector")).toHaveCSS("overflow-y", "auto");
  });

  test("mobile artifact surface uses a drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openWriteWorkspace(page);
    await runCommand(page, "/analyze chapter");
    await expect(page.locator(".artifact-workspace")).toHaveAttribute("data-drawer-open", "true");
  });

  test("progress command renders workflow stages", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/pipeline");
    await expect(page.locator(".timeline-card--workflow").getByText("Pipeline Progress")).toBeVisible();
    await expect(page.getByText("Inspecting active workflow state")).toBeVisible();
  });

  test("review cards expose review state labels", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/review chapter");
    const card = page.locator("[data-artifact-card][data-artifact-type='review']").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-artifact-status", "draft");
  });

  test("secondary workspace nav guard keeps commands on write route", async ({ page }) => {
    await openWriteWorkspace(page);
    await runCommand(page, "/memory");
    await expect(page.getByText("Open full Memory Hub")).toBeVisible();
    await expect(page).toHaveURL(/\/stories\/subcurrent\/write/);
  });
});
