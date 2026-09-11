import assert from "node:assert/strict";
import { test } from "vitest";
import { validateAndNormalizeInput } from "./inputContract";

test("accepts a generated one-million-word chapter ZIP contract without changing text", () => {
  const chapterCount = 250;
  const wordsPerChapter = 4000;
  const chapterText = Array.from({ length: wordsPerChapter }, (_, index) => `word${index}`).join(" ");
  const zipFiles = Array.from({ length: chapterCount }, (_, index) => ({
    name: `chapter-${String(index + 1).padStart(3, "0")}.txt`,
    text: chapterText,
  }));

  const result = validateAndNormalizeInput(
    { mode: "ZIP_UPLOAD", zip_files: zipFiles },
    { splitMode: "auto" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.chapters.length, chapterCount);
  assert.equal(result.chapters[0]?.text, chapterText);
  assert.equal(chapterCount * wordsPerChapter, 1_000_000);
});
