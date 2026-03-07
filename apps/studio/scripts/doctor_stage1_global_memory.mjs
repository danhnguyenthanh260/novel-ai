import { Client } from "pg";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "doctor_stage1_global";

function assert(condition, message, detail) {
  if (!condition) {
    const extra = detail ? ` | detail=${JSON.stringify(detail)}` : "";
    throw new Error(`${message}${extra}`);
  }
}

async function request(path, method, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
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

  const stylePut = await request(`/api/${STORY_SLUG}/style-profile`, "PUT", {
    tone_baseline: "grim and precise",
    darkness_level: 72,
    political_intensity: 61,
    pacing_bias: 43,
    prose_density: 54,
  });
  assert(stylePut.status === 200 && stylePut.json?.ok === true, "style profile put failed", stylePut);

  const coreNote = await request(`/api/${STORY_SLUG}/worldbuilding`, "POST", {
    category: "faction",
    content: "The Bridge Council controls oath law and transit taxes.",
    importance: 5,
    injection_mode: "CORE",
    tags: ["bridge", "council"],
  });
  assert(coreNote.status === 200 && coreNote.json?.ok === true, "core note create failed", coreNote);

  const taggedNote = await request(`/api/${STORY_SLUG}/worldbuilding`, "POST", {
    category: "religion",
    content: "Ash oath is forbidden and triggers tribunal escalation.",
    importance: 4,
    injection_mode: "TAGGED",
    tags: ["oath", "tribunal"],
  });
  assert(taggedNote.status === 200 && taggedNote.json?.ok === true, "tagged note create failed", taggedNote);

  const listPreview = await request(`/api/${STORY_SLUG}/worldbuilding?limit=20`, "GET");
  assert(listPreview.status === 200 && listPreview.json?.ok === true, "worldbuilding list failed", listPreview);
  assert(Array.isArray(listPreview.json?.items) && listPreview.json.items.length >= 2, "worldbuilding list should have notes");

  const guard = await request(`/api/${STORY_SLUG}/guard/preflight`, "POST", {
    keywords: "bridge oath",
    max_context_tokens: 600,
  });
  assert(guard.status === 200 && guard.json?.ok === true, "guard preflight failed", guard);
  assert(Array.isArray(guard.json?.guard?.sections?.global?.style), "guard missing global.style");
  assert(Array.isArray(guard.json?.guard?.sections?.global?.worldCore), "guard missing global.worldCore");
  assert(Array.isArray(guard.json?.guard?.sections?.global?.worldTagged), "guard missing global.worldTagged");
  assert(Array.isArray(guard.json?.guard?.sections?.local?.canon), "guard missing local.canon");
  assert(Number(guard.json?.guard?.stats?.approx_tokens ?? 0) <= Number(guard.json?.guard?.stats?.max_tokens ?? 0), "token budget invariant violated");

  const wbDeleteRows = await db.query(
    `DELETE FROM public.story_worldbuilding_note
     WHERE story_id = $1
     RETURNING id`,
    [storyId]
  );
  assert(wbDeleteRows.rowCount >= 2, "cleanup worldbuilding failed");
  await db.query(`DELETE FROM public.story_style_profile WHERE story_id = $1`, [storyId]);
  await db.end();

  console.log("[doctor-stage1-global-memory] PASS");
}

main().catch((err) => {
  console.error("[doctor-stage1-global-memory] FAIL", err);
  process.exit(1);
});
