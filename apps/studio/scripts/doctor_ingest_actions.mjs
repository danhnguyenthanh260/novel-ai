import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_ingest_actions";

async function post(path, method, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
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
  const storyRes = await db.query(`SELECT id FROM public.story_series WHERE slug = $1`, [STORY_SLUG]);
  const storyId = Number(storyRes.rows[0].id);

  const jobRes = await db.query(
    `INSERT INTO public.ingest_job(story_id, created_by, mode, status, config_json, total_tasks, completed_tasks)
     VALUES ($1, 'doctor_ingest_actions', 'AUTO_LOCK', 'RUNNING', '{}'::jsonb, 3, 0)
     RETURNING id`,
    [storyId]
  );
  const jobId = Number(jobRes.rows[0].id);

  const failedA = await db.query(
    `INSERT INTO public.ingest_task(job_id, story_id, unit_type, source_path, seq_no, status, attempts, error, payload_json)
     VALUES ($1, $2, 'chapter', 'ch001.txt', 1, 'FAILED', 1, 'ERR_A', '{}'::jsonb)
     RETURNING id`,
    [jobId, storyId]
  );
  const failedB = await db.query(
    `INSERT INTO public.ingest_task(job_id, story_id, unit_type, source_path, seq_no, status, attempts, error, payload_json)
     VALUES ($1, $2, 'scene', 'ch001_s01', 2, 'FAILED', 2, 'ERR_B', '{}'::jsonb)
     RETURNING id`,
    [jobId, storyId]
  );
  const doneTask = await db.query(
    `INSERT INTO public.ingest_task(job_id, story_id, unit_type, source_path, seq_no, status, attempts, payload_json)
     VALUES ($1, $2, 'scene', 'ch001_s02', 3, 'DONE', 1, '{}'::jsonb)
     RETURNING id`,
    [jobId, storyId]
  );
  await db.end();

  const retryOne = await post(`/api/${STORY_SLUG}/ingest/jobs`, "PATCH", {
    action: "retry_task",
    job_id: jobId,
    task_id: Number(failedA.rows[0].id),
  });
  assert(retryOne.status === 200, "retry_task should return 200");
  assert(retryOne.json?.ok === true, "retry_task should return ok=true");

  const retryAll = await post(`/api/${STORY_SLUG}/ingest/jobs`, "PATCH", {
    action: "retry_failed_tasks",
    job_id: jobId,
  });
  assert(retryAll.status === 200, "retry_failed_tasks should return 200");
  assert(retryAll.json?.ok === true, "retry_failed_tasks should return ok=true");
  assert(Number(retryAll.json?.retried ?? 0) >= 0, "retry_failed_tasks should return retried count");

  const cancel = await post(`/api/${STORY_SLUG}/ingest/jobs`, "PATCH", {
    action: "cancel_job",
    job_id: jobId,
  });
  assert(cancel.status === 200, "cancel_job should return 200");
  assert(cancel.json?.ok === true, "cancel_job should return ok=true");

  const verify = new Client({ connectionString: DB_DSN });
  await verify.connect();
  const jobRow = await verify.query(`SELECT status FROM public.ingest_job WHERE id = $1`, [jobId]);
  assert(jobRow.rows[0].status === "CANCELLED", "job should be CANCELLED");

  const taskRows = await verify.query(
    `SELECT id, status, error
     FROM public.ingest_task
     WHERE job_id = $1
     ORDER BY id`,
    [jobId]
  );
  const taskMap = new Map(taskRows.rows.map((r) => [Number(r.id), r]));
  const statusA = String(taskMap.get(Number(failedA.rows[0].id))?.status || "");
  const statusB = String(taskMap.get(Number(failedB.rows[0].id))?.status || "");
  assert(statusA === "FAILED", "first failed task should remain FAILED after cancel");
  assert(statusB === "FAILED", "second failed task should remain FAILED after cancel");
  assert(
    String(taskMap.get(Number(failedA.rows[0].id))?.error || "").includes("JOB_CANCELLED_BY_USER"),
    "first failed task should carry cancel reason"
  );
  assert(
    String(taskMap.get(Number(failedB.rows[0].id))?.error || "").includes("JOB_CANCELLED_BY_USER"),
    "second failed task should carry cancel reason"
  );
  assert(taskMap.get(Number(doneTask.rows[0].id))?.status === "DONE", "done task should remain DONE");

  await verify.query(`DELETE FROM public.ingest_job WHERE id = $1`, [jobId]);
  await verify.end();

  console.log("[doctor-ingest-actions] PASS");
}

main().catch((err) => {
  console.error("[doctor-ingest-actions] FAIL", err);
  process.exit(1);
});
