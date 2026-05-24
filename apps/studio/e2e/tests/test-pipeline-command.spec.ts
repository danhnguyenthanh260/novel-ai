import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000141";

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

  await page.route(`**/api/${storySlug}/pipelines/overview`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        contract_version: "pipeline_overview_v1",
        generated_at: new Date().toISOString(),
        kpi: { total_jobs: 1, running_jobs: 1, failed_jobs: 0, wait_review_jobs: 0, done_jobs: 0 },
        health: { ready_backlog: 1, running_tasks: 1, alert_count: 1 },
        alerts: [{ job_id: 14101, node_key: "WRITING_ANALYSIS", alert_type: "READY_STALLED", message: "WRITING_ANALYSIS ready 12s" }],
        jobs: [{
          id: 14101,
          status: "RUNNING",
          mode: "CHAPTER_WRITE_V3",
          total_tasks: 4,
          completed_tasks: 2,
          created_by: "writing_pipeline",
          created_at: "2026-05-20 10:00:00",
          updated_at: "2026-05-20 10:03:00",
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

async function runPipeline(page: Page) {
  await page.getByLabel("Studio chat composer").fill("/pipeline");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run preflight" }).click();
}

test.describe("Pipeline command", () => {
  test("/pipeline renders backend progress without navigation", async ({ page }) => {
    await openWriteWorkspace(page);
    await runPipeline(page);

    const progress = page.locator(".timeline-card--workflow").filter({ hasText: "Pipeline Progress" }).first();
    await expect(progress).toBeVisible();
    await expect(progress.getByText("Step 3 of 4 - Running CHAPTER_WRITE_V3")).toBeVisible();
    await expect(progress.getByText("Open full pipelines workspace")).toBeVisible();
    await expect(page).not.toHaveURL(/\/pipelines(\/|$)/);
  });

  test("pipeline inspector shows timing and log summary", async ({ page }) => {
    await openWriteWorkspace(page);
    await runPipeline(page);

    const inspector = page.locator(".artifact-inspector");
    await expect(page.getByRole("tab", { name: "Progress" })).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByText("Completed tasks: 2/4")).toBeVisible();
    await expect(inspector.getByText("WRITING_ANALYSIS: WRITING_ANALYSIS ready 12s")).toBeVisible();
    await expect(inspector.getByText("Running tasks: 1")).toBeVisible();
  });
});
