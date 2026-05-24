import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000140";

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

  await page.route(`**/api/stories/${storySlug}/analysis**`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        active_snapshot_id: 410,
        items: [{
          id: 410,
          chapter_id: "1",
          fact_status: "CLEAN",
          ready_for_writing: true,
          degraded_mode: false,
          narrative_score: 0.91,
          emotional_target: "uneasy resolve",
          created_at: new Date().toISOString(),
          active: true,
          scope_type: "chapter",
          scope_key: "1",
          status: "APPROVED",
          vetting_summary: { duplicate_count: 0, conflict_count: 0 },
          analysis_data: {
            snapshot_v3: {
              open_loops: [{ description: "Offshore relay still unanswered" }],
              character_voices: [{ name: "Mira", tone: "controlled urgency" }],
              narrative_metrics: { narrative_score: 0.91, narrative_tension: 0.73, lore_debt: false },
              subplots_open: [{ description: "Crew must choose whether to follow the signal" }],
            },
          },
        }],
      },
    });
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

async function openWriteWorkspace(page: Page) {
  await mockWriteWorkspace(page);
  await page.goto(`/stories/${storySlug}/write`);
  await expect(page.getByLabel("Studio chat composer")).toBeVisible();
}

async function runAnalyze(page: Page) {
  await page.getByLabel("Studio chat composer").fill("/analyze chapter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run preflight" }).click();
}

test.describe("Analyze command", () => {
  test("/analyze chapter renders cached analysis artifact without navigation", async ({ page }) => {
    await openWriteWorkspace(page);
    await runAnalyze(page);

    const card = page.locator("[data-artifact-card][data-artifact-type='analysis']").first();
    const artifact = page.locator(".timeline-card--artifact").filter({ hasText: "Chapter 1 analysis artifact" }).first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-artifact-status", "draft");
    await expect(artifact.getByText("Readiness verdict: ready")).toBeVisible();
    await expect(artifact.getByText("Using cached analysis under 5 minutes old.")).toBeVisible();
    await expect(artifact.getByText("Open full analysis workspace")).toBeVisible();
    await expect(page).not.toHaveURL(/\/analysis(\/|$)/);
  });

  test("analysis card opens inspector findings", async ({ page }) => {
    await openWriteWorkspace(page);
    await runAnalyze(page);

    await page.locator("[data-artifact-card][data-artifact-type='analysis']").getByRole("button", { name: "Open", exact: true }).click();
    const inspector = page.locator(".artifact-inspector");
    await expect(page.getByRole("tab", { name: "Artifacts" })).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByText("Offshore relay still unanswered")).toBeVisible();
    await expect(inspector.getByText("Mira: controlled urgency")).toBeVisible();
    await expect(inspector.getByText("Crew must choose whether to follow the signal")).toBeVisible();
  });
});
