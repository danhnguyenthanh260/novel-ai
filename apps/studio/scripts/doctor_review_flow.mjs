import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_review_flow";

async function request(path, method, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
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
     VALUES ($1, 'doctor_review_flow', 'REVIEW_GATE', 'RUNNING', '{}'::jsonb, 1, 0)
     RETURNING id`,
    [storyId]
  );
  const jobId = Number(jobRes.rows[0].id);

  const sceneRes = await db.query(
    `INSERT INTO public.narrative_scene(story_id, workunit_id, chapter_id, idx, status, draft_text)
     VALUES ($1, 'ch777_s01', 'ch777', 1, 'DRAFTED', '')
     RETURNING id`,
    [storyId]
  );
  const sceneId = Number(sceneRes.rows[0].id);

  const versionRes = await db.query(
    `INSERT INTO public.narrative_scene_version(story_id, scene_id, version_no, kind, text_content, summary)
     VALUES ($1, $2, 1, 'draft', 'Review me', 'doctor review')
     RETURNING id`,
    [storyId, sceneId]
  );
  const versionId = Number(versionRes.rows[0].id);

  await db.query(
    `UPDATE public.narrative_scene
     SET current_version_id = $2
     WHERE id = $1`,
    [sceneId, versionId]
  );

  const taskRes = await db.query(
    `INSERT INTO public.ingest_task(job_id, story_id, unit_type, source_path, seq_no, status, attempts, payload_json)
     VALUES ($1, $2, 'scene', 'ch777_s01', 1, 'WAIT_REVIEW', 1, $3::jsonb)
     RETURNING id`,
    [jobId, storyId, JSON.stringify({ scene_id: sceneId, scene_version_id: versionId })]
  );
  const waitTaskId = Number(taskRes.rows[0].id);

  const reqRes = await db.query(
    `INSERT INTO public.review_request(story_id, scene_version_id, job_id, status, rubric_version)
     VALUES ($1, $2, $3, 'OPEN', 'memory_bridge_v1')
     RETURNING id`,
    [storyId, versionId, jobId]
  );
  const requestId = Number(reqRes.rows[0].id);
  await db.end();

  const list = await request(`/api/${STORY_SLUG}/reviews`, "GET");
  assert(list.status === 200, "GET reviews should return 200");
  assert(Array.isArray(list.json?.requests), "GET reviews should include requests");
  assert(list.json.requests.some((r) => Number(r.id) === requestId), "Request should be visible in list");

  const submit = await request(`/api/${STORY_SLUG}/reviews`, "POST", {
    action: "submit_response",
    request_id: requestId,
    reviewer_name: "doctor_reviewer",
    scores_json: { logic: 4, pacing: 4, consistency: 3, voice: 4 },
    flags_json: { critical: [], major: ["tone"], minor: [] },
    suggestions_text: "Tighten continuity.",
    canon_proposals_json: [
      { category: "lore", content: "Bridge responds to oath-blood.", importance: 5 },
      { category: "event", content: "A false oath caused the collapse.", importance: 4 },
    ],
  });
  assert(submit.status === 200, "submit_response should return 200");
  assert(submit.json?.ok === true, "submit_response should return ok=true");

  const apply = await request(`/api/${STORY_SLUG}/reviews`, "POST", {
    action: "apply_response",
    request_id: requestId,
    applied_by: "doctor_operator",
  });
  assert(apply.status === 200, "apply_response should return 200");
  assert(apply.json?.ok === true, "apply_response should return ok=true");
  assert(Array.isArray(apply.json?.canon_inserted_ids), "apply_response should return canon_inserted_ids");
  assert(apply.json.canon_inserted_ids.length >= 2, "apply_response should insert canon proposals");

  const verify = new Client({ connectionString: DB_DSN });
  await verify.connect();
  const reqCheck = await verify.query(`SELECT status FROM public.review_request WHERE id = $1`, [requestId]);
  assert(reqCheck.rows[0].status === "APPLIED", "review_request should be APPLIED");

  const sceneCheck = await verify.query(`SELECT status FROM public.narrative_scene WHERE id = $1`, [sceneId]);
  assert(sceneCheck.rows[0].status === "LOCKED", "scene should be LOCKED after apply");

  const waitTaskCheck = await verify.query(`SELECT status FROM public.ingest_task WHERE id = $1`, [waitTaskId]);
  assert(waitTaskCheck.rows[0].status === "DONE", "WAIT_REVIEW task should move to DONE after apply");

  const canonCheck = await verify.query(
    `SELECT count(*)::int AS n
     FROM public.story_canon_fact
     WHERE story_id = $1
       AND source_ref LIKE $2`,
    [storyId, `review:${requestId}:%`]
  );
  assert(Number(canonCheck.rows[0].n) >= 2, "canon facts from review proposals should exist");

  await verify.query(`DELETE FROM public.review_request WHERE id = $1`, [requestId]);
  await verify.query(`DELETE FROM public.story_canon_fact WHERE story_id = $1 AND source_ref LIKE $2`, [storyId, `review:${requestId}:%`]);
  await verify.query(`DELETE FROM public.timeline_event WHERE story_id = $1 AND event_key = $2`, [storyId, `doctor_review_${requestId}`]);
  await verify.query(`DELETE FROM public.narrative_scene_version WHERE id = $1`, [versionId]);
  await verify.query(`DELETE FROM public.narrative_scene WHERE id = $1`, [sceneId]);
  await verify.query(`DELETE FROM public.ingest_job WHERE id = $1`, [jobId]);
  await verify.end();

  console.log("[doctor-review-flow] PASS");
}

main().catch((err) => {
  console.error("[doctor-review-flow] FAIL", err);
  process.exit(1);
});
