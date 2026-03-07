import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "default";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectFail(fn, label) {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error(`Expected failure: ${label}`);
}

async function tableExists(client, tableName) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS ok`,
    [tableName]
  );
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(client, tableName, columnName) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS ok`,
    [tableName, columnName]
  );
  return Boolean(res.rows[0]?.ok);
}

async function main() {
  const client = new Client({ connectionString: DB_DSN });
  await client.connect();

  const storyRes = await client.query(`SELECT id FROM public.story_series WHERE slug = $1 LIMIT 1`, [STORY_SLUG]);
  assert(storyRes.rows[0], `Story not found: ${STORY_SLUG}`);
  const storyId = Number(storyRes.rows[0].id);

  const requiredTables = [
    "story_canon_fact",
    "ingest_job",
    "ingest_task",
    "review_request",
    "review_response",
    "review_apply_log",
  ];

  for (const t of requiredTables) {
    assert(await tableExists(client, t), `Missing table: ${t}`);
  }

  assert(await columnExists(client, "story_canon_fact", "content_tsv"), "Missing content_tsv on story_canon_fact");
  assert(await columnExists(client, "ingest_task", "status"), "Missing status on ingest_task");

  const setup = await client.query(
    `INSERT INTO public.ingest_job(story_id, created_by, mode, status, config_json, total_tasks, completed_tasks)
     VALUES ($1, 'doctor_memory_bridge', 'AUTO_LOCK', 'PENDING', '{}'::jsonb, 2, 0)
     RETURNING id`,
    [storyId]
  );
  const jobId = Number(setup.rows[0].id);

  await client.query(
    `INSERT INTO public.ingest_task(job_id, story_id, unit_type, source_path, seq_no, status, attempts, payload_json)
     VALUES
       ($1, $2, 'chapter', '/tmp/ch001.txt', 1, 'PENDING', 0, '{}'::jsonb),
       ($1, $2, 'chapter', '/tmp/ch002.txt', 2, 'PENDING', 0, '{}'::jsonb)`,
    [jobId, storyId]
  );

  await expectFail(
    () =>
      client.query(
        `INSERT INTO public.ingest_task(job_id, story_id, unit_type, source_path, seq_no, status)
         VALUES ($1, $2, 'chapter', '/tmp/ch001_dup.txt', 1, 'PENDING')`,
        [jobId, storyId]
      ),
    "uq_ingest_task_job_seq"
  );

  await expectFail(
    () =>
      client.query(
        `INSERT INTO public.ingest_job(story_id, created_by, mode, status)
         VALUES ($1, 'doctor_memory_bridge', 'BAD_MODE', 'PENDING')`,
        [storyId]
      ),
    "ingest_job mode check"
  );

  const c1 = new Client({ connectionString: DB_DSN });
  const c2 = new Client({ connectionString: DB_DSN });
  await c1.connect();
  await c2.connect();

  try {
    await c1.query("BEGIN");
    await c2.query("BEGIN");

    const r1 = await c1.query(
      `SELECT id
       FROM public.ingest_task
       WHERE job_id = $1 AND status = 'PENDING'
       ORDER BY seq_no ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [jobId]
    );

    const t1 = Number(r1.rows[0]?.id ?? 0);
    assert(t1 > 0, "Worker#1 did not lock any task");
    await c1.query(`UPDATE public.ingest_task SET status = 'RUNNING', attempts = attempts + 1 WHERE id = $1`, [t1]);

    const r2 = await c2.query(
      `SELECT id
       FROM public.ingest_task
       WHERE job_id = $1 AND status = 'PENDING'
       ORDER BY seq_no ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [jobId]
    );

    const t2 = Number(r2.rows[0]?.id ?? 0);
    assert(t2 > 0, "Worker#2 did not lock any remaining pending task");
    assert(t1 !== t2, "SKIP LOCKED returned duplicate task to concurrent workers");

    await c1.query("COMMIT");
    await c2.query("COMMIT");
  } catch (err) {
    await c1.query("ROLLBACK").catch(() => {});
    await c2.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await c1.end();
    await c2.end();
  }

  const canonInsert = await client.query(
    `INSERT INTO public.story_canon_fact(story_id, category, content, importance, source_ref)
     VALUES
       ($1, 'lore', 'Bridge opens only at dusk.', 5, 'ingest:test:1'),
       ($1, 'lore', 'Bridge hums at noon.', 5, 'ingest:test:2'),
       ($1, 'character', 'Iris remembers every promise.', 3, 'ingest:test:3')
     RETURNING id`,
    [storyId]
  );
  const canonIds = canonInsert.rows.map((r) => Number(r.id));

  const canonQuery = await client.query(
    `SELECT id, importance
     FROM public.story_canon_fact
     WHERE id = ANY($1::bigint[])
     ORDER BY importance DESC, updated_at DESC, id DESC`,
    [canonIds]
  );
  assert(canonQuery.rowCount === 3, "Canon rows missing after insert");
  assert(Number(canonQuery.rows[0].importance) >= Number(canonQuery.rows[1].importance), "Canon ordering mismatch");

  const tsvCheck = await client.query(
    `SELECT count(*)::int AS n
     FROM public.story_canon_fact
     WHERE id = ANY($1::bigint[])
       AND content_tsv IS NOT NULL`,
    [canonIds]
  );
  assert(Number(tsvCheck.rows[0]?.n ?? 0) === canonIds.length, "story_canon_fact.content_tsv not populated");

  await client.query(
    `DELETE FROM public.story_canon_fact
     WHERE id = ANY($1::bigint[])`,
    [canonIds]
  );

  await client.query(`DELETE FROM public.ingest_job WHERE id = $1`, [jobId]);

  await client.end();
  console.log("[doctor-memory-bridge] PASS");
}

main().catch((err) => {
  console.error("[doctor-memory-bridge] FAIL", err);
  process.exit(1);
});
