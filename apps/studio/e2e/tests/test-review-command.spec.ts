import { expect, type Page, test } from "@playwright/test";

const storySlug = "subcurrent";
const conversationId = "00000000-0000-4000-8000-000000000142";

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
  const responses: Array<Record<string, unknown>> = [];
  let approvePosts = 0;

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

  await page.route(`**/api/${storySlug}/reviews**`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.action === "submit_response") {
        approvePosts += body.suggestions_text === "Approved from Write review card." ? 1 : 0;
        responses.unshift({
          id: responses.length + 1,
          reviewer_name: "write_assistant",
          scores_json: body.scores_json,
          flags_json: body.flags_json,
          suggestions_text: body.suggestions_text,
          canon_proposals_json: [],
          created_at: new Date().toISOString(),
        });
      }
      await route.fulfill({ json: { ok: true, action: body.action, request_id: 501, response_id: responses[0]?.id ?? 1 } });
      return;
    }

    const url = new URL(route.request().url());
    await route.fulfill({
      json: {
        ok: true,
        requests: [{
          id: 501,
          story_id: 1,
          scene_version_id: 1001,
          chapter_id: "1",
          is_v3: true,
          job_id: null,
          status: responses.length ? "SUBMITTED" : "OPEN",
          rubric_version: "v1",
          created_at: "2026-05-20 10:00:00",
          scene_id: 1,
          version_no: 1,
          workunit_id: null,
          legacy_chapter_id: "1",
          idx: 1,
        }],
        responses: url.searchParams.has("request_id") ? responses : [],
      },
    });
  });

  await page.exposeFunction("approvePostCount", () => approvePosts);

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

async function runReview(page: Page) {
  await page.getByLabel("Studio chat composer").fill("/review chapter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Run preflight" }).click();
}

test.describe("Review command", () => {
  test("/review chapter renders pending review artifact without navigation", async ({ page }) => {
    await openWriteWorkspace(page);
    await runReview(page);

    const card = page.locator("[data-artifact-card][data-artifact-type='review']").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-artifact-status", "pending");
    await expect(card.getByRole("button", { name: "approve review" })).toBeVisible();
    await expect(card.getByRole("button", { name: "reject review" })).toBeVisible();
    await expect(page.getByText("Open full reviews workspace")).toBeVisible();
    await expect(page).not.toHaveURL(/\/reviews(\/|$)/);
  });

  test("approve action updates review artifact idempotently", async ({ page }) => {
    await openWriteWorkspace(page);
    await runReview(page);

    await page.locator("[data-artifact-card][data-artifact-type='review']").first().getByRole("button", { name: "approve review" }).dblclick();
    const approvedCard = page.locator("[data-artifact-card][data-artifact-type='review'][data-artifact-status='approved']").last();
    await expect(approvedCard).toBeVisible();
    await expect(approvedCard.getByRole("button", { name: "apply review" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { approvePostCount: () => number }).approvePostCount())).toBe(1);
  });

  test("review card opens inspector feedback and state", async ({ page }) => {
    await openWriteWorkspace(page);
    await runReview(page);

    await page.locator("[data-artifact-card][data-artifact-type='review']").first().getByRole("button", { name: "Open" }).click();
    const inspector = page.locator(".artifact-inspector");
    await expect(page.getByRole("tab", { name: "Artifacts" })).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByText("State: pending")).toBeVisible();
    await expect(inspector.getByText("No reviewer feedback submitted yet.")).toBeVisible();
  });
});
