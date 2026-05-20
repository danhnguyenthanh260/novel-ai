import type { Page, Route } from "@playwright/test";

const storySlug = "subcurrent";
const generatedChapterId = "11";
const generatedDraft = [
  "Chapter 11 opens on the rain-slick pier after the tenth chapter's signal collapse.",
  "Mira keeps the transmitter alive long enough to catch the hidden reply from the offshore relay.",
  "The scene ends with the crew choosing to follow the signal instead of retreating inland.",
].join("\n\n");

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

type StoredMessage = { block: unknown };

export type SubcurrentFixtureState = {
  storySlug: string;
  generatedChapterId: string;
  generatedDraft: string;
  createdChapter11: () => boolean;
  chapter11Saved: () => boolean;
  teardownChapter11: () => void;
};

function chapterTitle(chapterId: string): string {
  return `Chapter ${chapterId}`;
}

function uuidFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function chapterFromUrl(url: string): string {
  return new URL(url).pathname.match(/chapters\/([^/]+)/)?.[1] ?? "1";
}

function jsonBody(route: Route): Record<string, unknown> {
  try {
    return route.request().postDataJSON() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function setupSubcurrentStoryFixture(page: Page): Promise<SubcurrentFixtureState> {
  const chapters = Array.from({ length: 10 }, (_, index) => String(index + 1));
  const drafts = new Map<string, string>();
  const conversations: ConversationItem[] = [];
  const messagesByConversation = new Map<string, StoredMessage[]>();
  let conversationCount = 0;

  await page.route("**/api/stories", async (route) => {
    await route.fulfill({ json: { ok: true, items: [{ slug: storySlug, title: "Subcurrent", status: "draft" }] } });
  });

  await page.route(`**/api/${storySlug}/scenes`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        items: chapters.map((chapterId, index) => ({
          id: index + 1,
          chapter_id: chapterId,
          idx: 1,
          title: chapterTitle(chapterId),
          status: "DRAFTING",
          workunit_id: null,
        })),
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/chapters`, async (route) => {
    if (route.request().method() === "POST") {
      if (!chapters.includes(generatedChapterId)) chapters.push(generatedChapterId);
      await route.fulfill({ json: { ok: true, chapter_id: generatedChapterId }, status: 201 });
      return;
    }
    await route.fulfill({ json: { ok: true, items: chapters.map((chapter_id) => ({ chapter_id })) } });
  });

  await page.route(`**/api/stories/${storySlug}/chapters/*/full`, async (route) => {
    const chapterId = chapterFromUrl(route.request().url());
    const draft = drafts.get(chapterId) ?? "";
    await route.fulfill({
      json: {
        ok: true,
        items: [{
          id: Number(chapterId),
          idx: 1,
          title: chapterTitle(chapterId),
          status: "DRAFT",
          text_content: draft || `${chapterTitle(chapterId)} source fixture with active characters and continuity.`,
        }],
        staging: draft ? { user_prose: draft, llm_prose: "", status: "draft" } : null,
        v3_draft: null,
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/assistant/status**`, async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope") === "story" ? "story" : "chapter";
    await route.fulfill({
      json: {
        ok: true,
        item: {
          scope,
          chapterId: scope === "chapter" ? url.searchParams.get("chapter_id") ?? generatedChapterId : null,
          chapterCount: chapters.length,
          lastWriteAt: drafts.has(generatedChapterId) ? "2026-05-19 12:00:00" : "2026-05-18 12:00:00",
          memoryCompleteness: 92,
          analysisFlags: { activeSnapshots: 10, sourceDocs: 10, hasActiveSnapshot: true },
          readiness: "ready",
          missing: [],
          nextAction: "Generate Chapter 11 draft.",
        },
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/chapters/*/auto-write/status**`, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        job_id: 13611,
        status: "DONE",
        progress: { done_tasks: 3, total_tasks: 3 },
        staging_ready: true,
        prose: generatedDraft,
        word_count: generatedDraft.trim().split(/\s+/).length,
        integrity_report: { location_verified: true, objects_tracked: ["transmitter", "offshore relay"], character_drift_detected: false },
        latest_task: { task_type: "CHAPTER_WRITE_V3", status: "DONE", error: null },
        final_review_ready: true,
        quality_gate_report_v1: { pass: true, fail_codes: [], checks: { continuity: { pass: true, detail: "Fixture continuity clean." } } },
      },
    });
  });

  await page.route(`**/api/stories/${storySlug}/chapters/*/auto-write`, async (route) => {
    await route.fulfill({ json: { ok: true, job_id: 13611, status: "RUNNING" }, status: 202 });
  });

  await page.route(`**/api/stories/${storySlug}/chapters/*/stage`, async (route) => {
    const chapterId = chapterFromUrl(route.request().url());
    const body = jsonBody(route);
    drafts.set(chapterId, typeof body.prose === "string" ? body.prose : generatedDraft);
    await route.fulfill({ json: { ok: true, chapter_id: chapterId } });
  });

  await page.route(new RegExp(`/api/stories/${storySlug}/assistant/conversations/[^/]+/messages(?:\\?.*)?$`), async (route) => {
    const conversationId = new URL(route.request().url()).pathname.match(/conversations\/([^/]+)\/messages$/)?.[1] ?? "";
    const rows = messagesByConversation.get(conversationId) ?? [];
    if (route.request().method() === "POST") {
      const body = jsonBody(route);
      const metadata = body.metadata_json && typeof body.metadata_json === "object" && !Array.isArray(body.metadata_json)
        ? body.metadata_json as Record<string, unknown>
        : {};
      rows.push({ block: metadata.block ?? null });
      messagesByConversation.set(conversationId, rows);
      await route.fulfill({ json: { ok: true, item: { id: `${rows.length}`, block: rows.at(-1)?.block } }, status: 201 });
      return;
    }
    await route.fulfill({ json: { ok: true, items: rows } });
  });

  await page.route(new RegExp(`/api/stories/${storySlug}/assistant/conversations/[^/]+(?:\\?.*)?$`), async (route) => {
    const conversationId = new URL(route.request().url()).pathname.match(/conversations\/([^/]+)$/)?.[1] ?? "";
    const item = conversations.find((conversation) => conversation.id === conversationId) ?? null;
    await route.fulfill({ json: { ok: true, item } });
  });

  await page.route(new RegExp(`/api/stories/${storySlug}/assistant/conversations(?:\\?.*)?$`), async (route) => {
    if (route.request().method() === "POST") {
      const body = jsonBody(route);
      const requestedChapterId = typeof body.chapter_id === "string" ? body.chapter_id : null;
      const existing = conversations.find((conversation) => conversation.chapter_id === requestedChapterId);
      if (existing) {
        await route.fulfill({ json: { ok: true, item: existing }, status: 201 });
        return;
      }
      conversationCount += 1;
      const item: ConversationItem = {
        id: uuidFor(conversationCount),
        chapter_id: requestedChapterId,
        title: null,
        summary: null,
        status: "active",
        state_json: {},
        updated_at: new Date().toISOString(),
        last_message_preview: null,
      };
      conversations.unshift(item);
      await route.fulfill({ json: { ok: true, item }, status: 201 });
      return;
    }

    await route.fulfill({ json: { ok: true, items: conversations } });
  });

  return {
    storySlug,
    generatedChapterId,
    generatedDraft,
    createdChapter11: () => chapters.includes(generatedChapterId),
    chapter11Saved: () => drafts.has(generatedChapterId),
    teardownChapter11: () => {
      drafts.delete(generatedChapterId);
      const index = chapters.indexOf(generatedChapterId);
      if (index >= 0) chapters.splice(index, 1);
      if (chapters.includes(generatedChapterId) || drafts.has(generatedChapterId)) {
        throw new Error("CHAPTER_11_TEARDOWN_FAILED");
      }
    },
  };
}
