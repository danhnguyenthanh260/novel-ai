import { expect, type Page, test } from "@playwright/test";
import { setupSubcurrentStoryFixture, type SubcurrentFixtureState } from "../fixtures/subcurrent-story.fixture";

const secondaryRoutePattern = /\/(memory|analyze|analysis|pipeline|pipelines|ingest|reviews)(\/|$)/;

function watchSecondaryRoutes(page: Page): string[] {
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  return visited;
}

function expectNoSecondaryNavigation(page: Page, visited: string[]) {
  expect(page.url()).not.toMatch(secondaryRoutePattern);
  expect(visited.filter((url) => secondaryRoutePattern.test(new URL(url).pathname))).toEqual([]);
}

async function runCommand(page: Page, command: string) {
  const commandId = command.startsWith("/write chapter") ? "/write chapter" : command.trim();
  const goal = command.startsWith("/write chapter") ? command.replace("/write chapter", "").trim() : "";
  await page.getByLabel("Studio chat composer").fill(commandId);
  await page.locator(".slash-menu-row").filter({ hasText: commandId }).first().click();
  if (goal) await page.locator(".command-form input").first().fill(goal);
  await page.locator(".command-form").getByRole("button", { name: "Run preflight" }).click();
}

async function submitMessage(page: Page, text: string) {
  await page.getByLabel("Studio chat composer").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function createChapter11FromStoryScope(page: Page, fixture: SubcurrentFixtureState) {
  await page.getByRole("button", { name: "New chapter" }).click();
  await expect.poll(() => fixture.createdChapter11()).toBe(true);
  const chapterButton = page.locator(".novel-lab-chapter-row").filter({ hasText: "Chapter 11" }).first();
  await chapterButton.scrollIntoViewIfNeeded();
  await expect(chapterButton).toBeVisible({ timeout: 15_000 });
  await chapterButton.click();
  await expect(page.locator(".novel-lab-chapter-row--selected").filter({ hasText: "Chapter 11" })).toBeVisible();
}

async function switchChatScope(page: Page, scope: "Story" | "Chapter") {
  await page.getByLabel("Chat scope").getByRole("button", { name: scope, exact: true }).click();
}

async function generateAndSaveChapter11(page: Page) {
  await runCommand(page, "/write chapter Continue the offshore signal thread into Chapter 11");
  await expect(page.getByRole("heading", { name: "AutoWrite v2: Chapter Architect" })).toBeVisible();
  await page.getByRole("button", { name: "WRITE AUTO (ONE CLICK)" }).click();
  await expect(page.getByText("Chapter Generated")).toBeVisible();
  await page.getByRole("button", { name: "SAVE CHAPTER DRAFT (NO SPLIT)" }).click();
  await expect(page.getByRole("heading", { name: "AutoWrite v2: Chapter Architect" })).toHaveCount(0);
}

test.describe("Chat-first Chapter 11 acceptance", () => {
  test("generates and saves Chapter 11 from the story workspace flow", async ({ page }) => {
    const fixture = await setupSubcurrentStoryFixture(page);
    const visited = watchSecondaryRoutes(page);

    await page.goto("/stories/subcurrent/write?scope=story");
    await expect(page.getByLabel("Studio chat composer")).toBeVisible();
    await runCommand(page, "/status");
    await expect(page.locator(".timeline-card--digest").filter({ hasText: "Story status: ready" }).first()).toBeVisible();

    await createChapter11FromStoryScope(page, fixture);
    expect(fixture.createdChapter11()).toBe(true);
    await switchChatScope(page, "Chapter");
    await generateAndSaveChapter11(page);
    expect(fixture.chapter11Saved()).toBe(true);

    await page.getByRole("button", { name: "Artifacts" }).click();
    await expect(page.getByRole("heading", { name: "Chapter 11 Draft", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Editable chapter draft artifact" })).toHaveValue(/Frequencies of Memory/);
    await expect(page.getByRole("textbox", { name: "Editable chapter draft artifact" })).toHaveValue(/Kuro/);
    await expect(page.getByRole("textbox", { name: "Editable chapter draft artifact" })).toHaveValue(/Hollow/);
    expectNoSecondaryNavigation(page, visited);

    fixture.teardownChapter11();
    expect(fixture.createdChapter11()).toBe(false);
    expect(fixture.chapter11Saved()).toBe(false);
  });

  test("keeps chat history visible after Chapter 11 generation", async ({ page }) => {
    const fixture = await setupSubcurrentStoryFixture(page);
    const visited = watchSecondaryRoutes(page);

    await page.goto("/stories/subcurrent/write");
    await createChapter11FromStoryScope(page, fixture);
    await submitMessage(page, "Keep this generation note visible during Chapter 11.");
    await expect(page.getByText("Keep this generation note visible during Chapter 11.")).toBeAttached();

    await generateAndSaveChapter11(page);
    await expect(page.getByText("Keep this generation note visible during Chapter 11.")).toBeVisible();
    expect(fixture.chapter11Saved()).toBe(true);
    expectNoSecondaryNavigation(page, visited);

    fixture.teardownChapter11();
  });

  test("scope toggle preserves write progress state", async ({ page }) => {
    const fixture = await setupSubcurrentStoryFixture(page);
    const visited = watchSecondaryRoutes(page);

    await page.goto("/stories/subcurrent/write?scope=story");
    await createChapter11FromStoryScope(page, fixture);
    await switchChatScope(page, "Chapter");
    await runCommand(page, "/write chapter Prepare Chapter 11");
    await expect(page.getByText("AutoWrite opened")).toBeVisible();
    await page.getByRole("button", { name: "CLOSE [X]" }).click();

    await switchChatScope(page, "Story");
    await switchChatScope(page, "Chapter");
    await expect(page.getByText("AutoWrite opened")).toBeVisible();
    expectNoSecondaryNavigation(page, visited);

    fixture.teardownChapter11();
  });
});
