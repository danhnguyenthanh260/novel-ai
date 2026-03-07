import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_ingest";

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

  const invalidZip = await post(`/api/${STORY_SLUG}/ingest/validate`, {
    mode: "ZIP_UPLOAD",
    zip_files: [{ name: "chapter_001.txt", text: "No delimiter here." }],
  });
  assert(invalidZip.status === 400, "Invalid ZIP should return 400");
  assert(Array.isArray(invalidZip.json?.errors), "Invalid ZIP should return errors");
  assert(
    invalidZip.json.errors.includes("ZIP_FILE_SCENE_DELIMITER_MISSING_1"),
    "Expected delimiter-missing error for ZIP"
  );

  const validMega = await post(`/api/${STORY_SLUG}/ingest/validate`, {
    mode: "MEGA_FILE",
    split_mode: "auto",
    mega_file: {
      name: "mega_book.txt",
      text: `# Chapter 001
Scene one
--- 
Scene two

=== CHAPTER 002 ===
Another scene`,
    },
  });
  assert(validMega.status === 200, "Valid MEGA should return 200");
  assert(validMega.json?.ok === true, "Valid MEGA should return ok=true");
  assert(Number(validMega.json?.summary?.total_chapters ?? 0) === 2, "MEGA should detect 2 chapters");

  const createJob = await post(`/api/${STORY_SLUG}/ingest/jobs`, {
    review_mode: "AUTO_LOCK",
    created_by: "doctor_ingest_validate",
    mode: "ZIP_UPLOAD",
    split_mode: "auto",
    zip_files: [
      { name: "chapter_003.txt", text: "## Scene 1\nAlpha\n## Scene 2\nBeta" },
      { name: "chapter_004.txt", text: "Part A\n---\nPart B" },
    ],
  });
  assert(createJob.status === 200, "Create ingest job should return 200");
  assert(createJob.json?.ok === true, "Create ingest job should return ok=true");
  const jobId = Number(createJob.json?.job_id ?? 0);
  assert(jobId > 0, "Create ingest job should return job_id");

  const verify = new Client({ connectionString: DB_DSN });
  await verify.connect();
  const jobRes = await verify.query(
    `SELECT id, mode, status, total_tasks, completed_tasks
     FROM public.ingest_job
     WHERE id = $1`,
    [jobId]
  );
  assert(jobRes.rowCount === 1, "ingest_job not found");
  assert(jobRes.rows[0].mode === "AUTO_LOCK", "ingest_job mode mismatch");
  assert(
    ["PENDING", "RUNNING", "SPLIT_DRAFT", "AWAIT_APPROVAL"].includes(String(jobRes.rows[0].status)),
    "ingest_job status mismatch"
  );
  assert(Number(jobRes.rows[0].total_tasks) >= 2, "ingest_job total_tasks mismatch");

  const taskRes = await verify.query(
    `SELECT seq_no, unit_type, status
     FROM public.ingest_task
     WHERE job_id = $1
     ORDER BY seq_no ASC`,
    [jobId]
  );
  assert(taskRes.rowCount >= 2, "ingest_task rows mismatch");
  assert(
    taskRes.rows.some((r) => r.task_type === "CHAPTER_SPLIT_LLM" || r.unit_type === "split_draft"),
    "ingest_task should include split draft tasks"
  );
  assert(taskRes.rows.every((r) => String(r.status || "").length > 0), "ingest_task status mismatch");

  await verify.query(`DELETE FROM public.ingest_job WHERE id = $1`, [jobId]);
  await verify.end();

  console.log("[doctor-ingest-validate] PASS");
}

main().catch((err) => {
  console.error("[doctor-ingest-validate] FAIL", err);
  process.exit(1);
});
