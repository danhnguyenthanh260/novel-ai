import type { Page } from "@playwright/test";

// Protagonist and world constants — used across all mock chapters to ensure continuity.
export const PROTAGONIST = "Mara Voss";
export const SETTING = "The Unmapped City of Caldis";
export const STORY_PREMISE =
  "In a world where maps determine reality, cartographer Mara Voss discovers the official city map contains a ghost district—and someone is trying to erase its existence before she can prove it.";

export type MockChapter = {
  chapterId: string;
  title: string;
  prose: string;
  wordCount: number;
};

export const MOCK_CHAPTERS: Record<string, MockChapter> = {
  "1": {
    chapterId: "1",
    title: "The Ghost District",
    wordCount: 620,
    prose: `${PROTAGONIST} found the discrepancy on a Tuesday, which she would later decide was the most ordinary day a city could choose to begin lying.

She was at her drafting table in the Bureau of Cartographic Records when the difference caught her eye: a full city block, designated K-7 in the official ledger, appeared on the pre-reform survey maps but was absent from every document filed after the Year of Consolidation. Not erased. Not demolished. Simply absent—as if someone had agreed, quietly, that the block had never existed.

The city of ${SETTING} ran on maps. This was not a metaphor. The city charter required that any district, street, or public space be registered in the Bureau's master ledger before it could legally exist. Unregistered places had no standing in court, no claim to resources, no right to repair. For fifty years, the bureau had enforced this rule with the precision of a surgeon and the discretion of a mortician.

${PROTAGONIST} was not supposed to question the ledger. She was supposed to transcribe it.

She transcribed it for two more hours. Then she pulled the pre-reform survey again, flattened it under her palms, and traced the boundary of block K-7 with one finger. The block was there: a full quarter of a square kilometer, dense with what the old notation called "permanent residential structures." Forty-two buildings. Current population: unknown, because current did not acknowledge its existence.

She checked the timestamp on the deletion. The record had been expunged two weeks after the current Chief Cartographer, Director Elara Voss, had taken office.

${PROTAGONIST}'s mother had been Chief Cartographer for thirty-one years.

She rolled the pre-reform survey into its protective cylinder, slid it under her coat, and walked out of the Bureau into the grey afternoon light. Block K-7, if it still existed, would be eleven minutes east by foot.

It was eleven minutes east. And it was still there.

The buildings were darker than the rest of the city—paint faded to the bone-grey of old paper, windows patched with material that was not glass. But smoke rose from two chimneys, and when she stepped off the registered pavement and onto the unregistered stones, she heard a child laugh behind a door, and the sound was so ordinary it stopped her cold.

Someone was living in a place the city had decided did not exist.

The door opened before she could knock.`,
  },

  "2": {
    chapterId: "2",
    title: "Survivors of the Erasure",
    wordCount: 680,
    prose: `The man in the doorway was old enough that his face recorded decades of work the city had refused to credit. He looked at ${PROTAGONIST} the way someone looks at a thing that should not be able to see them.

"You're from the Bureau," he said. It was not a question.

"I found the old survey." She held up the cylinder. "I'm not here to report you."

He studied her for another moment, then stepped back. The room beyond was close and warm, and it smelled like the kind of cooking that happens when people are feeding more than just themselves. Three others sat at a table—two women and a boy of perhaps twelve who watched ${PROTAGONIST} with careful eyes.

The man's name was Orren. He had lived in block K-7 for sixty years, which meant he had lived there before the erasure and after it, through the Year of Consolidation and the quiet decades that followed, sustained by supply lines that had to operate outside every registered channel in ${SETTING}.

"How many of you are here?" ${PROTAGONIST} asked.

"Enough." Orren poured tea into a cup and set it in front of her. "Enough that it matters. Enough that your mother knew, and decided we were easier to erase than to relocate."

${PROTAGONIST} wrapped her hands around the cup. She had known, in an abstract way, that the Consolidation had involved displacements. The official record called them "administrative restructuring events." She had transcribed the phrase dozens of times and felt nothing, because the phrase was designed to produce nothing.

"She's going to remap," said one of the women—Fen, who had been born in K-7 and had never left it, who knew every unregistered passage in the quarter. "The Bureau announced a new master survey last month. When the new maps are filed, this block won't just be absent. It'll be designated open land."

"Designated open land" meant the city could sell the ground.

${PROTAGONIST} unrolled the pre-reform survey on the table. The four residents leaned over it with the reverence people reserve for documents that prove they exist. The boy traced his own street with one finger, the same gesture ${PROTAGONIST} had used hours earlier in a building five hundred meters away that had heat and light and a legal address.

"There's an original," Fen said. She did not look up from the map. "The master survey, before the Consolidation amendments. Your mother has it. There are parties who would pay significantly to know it still exists—parties inside the city who would use it to challenge the redesignation in court."

"Where is it?"

"In the Bureau's restricted archive. Sub-level three. The room your access card won't open."

${PROTAGONIST} looked at the cylinder on the table, then at the four people who had survived thirty-one years in a space the city had decided was nothing. She thought about her mother's careful handwriting on the expungement order. She thought about how ordinary a Tuesday could be, right up until it wasn't.

"I need you to show me every unregistered passage between here and the archive," she said.

Fen finally looked up. Her expression was not hope exactly. It was the particular alertness of someone who has learned not to feel hope until it has already happened.

"Tonight?" Fen asked.

"Tomorrow. I need to go back to the Bureau first. I need to make sure no one knows I was here."

What ${PROTAGONIST} did not say was that she had noticed, on her way in, a second set of footprints in the dust of the unregistered street. Fresh. And not hers.

Someone already knew she had come.`,
  },

  "3": {
    chapterId: "3",
    title: "The Authority's Shadow",
    wordCount: 650,
    prose: `${PROTAGONIST} discovered she was being followed on the way back to the registered city, which meant that whoever had sent the second set of footprints had either stayed to watch or had a confederate waiting at the boundary.

She did not run. Running would confirm she had found something. She walked at the pace of someone finishing an evening constitutional, turned into a licensed restaurant on Voss Boulevard—the street that bore her family name, which she had always found an excessive honor—and sat at the counter long enough to order tea she did not drink.

The man who came in after her was a Bureau enforcement officer, though he was dressed as a private citizen. ${PROTAGONIST} recognized the way he held his hands: slightly open, weight forward, the posture of someone trained to move fast in confined spaces. He sat two seats away and did not look at her.

She paid, left through the kitchen, and took the long route home through three registered alleys.

At her apartment, Fen was waiting.

This was alarming for several reasons, the most immediate being that Fen had just told ${PROTAGONIST} she had never left block K-7.

"You followed me," ${PROTAGONIST} said.

"I know the unregistered passages." Fen's coat was damp; she had come through the drainage routes under the eastern district. "There are four of them now. The enforcement officers. They started watching K-7 two days ago, which means someone reported movement."

"Or they already knew about me." ${PROTAGONIST} sat down. The pieces were assembling themselves into a shape she did not want to see. Her access card use in the restricted archive records room had been logged. The survey she had removed had been logged. The only reason she was not already in a Bureau hearing room was that someone had decided watching her was more valuable than stopping her.

"Your mother?" Fen asked.

"She doesn't know yet. If she did, the enforcement team would already have moved."

"Then whoever is watching is not working for the Chief Cartographer." Fen spread a hand-drawn sketch on ${PROTAGONIST}'s table—a map of the drainage passages, drawn in the cramped notation of someone who had spent decades navigating spaces that official cartography refused to acknowledge. "There are factions inside the Bureau. People who want the redesignation stopped not because they care about K-7, but because they want leverage over your mother."

${PROTAGONIST} studied the sketch. It was, in its own way, more precise than anything in the official archive. Drawn from lived experience rather than administrative decree. Every passage verified by someone who had actually walked it.

"If we get the original survey and file it in court," ${PROTAGONIST} said, "who benefits?"

"Everyone in K-7 gets legal standing. The redesignation halts. And your mother's thirty-one-year tenure ends in a public corruption inquiry."

"And whoever helped us file it would have leverage over whatever comes next."

"Yes."

${PROTAGONIST} looked at the sketch. At the drainage route that ran under the Bureau's east wing, thirty meters from sub-level three.

She was not naive about leverage. She was a cartographer. She understood that what you could reach depended entirely on the route you were willing to take.

"The archive access codes rotate at two in the morning," she said.

Fen nodded.

"We go at three."`,
  },

  "4": {
    chapterId: "4",
    title: "The Fragment Below",
    wordCount: 710,
    prose: `Sub-level three of the Bureau of Cartographic Records smelled like mineral oil and old paper—the smell of things that had been preserved against their will.

${PROTAGONIST} had been in this building every working day for nine years. She had never been below sub-level one. The access codes Fen had obtained came from a Bureau archivist who had worked for the opposing faction for a decade and now wanted out of ${SETTING} entirely, which put the reliability of the codes somewhere between well-motivated and desperate.

The codes worked.

The restricted archive was smaller than she had expected: a single room, sixteen shelving units, each unit labeled with a year and a classification code she did not recognize. Fen stood at the entrance, watching the corridor. ${PROTAGONIST} moved along the shelves with a narrow light, reading labels, until she found the unit marked with the Year of Consolidation.

The original master survey was stored in a flat case the size of a dining table. It was unfiled, not shelved—resting on a horizontal rack as if someone had pulled it recently and not put it back properly. Or as if someone wanted it findable.

She opened the case.

The map was extraordinary. Not for its artistry—it was bureaucratic in every line, utilitarian, function-first—but for what it contained: the full city of ${SETTING}, as it had existed before the Consolidation, every district named and bounded and numbered, including block K-7, including the forty-two buildings, including the population count of three hundred and nineteen residents as of the last official survey.

Three hundred and nineteen.

Orren had said "enough." She had not understood until this moment how much enough could mean.

She photographed the relevant sections with the small camera Fen had provided, then replaced the case exactly as she had found it. As she was closing the lid, she saw what she had missed in her focus on K-7: a second discrepancy, in the city's eastern district, block R-12. Also expunged. Also after the Year of Consolidation.

Also bearing a marginal notation in her mother's handwriting.

${PROTAGONIST} photographed that too.

"We need to move," Fen said from the corridor. "Someone triggered a passive sensor on sub-level two."

They went back through the drainage passage at a pace that was not quite running. The passage smelled worse than it had going in—someone had flushed a processing line overhead, and the water running alongside them was the color of dissolved old documents.

${PROTAGONIST} thought about the notation. Her mother's handwriting was distinctive: small, squared, the letters spaced with the precision of someone who had learned to write on official forms and never unlearned it. The notation on block R-12 read: "Per standing order. Archive only. Not for public ledger."

Standing order implied a patron. Someone who had given Elara Voss an instruction she had followed for thirty-one years.

"There's someone above my mother," ${PROTAGONIST} said, when they reached the surface.

Fen did not look surprised. "There usually is."

"Someone who benefits from the erasures. Not just K-7. Multiple districts."

"Land value." Fen's voice was even. "The redesignated land is worth substantially more when it has no registered residents to compensate. Whoever holds the development rights for the erased districts has been compounding that value for thirty years."

"We need to find who holds those rights."

"That's not in the archive. That's in the financial registry. Which is under the Ministry of—"

"Development," ${PROTAGONIST} finished. She knew the Minister of Development. He had been at her mother's retirement dinner, three weeks from now. He had given the toast at her father's funeral.

She had met him when she was nine years old. He had told her cartographers were the most important people in ${SETTING}.

She understood, now, that he had meant it.`,
  },

  "5": {
    chapterId: "5",
    title: "The Map That Could Not Be Burned",
    wordCount: 730,
    prose: `${PROTAGONIST} went to see her mother at seven in the morning, before the Bureau opened, because some conversations needed to happen in kitchens rather than offices.

Elara Voss was already at her table with coffee and a stack of survey approvals. She looked up when her daughter came in, and something in her face went still—the particular stillness of a person who has been waiting for a specific thing to arrive and is unsatisfied that it has.

"You went to K-7," Elara said.

"And sub-level three."

Her mother set down the survey she was holding. "Sit down."

"I'd rather stand."

"${PROTAGONIST}. Sit down." It was not a request. It was the voice her mother used when what she was about to say required a stationary target.

${PROTAGONIST} sat.

"I know what you found," Elara said. "I know what the original survey shows. I know about the standing order and I know about Harven's development holdings." Harven was the Minister of Development. Hearing his name said aloud, plainly, without circumlocution, was disorienting. "I have known for twenty-seven years."

"And you kept erasing."

"I kept people alive." Her mother's voice was flat. "Harven's predecessor told me, in my first year as Chief Cartographer, that K-7's residents had two options: erasure or displacement to labor facilities in the outer districts. I chose erasure. I chose it because erasure meant they stayed in their homes and the Bureau looked the other way. Displacement meant they didn't come back."

${PROTAGONIST} thought about Orren at his door. About the child laughing behind the wall. About the smoke from two chimneys. "They're still there," she said. "Three hundred people."

"Three hundred and forty-one, now. Births." Her mother said it with the precision of a cartographer: recorded, counted, permanent. "I have the current count. I have had it updated every year."

"The redesignation—"

"Is being pushed by Harven's faction, not mine. I have been blocking it for four years." Elara Voss picked up her coffee with hands that were completely steady. "What you and your friend retrieved from sub-level three is not a secret I was keeping from you. It is evidence I have been building. Court-admissible. Witnessed. With a chain of custody that will survive Harven's legal team."

${PROTAGONIST} looked at her mother across the kitchen table and understood, for the first time, that the map her mother had been drawing for thirty-one years was not the one on file at the Bureau.

"You need me to file it," ${PROTAGONIST} said.

"I need someone who can testify that they found it independently, without the Chief Cartographer's knowledge or assistance. Someone with Bureau credentials and no prior involvement in Harven's land holdings." Elara set down the coffee. "I need someone Harven cannot credibly claim I coached."

The silence in the kitchen was the silence of a space that had just been mapped—edges defined, contents clarified, no territory left ambiguous.

"If I file this," ${PROTAGONIST} said, "your tenure ends. The standing order exposes you. There will be hearings."

"Yes."

"You'll lose the Chief Cartographer position."

"I have known that for twenty-seven years." Her mother looked at her with the expression ${PROTAGONIST} had seen on Orren, on Fen, on the boy who had traced his own street with one finger. Not hope. The particular alertness of someone who has learned not to feel hope until it has already happened. "But K-7 gets legal standing. The redesignation fails. And the three hundred and forty-one people who have been living in a city that decided they didn't exist will exist, officially, in every map filed from this day forward."

${PROTAGONIST} thought about the pre-reform survey rolled in its cylinder under her coat. She thought about the photograph of block R-12 on her camera. She thought about how maps worked: not by showing what was there, but by deciding what was real.

She was a cartographer. She understood that the most important question was not what you could see. It was what you were willing to draw.

"When do you need me to file?" she asked.

Her mother smiled—small, precise, the expression of someone who had just finished a survey and found the measurements correct.

"The court opens at nine," Elara said.`,
  },
};

export type AutowriteRunResponse = {
  ok: boolean;
  job_id: number;
  chapter_id: string;
  status: string;
};

export type WritingStatusResponse = {
  ok: boolean;
  job_id: number;
  status: string;
  staging_ready: boolean;
  prose: string;
  word_count: number;
  integrity_report: {
    location_verified: boolean;
    objects_tracked: string[];
    character_drift_detected: boolean;
  };
  historian_snapshot: null;
  latest_task: null;
};

function buildAutowriteRunResponse(chapterId: string): AutowriteRunResponse {
  const chapterNo = chapterNumberFromId(chapterId);
  return {
    ok: true,
    job_id: 100 + chapterNo,
    chapter_id: chapterId,
    status: "started",
  };
}

function chapterNumberFromId(chapterId: string): number {
  return Number.parseInt(chapterId.replace(/\D/g, "") || "1", 10) || 1;
}

function mockChapterKey(chapterId: string): string {
  return String(chapterNumberFromId(chapterId));
}

function buildWritingStatusResponse(chapterId: string): WritingStatusResponse {
  const chapter = MOCK_CHAPTERS[mockChapterKey(chapterId)];
  if (!chapter) {
    throw new Error(`No mock chapter defined for id="${chapterId}"`);
  }
  return {
    ok: true,
    job_id: 100 + chapterNumberFromId(chapterId),
    status: "completed",
    staging_ready: true,
    prose: chapter.prose,
    word_count: chapter.wordCount,
    integrity_report: {
      location_verified: true,
      objects_tracked: ["city_map", "bureau_archive"],
      character_drift_detected: false,
    },
    historian_snapshot: null,
    latest_task: null,
  };
}

// Install network mocks for the autowrite pipeline on a Playwright page.
// Must be called before navigating to the write workspace.
export async function installAutowriteMocks(page: Page): Promise<void> {
  await page.route("**/api/stories/*/chapters/*/auto-write", async (route) => {
    const url = route.request().url();
    const match = url.match(/chapters\/([^/]+)\/auto-write/);
    const chapterId = match ? decodeURIComponent(match[1]) : "ch01";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAutowriteRunResponse(chapterId)),
    });
  });

  await page.route("**/api/stories/*/chapters/*/auto-write/status**", async (route) => {
    const url = route.request().url();
    const match = url.match(/chapters\/([^/]+)\/auto-write\/status/);
    const chapterId = match ? decodeURIComponent(match[1]) : "ch01";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildWritingStatusResponse(chapterId)),
    });
  });

  // Mock POST /api/<slug>/autowrite/run
  await page.route("**/api/*/autowrite/run", async (route) => {
    const url = route.request().url();
    // Extract chapter id from query param or default to "1"
    const chapterIdMatch = url.match(/chapter_id[=/]([^&?/]+)/);
    const chapterId = chapterIdMatch ? chapterIdMatch[1] : "1";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildAutowriteRunResponse(chapterId)),
    });
  });

  // Mock GET /api/stories/<slug>/chapters/<chapterId>/writing-status
  await page.route("**/api/stories/*/chapters/*/writing-status**", async (route) => {
    const url = route.request().url();
    const match = url.match(/chapters\/([^/]+)\/writing-status/);
    const chapterId = match ? decodeURIComponent(match[1]) : "1";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildWritingStatusResponse(chapterId)),
    });
  });

  // Mock GET /api/<slug>/scenes/full (staging/published fusion)
  await page.route("**/api/*/scenes/full**", async (route) => {
    const url = route.request().url();
    const chapterMatch = url.match(/chapter_id[=/]([^&?/]+)/);
    const chapterId = chapterMatch ? chapterMatch[1] : "1";
    const chapter = MOCK_CHAPTERS[mockChapterKey(chapterId)] ?? MOCK_CHAPTERS["1"];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, prose: chapter?.prose ?? "", word_count: chapter?.wordCount ?? 0 }),
    });
  });
}

// Send a chat message and wait for the assistant response to settle in the timeline.
export async function sendChatMessage(page: Page, message: string): Promise<void> {
  const input = page.locator('[data-testid="chat-composer-input"]');
  await input.click();
  await input.fill(message);
  await page.locator('[data-testid="chat-send-btn"]').click();
  // Allow React state to flush and the new timeline block to appear
  await page.waitForTimeout(300);
}
