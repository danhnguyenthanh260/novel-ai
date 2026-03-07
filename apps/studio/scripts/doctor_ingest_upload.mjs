import { zipSync, strToU8 } from "fflate";
import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_ingest_upload";

async function call(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(condition, message, detail) {
  if (!condition) {
    const extra = detail ? ` | detail=${JSON.stringify(detail)}` : "";
    throw new Error(`${message}${extra}`);
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

  const zipBytes = zipSync({
    "chapter_001.txt": strToU8("## Scene 1\nAlpha\n---\nBeta"),
    "chapter_002.txt": strToU8("## Scene 1\nGamma"),
  });
  const zipForm = new FormData();
  zipForm.set("mode", "ZIP_UPLOAD");
  zipForm.set("zip_file", new Blob([zipBytes], { type: "application/zip" }), "chapters.zip");

  const zipValidate = await call(`/api/${STORY_SLUG}/ingest/validate`, zipForm);
  assert(zipValidate.status === 200, "zip validate should return 200", zipValidate);
  assert(zipValidate.json?.ok === true, "zip validate should return ok=true");
  assert(Number(zipValidate.json?.summary?.total_chapters ?? 0) === 2, "zip validate should detect 2 chapters");

  const jobForm = new FormData();
  jobForm.set("mode", "ZIP_UPLOAD");
  jobForm.set("review_mode", "AUTO_LOCK");
  jobForm.set("created_by", "doctor_ingest_upload");
  jobForm.set("zip_file", new Blob([zipBytes], { type: "application/zip" }), "chapters.zip");

  const createJob = await call(`/api/${STORY_SLUG}/ingest/jobs`, jobForm);
  assert(createJob.status === 200, "create ingest job from zip should return 200", createJob);
  assert(createJob.json?.ok === true, "create ingest job from zip should return ok=true");
  const jobId = Number(createJob.json?.job_id ?? 0);
  assert(jobId > 0, "create ingest job from zip should return job_id");

  const megaText = `# Chapter 001
One
---
Two

=== CHAPTER 002 ===
Three`;
  const megaForm = new FormData();
  megaForm.set("mode", "MEGA_FILE");
  megaForm.set("split_mode", "auto");
  megaForm.set("mega_file", new Blob([megaText], { type: "text/plain;charset=utf-8" }), "mega.txt");
  const megaValidate = await call(`/api/${STORY_SLUG}/ingest/validate`, megaForm);
  assert(megaValidate.status === 200, "mega validate should return 200", megaValidate);
  assert(megaValidate.json?.ok === true, "mega validate should return ok=true");
  assert(Number(megaValidate.json?.summary?.total_chapters ?? 0) === 2, "mega validate should detect 2 chapters");

  const verify = new Client({ connectionString: DB_DSN });
  await verify.connect();
  const jobRes = await verify.query(`SELECT id, total_tasks, status FROM public.ingest_job WHERE id = $1`, [jobId]);
  assert(jobRes.rowCount === 1, "ingest_job not found");
  assert(Number(jobRes.rows[0].total_tasks) >= 2, "ingest_job total_tasks should be at least 2");
  const taskRes = await verify.query(
    `SELECT count(*)::int AS n
     FROM public.ingest_task
     WHERE job_id = $1
       AND (unit_type = 'split_draft' OR task_type = 'CHAPTER_SPLIT_LLM')`,
    [jobId]
  );
  assert(Number(taskRes.rows[0].n) >= 2, "ingest_task split-draft rows should be at least 2");

  await verify.query(`DELETE FROM public.ingest_job WHERE id = $1`, [jobId]);
  await verify.end();

  console.log("[doctor-ingest-upload] PASS");
}

main().catch((err) => {
  console.error("[doctor-ingest-upload] FAIL", err);
  process.exit(1);
});
