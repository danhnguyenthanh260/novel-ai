import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_guard";

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
  const storyRes = await db.query(`SELECT id FROM public.story_series WHERE slug = $1`, [STORY_SLUG]);
  const storyId = Number(storyRes.rows[0].id);

  const sceneRes = await db.query(
    `INSERT INTO public.narrative_scene(story_id, workunit_id, chapter_id, idx, status, draft_text)
     VALUES ($1, 'doctor_guard_s01', 'doctor_guard_ch01', 1, 'DRAFTED', '')
     ON CONFLICT (story_id, workunit_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [storyId]
  );
  const sceneId = Number(sceneRes.rows[0].id);
  const versionRes = await db.query(
    `INSERT INTO public.narrative_scene_version(story_id, scene_id, version_no, kind, text_content, summary)
     VALUES ($1, $2, 1, 'draft', 'doctor guard seed text', 'doctor guard seed')
     RETURNING id`,
    [storyId, sceneId]
  );
  const sceneVersionId = Number(versionRes.rows[0].id);
  await db.query(
    `UPDATE public.narrative_scene
     SET current_version_id = $2
     WHERE id = $1`,
    [sceneId, sceneVersionId]
  );

  await db.query(
    `INSERT INTO public.canon_fact(story_id, scene_id, scene_version_id, algo_version, subject, predicate, object, confidence, tags)
     VALUES ($1, $2, $3, 'doctor_guard', 'Alpha Core', 'is', 'High importance lore signal alpha', 0.98, ARRAY['lore'])
     RETURNING id`,
    [storyId, sceneId, sceneVersionId]
  );
  await db.query(
    `INSERT INTO public.canon_fact(story_id, scene_id, scene_version_id, algo_version, subject, predicate, object, confidence, tags)
     VALUES ($1, $2, $3, 'doctor_guard', 'Beta Signal', 'is', 'Low importance lore signal beta', 0.40, ARRAY['lore'])
     RETURNING id`,
    [storyId, sceneId, sceneVersionId]
  );
  await db.query(
    `INSERT INTO public.canon_fact(story_id, scene_id, scene_version_id, algo_version, subject, predicate, object, confidence, tags)
     VALUES ($1, $2, $3, 'doctor_guard', 'Iris', 'relationship_trusts', 'Vek under oath', 0.93, ARRAY['relationship'])
     RETURNING id`,
    [storyId, sceneId, sceneVersionId]
  );

  await db.query(
    `INSERT INTO public.timeline_anchor(story_id, scene_id, scene_version_id, algo_version, event_label, relative_time, absolute_time, location, participants)
     VALUES ($1, $2, $3, 'doctor_guard', 'Bridge Event', 'after oath break', NULL, 'Bridge', ARRAY['Iris','Vek'])`,
    [storyId, sceneId, sceneVersionId]
  );

  const guardRes = await post(`/api/${STORY_SLUG}/guard/preflight`, {
    keywords: "alpha Iris bridge",
    max_context_tokens: 350,
  });
  assert(guardRes.status === 200, "guard preflight should return 200");
  assert(guardRes.json?.ok === true, "guard preflight should return ok=true");
  assert(typeof guardRes.json?.guard?.block === "string", "guard block missing");

  const sections = guardRes.json.guard.sections;
  const stats = guardRes.json.guard.stats;
  assert(Array.isArray(sections?.canon), "guard canon section missing");
  assert(Array.isArray(sections?.relationships), "guard relationships section missing");
  assert(Array.isArray(sections?.recentEvents), "guard recentEvents section missing");
  assert(Array.isArray(sections?.uncertain), "guard uncertain section missing");
  assert(Number(stats?.approx_tokens ?? 0) <= Number(stats?.max_tokens ?? 0), "token budget invariant violated");

  const canonJoined = sections.canon.join("\n");
  assert(canonJoined.includes("Alpha Core"), "high-confidence canon row should be present");
  assert(canonJoined.includes("Beta Signal"), "secondary canon row should be present");
  assert(sections.relationships.join("\n").includes("Iris"), "relationship section missing relationship fact");
  assert(sections.recentEvents.join("\n").includes("Bridge Event"), "recent events should include timeline anchor");

  await db.query(`DELETE FROM public.canon_fact WHERE story_id = $1 AND algo_version = 'doctor_guard'`, [storyId]);
  await db.query(`DELETE FROM public.timeline_anchor WHERE story_id = $1 AND algo_version = 'doctor_guard'`, [storyId]);
  await db.query(`DELETE FROM public.narrative_scene WHERE story_id = $1 AND workunit_id = 'doctor_guard_s01'`, [storyId]);
  await db.end();

  console.log("[doctor-canon-guard] PASS");
}

main().catch((err) => {
  console.error("[doctor-canon-guard] FAIL", err);
  process.exit(1);
});
