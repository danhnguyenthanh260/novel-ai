import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_review_policy";

async function request(path, method, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? ` | detail=${JSON.stringify(detail)}` : ""}`);
}

async function main() {
  const nonce = Date.now() % 1000000;
  const chapterId = `ch${770 + (nonce % 20)}`;
  const idxNo = 100 + (nonce % 800);
  const workunitId = `${chapterId}_s${idxNo}`;

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
     VALUES ($1, 'doctor_review_policy', 'REVIEW_GATE', 'RUNNING', '{}'::jsonb, 1, 0)
     RETURNING id`,
    [storyId]
  );
  const jobId = Number(jobRes.rows[0].id);

  const sceneRes = await db.query(
    `INSERT INTO public.narrative_scene(story_id, workunit_id, chapter_id, idx, status, draft_text)
     VALUES ($1, $2, $3, $4, 'DRAFTED', '')
     RETURNING id`,
    [storyId, workunitId, chapterId, idxNo]
  );
  const sceneId = Number(sceneRes.rows[0].id);

  const versionRes = await db.query(
    `INSERT INTO public.narrative_scene_version(story_id, scene_id, version_no, kind, text_content, eval_json, summary)
     VALUES ($1, $2, 1, 'draft', 'Needs rewrite', $3::jsonb, 'doctor review policy')
     RETURNING id`,
    [storyId, sceneId, JSON.stringify({ overall: 2.8 })]
  );
  const versionId = Number(versionRes.rows[0].id);
  await db.query(`UPDATE public.narrative_scene SET current_version_id = $2 WHERE id = $1`, [sceneId, versionId]);

  const taskRes = await db.query(
    `INSERT INTO public.ingest_task(job_id, story_id, unit_type, source_path, seq_no, status, attempts, payload_json)
     VALUES ($1, $2, 'scene', $4, 1, 'WAIT_REVIEW', 1, $3::jsonb)
     RETURNING id`,
    [jobId, storyId, JSON.stringify({ scene_id: sceneId, scene_version_id: versionId }), workunitId]
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

  const submit = await request(`/api/${STORY_SLUG}/reviews`, "POST", {
    action: "submit_response",
    request_id: requestId,
    reviewer_name: "doctor_reviewer_policy",
    scores_json: { logic: 2.5, pacing: 2.8, consistency: 2.4, voice: 2.6 },
    flags_json: { critical: ["plot hole"], major: ["tone"], minor: [] },
    suggestions_text: "Must rewrite with canonical fixes.",
    canon_proposals_json: [{ category: "lore", content: "Bridge rejects false oaths.", importance: 5 }],
  });
  assert(submit.status === 200, "submit_response should return 200", submit);
  assert(submit.json?.ok === true, "submit_response should be ok");

  const apply = await request(`/api/${STORY_SLUG}/reviews`, "POST", {
    action: "apply_response",
    request_id: requestId,
    applied_by: "doctor_operator_policy",
  });
  assert(apply.status === 200, "apply_response should return 200", apply);
  assert(apply.json?.ok === true, "apply_response should return ok=true");
  assert(apply.json?.policy?.decision === "REWRITE", "policy decision should be REWRITE");

  const verify = new Client({ connectionString: DB_DSN });
  await verify.connect();
  const sceneCheck = await verify.query(`SELECT status FROM public.narrative_scene WHERE id = $1`, [sceneId]);
  assert(sceneCheck.rows[0].status === "EVALUATED", "scene should be EVALUATED after REWRITE decision");

  const taskCheck = await verify.query(`SELECT status FROM public.ingest_task WHERE id = $1`, [waitTaskId]);
  assert(taskCheck.rows[0].status === "DONE", "WAIT_REVIEW task should be DONE after apply");

  const reqCheck = await verify.query(`SELECT status FROM public.review_request WHERE id = $1`, [requestId]);
  assert(reqCheck.rows[0].status === "APPLIED", "review request should be APPLIED");

  await verify.query(`DELETE FROM public.review_request WHERE id = $1`, [requestId]);
  await verify.query(`DELETE FROM public.story_canon_fact WHERE story_id = $1 AND source_ref LIKE $2`, [storyId, `review:${requestId}:%`]);
  await verify.query(`DELETE FROM public.narrative_scene_version WHERE id = $1`, [versionId]);
  await verify.query(`DELETE FROM public.narrative_scene WHERE id = $1`, [sceneId]);
  await verify.query(`DELETE FROM public.ingest_job WHERE id = $1`, [jobId]);
  await verify.end();

  console.log("[doctor-review-policy] PASS");
}

main().catch((err) => {
  console.error("[doctor-review-policy] FAIL", err);
  process.exit(1);
});
