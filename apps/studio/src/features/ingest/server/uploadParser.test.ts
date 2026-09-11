import assert from "node:assert/strict";
import { test } from "vitest";
import { parseIngestRequest } from "./uploadParser";

test("source-only JSON import enforces a zero provider-call budget", async () => {
  const request = new Request("http://localhost/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "ZIP_UPLOAD",
      zip_files: [{ name: "chapter-01.txt", text: "line one\r\nline two" }],
      processing_mode: "source_only",
      max_llm_calls: 5,
    }),
  });

  const parsed = await parseIngestRequest(request);
  assert.equal(parsed.processingMode, "source_only");
  assert.equal(parsed.maxLlmCalls, 0);
  assert.equal(parsed.payload.zip_files?.[0]?.text, "line one\r\nline two");
});

test("standard imports retain the bounded provider-call setting", async () => {
  const request = new Request("http://localhost/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "PASTE_TEXT",
      paste_text: { text: "## Scene 1\nText" },
      processing_mode: "standard",
      max_llm_calls: 99,
    }),
  });

  const parsed = await parseIngestRequest(request);
  assert.equal(parsed.processingMode, "standard");
  assert.equal(parsed.maxLlmCalls, 5);
});
