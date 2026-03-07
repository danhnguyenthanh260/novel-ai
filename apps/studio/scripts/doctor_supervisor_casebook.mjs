import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const DEFAULT_DAYS = 7;

function parseArgs() {
  const args = process.argv.slice(2);
  let storySlug = "";
  let days = DEFAULT_DAYS;
  let sync = true;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--story" && args[i + 1]) {
      storySlug = String(args[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--days" && args[i + 1]) {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n) && n > 0) days = Math.max(1, Math.floor(n));
      i += 1;
      continue;
    }
    if (token === "--no-sync") {
      sync = false;
    }
  }
  if (!storySlug) throw new Error("Missing --story <slug>");
  return { storySlug, days, sync };
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function resolveStoryId(db, storySlug) {
  const res = await db.query(
    `SELECT id
     FROM public.story_series
     WHERE slug = $1
     LIMIT 1`,
    [storySlug]
  );
  const id = Number(res.rows[0]?.id ?? 0);
  if (!id) throw new Error("STORY_NOT_FOUND");
  return id;
}

async function syncSupervisorMemory(db, storyId) {
  const res = await db.query(
    `
    WITH split_rows AS (
      SELECT
        t.story_id,
        t.job_id,
        t.id AS chapter_task_id,
        COALESCE(NULLIF(t.result_json->>'chapter_id',''), NULLIF(t.payload_json->>'chapter_id','')) AS chapter_id,
        COALESCE(NULLIF(t.result_json->>'source_type',''), NULLIF(t.payload_json->>'source_type','')) AS source_type,
        COALESCE(NULLIF(t.result_json->>'source_role',''), NULLIF(t.payload_json->>'source_role','')) AS source_role,
        NULLIF(t.result_json->>'strategy_selected','') AS strategy_selected,
        NULLIF(t.result_json->>'supervisor_decision','') AS supervisor_decision,
        COALESCE(NULLIF(t.human_outcome,''), NULLIF(t.result_json->>'human_outcome','')) AS human_outcome,
        COALESCE((t.result_json->>'quality_self_signal')::numeric, NULL) AS quality_self_signal,
        (
          COALESCE(NULLIF(t.result_json->>'source_type',''), NULLIF(t.payload_json->>'source_type','')) = 'reprocess_scene_only'
          OR (t.payload_json ? 'reprocess_reason_code')
        ) AS is_reprocess,
        jsonb_strip_nulls(
          jsonb_build_object(
            'quality_report', t.result_json->'quality_report',
            'issue_hints', t.result_json->'issue_hints',
            'source_doc_sha256', COALESCE(t.result_json->>'source_doc_sha256', t.payload_json->>'source_doc_sha256'),
            'rerun_reason', t.result_json->>'rerun_reason',
            'forced_preferred_strategy', t.result_json->>'forced_preferred_strategy'
          )
        ) AS signals_json,
        LEFT(
          COALESCE(
            NULLIF(t.result_json->>'rerun_reason',''),
            NULLIF(t.result_json->'scenes'->0->>'summary',''),
            NULLIF(t.result_json->'quality_report'->>'flagged_pct',''),
            'split_case'
          ),
          2000
        ) AS summary,
        t.updated_at
      FROM public.ingest_task t
      WHERE t.story_id = $1
        AND t.task_type = 'CHAPTER_SPLIT_LLM'
        AND t.status = 'DONE'
    ),
    labelled AS (
      SELECT
        *,
        CASE
          WHEN human_outcome = 'APPROVED_HUMAN' AND is_reprocess THEN 'SUCCESS_AFTER_REPROCESS'
          WHEN human_outcome = 'APPROVED_HUMAN' AND NOT is_reprocess THEN 'SUCCESS_NO_REPROCESS'
          WHEN human_outcome = 'FAILED_HUMAN_REJECTED' THEN 'FAILED_PATTERN'
          WHEN COALESCE(supervisor_decision, 'auto_pass') = 'manual_review' THEN 'FAILED_PATTERN'
          WHEN COALESCE((signals_json->'quality_report'->>'hard_fail')::boolean, false) THEN 'FAILED_PATTERN'
          ELSE NULL
        END AS label
      FROM split_rows
    ),
    upserted AS (
      INSERT INTO public.supervisor_memory (
        story_id,
        job_id,
        chapter_task_id,
        chapter_id,
        label,
        source_type,
        source_role,
        strategy_selected,
        supervisor_decision,
        human_outcome,
        quality_self_signal,
        is_reprocess,
        signals_json,
        summary,
        created_at,
        updated_at
      )
      SELECT
        story_id,
        job_id,
        chapter_task_id,
        chapter_id,
        label,
        source_type,
        source_role,
        strategy_selected,
        supervisor_decision,
        human_outcome,
        quality_self_signal,
        is_reprocess,
        signals_json,
        summary,
        updated_at,
        now()
      FROM labelled
      WHERE label IS NOT NULL
      ON CONFLICT (story_id, chapter_task_id)
      DO UPDATE SET
        job_id = EXCLUDED.job_id,
        chapter_id = EXCLUDED.chapter_id,
        label = EXCLUDED.label,
        source_type = EXCLUDED.source_type,
        source_role = EXCLUDED.source_role,
        strategy_selected = EXCLUDED.strategy_selected,
        supervisor_decision = EXCLUDED.supervisor_decision,
        human_outcome = EXCLUDED.human_outcome,
        quality_self_signal = EXCLUDED.quality_self_signal,
        is_reprocess = EXCLUDED.is_reprocess,
        signals_json = EXCLUDED.signals_json,
        summary = EXCLUDED.summary,
        updated_at = now()
      RETURNING 1
    )
    SELECT COUNT(*)::int AS rows_upserted
    FROM upserted
    `,
    [storyId]
  );
  return Number(res.rows[0]?.rows_upserted ?? 0);
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function loadCasebookData(db, storyId, days) {
  const summaryRes = await db.query(
    `
    SELECT
      label,
      COUNT(*)::int AS total_cases,
      ROUND(AVG(COALESCE((signals_json->'quality_report'->>'flagged_pct')::numeric, 0)), 2) AS avg_flagged_pct,
      ROUND(AVG(COALESCE((signals_json->'quality_report'->>'fragmentation_score')::numeric, 0)), 2) AS avg_fragmentation
    FROM public.supervisor_memory
    WHERE story_id = $1
      AND created_at >= now() - ($2::text || ' days')::interval
    GROUP BY label
    ORDER BY total_cases DESC, label ASC
    `,
    [storyId, String(days)]
  );

  const failedIssuesRes = await db.query(
    `
    SELECT
      issue.key AS issue_code,
      SUM(COALESCE((issue.value)::numeric, 0))::numeric AS score_sum
    FROM public.supervisor_memory sm
    CROSS JOIN LATERAL jsonb_each(COALESCE(sm.signals_json->'issue_hints', '{}'::jsonb)) AS issue(key, value)
    WHERE sm.story_id = $1
      AND sm.label = 'FAILED_PATTERN'
      AND sm.created_at >= now() - ($2::text || ' days')::interval
    GROUP BY issue.key
    ORDER BY score_sum DESC, issue_code ASC
    LIMIT 10
    `,
    [storyId, String(days)]
  );

  const sampleRes = await db.query(
    `
    SELECT
      label,
      chapter_id,
      chapter_task_id,
      job_id,
      strategy_selected,
      supervisor_decision,
      human_outcome,
      COALESCE((signals_json->'quality_report'->>'flagged_pct')::numeric, 0) AS flagged_pct,
      COALESCE((signals_json->'quality_report'->>'fragmentation_score')::numeric, 0) AS fragmentation_score,
      LEFT(COALESCE(summary, ''), 220) AS summary
    FROM public.supervisor_memory
    WHERE story_id = $1
      AND created_at >= now() - ($2::text || ' days')::interval
    ORDER BY created_at DESC, id DESC
    LIMIT 30
    `,
    [storyId, String(days)]
  );

  return {
    summaryRows: summaryRes.rows,
    failedIssueRows: failedIssuesRes.rows,
    sampleRows: sampleRes.rows,
  };
}

function renderMarkdown({ storySlug, storyId, days, syncedRows, generatedAt, data }) {
  const lines = [];
  lines.push(`# Supervisor Casebook (${storySlug})`);
  lines.push("");
  lines.push(`- Story ID: ${storyId}`);
  lines.push(`- Window: last ${days} days`);
  lines.push(`- Generated at (UTC): ${generatedAt}`);
  lines.push(`- Synced rows: ${syncedRows}`);
  lines.push("");
  lines.push("## Label Summary");
  lines.push("");
  lines.push("| Label | Cases | Avg Flagged % | Avg Fragmentation |");
  lines.push("|---|---:|---:|---:|");
  for (const row of data.summaryRows) {
    lines.push(
      `| ${row.label} | ${toNum(row.total_cases)} | ${toNum(row.avg_flagged_pct).toFixed(2)} | ${toNum(
        row.avg_fragmentation
      ).toFixed(2)} |`
    );
  }
  if (!data.summaryRows.length) lines.push("| (none) | 0 | 0.00 | 0.00 |");
  lines.push("");
  lines.push("## Top Failed Patterns");
  lines.push("");
  lines.push("| Issue Code | Score Sum |");
  lines.push("|---|---:|");
  for (const row of data.failedIssueRows) {
    lines.push(`| ${row.issue_code} | ${toNum(row.score_sum).toFixed(2)} |`);
  }
  if (!data.failedIssueRows.length) lines.push("| (none) | 0.00 |");
  lines.push("");
  lines.push("## Recent Cases");
  lines.push("");
  lines.push("| Label | Chapter | Task | Job | Strategy | Supervisor | Human | Flagged % | Frag | Summary |");
  lines.push("|---|---|---:|---:|---|---|---|---:|---:|---|");
  for (const row of data.sampleRows) {
    lines.push(
      `| ${row.label} | ${row.chapter_id ?? "-"} | ${toNum(row.chapter_task_id)} | ${toNum(row.job_id)} | ${
        row.strategy_selected ?? "-"
      } | ${row.supervisor_decision ?? "-"} | ${row.human_outcome ?? "-"} | ${toNum(row.flagged_pct).toFixed(2)} | ${toNum(
        row.fragmentation_score
      ).toFixed(2)} | ${(row.summary ?? "").replace(/\|/g, "\\|")} |`
    );
  }
  if (!data.sampleRows.length) lines.push("| (none) | - | 0 | 0 | - | - | - | 0.00 | 0.00 | - |");
  lines.push("");
  lines.push("## Action Notes");
  lines.push("");
  lines.push("- Promote repeated `FAILED_PATTERN` issue codes into explicit retry gates/policies.");
  lines.push("- Use `SUCCESS_NO_REPROCESS` as canonical examples for first-pass success prompt tuning.");
  lines.push("- Use `SUCCESS_AFTER_REPROCESS` to identify which reason codes are most recoverable.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const { storySlug, days, sync } = parseArgs();
  const db = new Client({ connectionString: DB_DSN });
  await db.connect();
  try {
    const storyId = await resolveStoryId(db, storySlug);
    let syncedRows = 0;
    await db.query("BEGIN");
    if (sync) syncedRows = await syncSupervisorMemory(db, storyId);
    const data = await loadCasebookData(db, storyId, days);
    await db.query("COMMIT");

    const generatedAt = new Date().toISOString();
    const markdown = renderMarkdown({ storySlug, storyId, days, syncedRows, generatedAt, data });
    const outDir = path.resolve(process.cwd(), "..", "..", "docs", "operations", "supervisor-casebook");
    await fs.mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, `${storySlug}-${todayStamp()}.md`);
    await fs.writeFile(outFile, markdown, "utf8");

    console.log(
      JSON.stringify(
        {
          ok: true,
          story_slug: storySlug,
          story_id: storyId,
          days,
          sync,
          synced_rows: syncedRows,
          output: path.relative(path.resolve(process.cwd(), "..", ".."), outFile),
          generated_at: generatedAt,
        },
        null,
        2
      )
    );
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    console.error("[doctor-supervisor-casebook] FAIL", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
