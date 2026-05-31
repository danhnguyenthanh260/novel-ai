import type { Page, Route } from "@playwright/test";

const storySlug = "subcurrent";
const generatedChapterId = "11";
const generatedDraft = [
  "Chapter 11: Frequencies of Memory",
  "",
  "The room quieted after the decision.",
  "",
  "Not silence. Not exactly. Silence still had edges, small things left inside it: the soft click of Mike's pencil against the table, the weight of Cerin shifting in the chair, the tired breath caught somewhere behind Kuro's teeth.",
  "",
  "This was different.",
  "",
  "The city had not gone quiet. It had been lowered.",
  "",
  "Kuro kept one hand on the table, fingers spread over the papers Mike had carried from the restricted archive. The silk-paper map lay beneath his palm, thin enough that the wood grain showed through it in pale brown lines. Symbols from the Hollow crossed the page in broken arcs. Northward-facing stones. Buried circles. Repeating marks that were too deliberate to be weather and too old to belong to the academy catalog.",
  "",
  "Outside the window, Noctis continued as if nothing had changed. Electric cars slid along the lower road. A transit announcement murmured from the corner speaker, delayed by the evening fog. Somewhere above the rooftops, a relay tower blinked at its correct interval.",
  "",
  "Correct. Perfect. Untroubled.",
  "",
  "And yet the hum behind the wall had flattened.",
  "",
  "Kuro looked up.",
  "",
  "\"Did you feel that?\" Cerin asked.",
  "",
  "Mike had already stopped stacking the papers. His shoulders were tense, but his hands were very still, the way they became when some part of his mind had outrun the rest of him.",
  "",
  "\"Feel what?\" he said, though his voice made the question useless.",
  "",
  "Kuro closed his eyes.",
  "",
  "The world usually arrived now as pressure and direction. Color without sight. Vectors without names. Since the Hollow, every person carried a center and every space carried a slope. Mike burned denser than before, compact and restless. Cerin felt quieter, not empty but guarded, like a page held shut by a thumb. The room itself had always been ordinary: table, walls, wires, window, air.",
  "",
  "Now there was a gap in it.",
  "",
  "Not a hole. Holes had boundaries. This had no boundary, only a place where his attention slid away and returned with less than it had brought.",
  "",
  "\"There,\" Kuro said.",
  "",
  "He opened his eyes and pointed to nothing at all.",
  "",
  "Mike followed the gesture toward the corner near the old power outlet. Cerin leaned forward. For several seconds, none of them moved.",
  "",
  "Then the notebook on the table trembled.",
  "",
  "Only once.",
  "",
  "A small movement. So small it could have been the building settling. So small that any sensible person would have ignored it and gone back to the map, to the symbols, to the easier fear of places they could visit with boots and rope and a borrowed flashlight.",
  "",
  "But all three of them watched the pencil roll half an inch toward the north edge of the table.",
  "",
  "Mike swallowed.",
  "",
  "\"No draft,\" he said.",
  "",
  "Cerin's eyes narrowed. \"The window is closed.\"",
  "",
  "\"I know.\"",
  "",
  "Kuro did not touch the pencil. The scraped skin on his palm had begun to sting again under the bandage, a dull heat pulsing in time with something that was not his heartbeat.",
  "",
  "The same feeling returned from the road. From the moment the gray bike crossed him without warning, from the instant he had stood up and realized the accident had not scattered his awareness. If anything, it had sharpened it. The boy, the mother, the wheels, the skin tearing open. He had noticed too much.",
  "",
  "Maybe that was the change.",
  "",
  "Maybe the Hollow had not given him a new sense. Maybe it had removed whatever taught people not to see.",
  "",
  "\"Show me the image again,\" Kuro said.",
  "",
  "Mike hesitated, then opened the external drive. The screen lit his face blue. Folders, timestamps, recovered frames. He found the thermal scan from the third device, the one with the blurry human-shaped figure near the edge.",
  "",
  "Cerin moved behind him.",
  "",
  "\"That one,\" Kuro said.",
  "",
  "Mike enlarged the figure until the pixels became a damaged mosaic of light and shadow. Arms outstretched. Head tilted back. A glow that was not sunlight gathered around the skull and shoulders.",
  "",
  "For the first time, Kuro did not look at it as an image.",
  "",
  "He looked for the absence around it.",
  "",
  "There.",
  "",
  "A thin interruption in the noise. Not the figure itself, but the space beside it, where the sensor had recorded less than it should. The same lowered quality. The same subtraction.",
  "",
  "\"It's not emitting,\" Kuro said slowly.",
  "",
  "Mike turned. \"What?\"",
  "",
  "\"Everyone keeps looking at the glow. The stones. The thermal change.\" Kuro tapped the edge of the screen, not touching the figure but the blur next to it. \"Maybe that's only what the device could still record. What matters is this part.\"",
  "",
  "Cerin bent closer. \"Empty space?\"",
  "",
  "\"No.\" Kuro's throat felt dry. \"Space that refuses to be measured.\"",
  "",
  "Mike stared for a long moment. Then he pulled his notebook open so fast the cover struck the table.",
  "",
  "\"Frequency doesn't disappear,\" he muttered. \"If the signal drops, it goes somewhere. Absorption, conversion, cancellation...\"",
  "",
  "\"Or hiding,\" Cerin said.",
  "",
  "The word remained in the room longer than it should have.",
  "",
  "Hiding.",
  "",
  "Kuro thought of the government records that stopped before giving names. The climbing report that treated hallucinations as weather. The satellite coordinate always covered by cloud or foliage. R-13 Trace. The survey team in eastern Luxios. The old maps without catalog codes. All of them were different kinds of absence, arranged neatly enough to be mistaken for neglect.",
  "",
  "Noctis had always been good at continuing.",
  "",
  "Lights turned on. Classes resumed. Students picked their future paths. Luxios updates scrolled across public screens. The city did not deny mystery. It simply placed routine over it until the shape underneath became hard to see.",
  "",
  "The pencil moved again.",
  "",
  "This time, it rolled back.",
  "",
  "Mike's hand shot out and caught it.",
  "",
  "For a second, his fingers closed too hard. The wood cracked faintly.",
  "",
  "He looked down, startled by his own grip.",
  "",
  "Cerin saw it too, but said nothing.",
  "",
  "Kuro filed the silence away. Mike's body had changed. Stronger. Thirstier. Denser in the strange inner sight. Kuro could feel direction and pressure. What had Cerin brought back from the Hollow, if anything?",
  "",
  "The thought must have reached his face, because Cerin looked at him.",
  "",
  "\"Don't start,\" Cerin said.",
  "",
  "Kuro blinked. \"I didn't say anything.\"",
  "",
  "\"You were about to.\"",
  "",
  "Mike laughed once, too sharply, then stopped. The sound made the room feel normal for less than a breath.",
  "",
  "Kuro lowered his gaze to the torn wartime map. One line from the underground shelter network curved toward the old forest road before breaking off. Beside it, almost erased, was a mark shaped like the Hollow's inward-facing stones.",
  "",
  "\"If we go back,\" he said, \"we don't go because we're curious.\"",
  "",
  "Mike did not answer.",
  "",
  "\"We go because something from there followed us,\" Kuro continued. \"Or because it was already here and we only learned how to notice.\"",
  "",
  "Outside, the relay tower blinked again.",
  "",
  "This time, it missed one interval.",
  "",
  "Cerin turned toward the window.",
  "",
  "Mike's screen flickered. A new file appeared in the recovered folder, though none of them had touched the drive.",
  "",
  "No title. No extension.",
  "",
  "Only a timestamp.",
  "",
  "Eighteen years old.",
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
          title: chapterId === generatedChapterId ? "Chapter 11: Frequencies of Memory" : chapterTitle(chapterId),
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
          text_content: draft || `${chapterTitle(chapterId)} source fixture for The Subcurrent with Kuro, Mike, Cerin, the Hollow, current perception, Noctis, and unresolved archive evidence.`,
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
          analysisFlags: {
            activeSnapshots: 10,
            sourceDocs: 10,
            hasActiveSnapshot: true,
            styleBand: "style_gold:chapters-1-10",
            continuitySource: "chapters-1-10",
          },
          readiness: "ready",
          missing: [],
          nextAction: "Build Chapter 11 readiness pack, outline, then generate draft from chapters 1-10.",
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
        integrity_report: {
          location_verified: true,
          objects_tracked: ["silk-paper map", "external drive", "thermal scan", "relay tower"],
          character_drift_detected: false,
          continuity_handoff: "Chapter 10 ends with Kuro, Mike, and Cerin deciding to return to the Hollow after archive discoveries and a new current-like absence.",
          style_source: "chapters 1-10",
        },
        latest_task: { task_type: "CHAPTER_WRITE_V3", status: "DONE", error: null },
        final_review_ready: true,
        quality_gate_report_v1: {
          pass: true,
          fail_codes: [],
          checks: {
            continuity: { pass: true, detail: "Chapter 11 preserves Chapter 10 handoff: archive maps, current-like absence, Kuro/Mike/Cerin decision." },
            style: { pass: true, detail: "Draft uses chapters 1-10 as style_gold and avoids later weak-prose weighting." },
            timeline: { pass: true, detail: "Draft continues immediately after Chapter 10 room quiets." },
          },
        },
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
