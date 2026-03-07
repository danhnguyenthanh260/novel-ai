import { zipSync, strToU8 } from "fflate";
import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_validate_matrix";

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertErrorIncludes(resp, needle) {
  const errs = Array.isArray(resp?.json?.errors) ? resp.json.errors : [resp?.json?.error];
  if (!errs.some((e) => String(e).includes(needle))) {
    throw new Error(`Expected error '${needle}' but got ${JSON.stringify(errs)}`);
  }
}

async function main() {
  const db = new Client({ connectionString: DB_DSN });
  await db.connect();
  await db.query(
    `INSERT INTO public.story_series(slug, title, status)
     VALUES ($1, $2, 'ACTIVE')
     ON CONFLICT (slug) DO NOTHING`,
    [STORY_SLUG, `Doctor ${STORY_SLUG}`]
  );
  await db.end();

  const base = `/api/${STORY_SLUG}/ingest/validate`;

  const invalidMode = await post(base, { mode: "WRONG" });
  assert(invalidMode.status === 400, "INVALID_MODE should return 400");
  assertErrorIncludes(invalidMode, "INVALID_MODE");

  const zipEmpty = await post(base, { mode: "ZIP_UPLOAD", zip_files: [] });
  assert(zipEmpty.status === 400, "ZIP_EMPTY should return 400");
  assertErrorIncludes(zipEmpty, "ZIP_EMPTY");

  const zipNoChapterNo = await post(base, {
    mode: "ZIP_UPLOAD",
    zip_files: [{ name: "alpha.txt", text: "## Scene 1\nx" }],
  });
  assert(zipNoChapterNo.status === 400, "ZIP missing chapter number should return 400");
  assertErrorIncludes(zipNoChapterNo, "ZIP_FILE_CHAPTER_NUMBER_MISSING_1");

  const zipNoDelimiter = await post(base, {
    mode: "ZIP_UPLOAD",
    zip_files: [{ name: "chapter_001.txt", text: "plain text no delimiter" }],
  });
  assert(zipNoDelimiter.status === 400, "ZIP no delimiter should return 400");
  assertErrorIncludes(zipNoDelimiter, "ZIP_FILE_SCENE_DELIMITER_MISSING_1");

  const megaNoMarker = await post(base, {
    mode: "MEGA_FILE",
    mega_file: { name: "mega.txt", text: "no chapter marker" },
  });
  assert(megaNoMarker.status === 400, "MEGA marker missing should return 400");
  assertErrorIncludes(megaNoMarker, "MEGA_CHAPTER_MARKER_MISSING");

  const badZipBytes = zipSync({
    "chapter_001.txt": new Uint8Array([0xff, 0xfe, 0xfd]),
  });
  const badZipForm = new FormData();
  badZipForm.set("mode", "ZIP_UPLOAD");
  badZipForm.set("zip_file", new Blob([badZipBytes], { type: "application/zip" }), "bad.zip");
  const badZip = await post(base, badZipForm);
  assert(badZip.status === 400, "Bad zip utf8 should return 400");
  assertErrorIncludes(badZip, "ZIP_FILE_ENCODING_INVALID_1");

  const badMegaForm = new FormData();
  badMegaForm.set("mode", "MEGA_FILE");
  badMegaForm.set("mega_file", new Blob([new Uint8Array([0xff, 0xfe])], { type: "text/plain" }), "bad.txt");
  const badMega = await post(base, badMegaForm);
  assert(badMega.status === 400, "Bad mega utf8 should return 400");
  assertErrorIncludes(badMega, "MEGA_ENCODING_INVALID");

  const validZipBytes = zipSync({
    "chapter_001.txt": strToU8("## Scene 1\nA\n---\nB"),
    "chapter_002.txt": strToU8("## Scene 1\nC"),
  });
  const validZipForm = new FormData();
  validZipForm.set("mode", "ZIP_UPLOAD");
  validZipForm.set("zip_file", new Blob([validZipBytes], { type: "application/zip" }), "good.zip");
  const goodZip = await post(base, validZipForm);
  assert(goodZip.status === 200, "Good zip should return 200");
  assert(goodZip.json?.ok === true, "Good zip should be ok");
  assert(Number(goodZip.json?.summary?.total_chapters ?? 0) === 2, "Good zip chapter count mismatch");

  const goodMega = await post(base, {
    mode: "MEGA_FILE",
    mega_file: {
      name: "mega.txt",
      text: "# Chapter 001\nA\n---\nB\n\n=== CHAPTER 002 ===\nC",
    },
  });
  assert(goodMega.status === 200, "Good mega should return 200");
  assert(goodMega.json?.ok === true, "Good mega should be ok");
  assert(Number(goodMega.json?.summary?.total_chapters ?? 0) === 2, "Good mega chapter count mismatch");

  console.log("[doctor-ingest-validate-matrix] PASS");
}

main().catch((err) => {
  console.error("[doctor-ingest-validate-matrix] FAIL", err);
  process.exit(1);
});
