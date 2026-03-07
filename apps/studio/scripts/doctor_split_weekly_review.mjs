import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_OUT_DIR = "docs/operations/weekly-review";

function parseArgs() {
  const args = process.argv.slice(2);
  let storySlug = "";
  let days = 7;
  let outDir = DEFAULT_OUT_DIR;
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
    if (token === "--out-dir" && args[i + 1]) {
      outDir = String(args[i + 1]).trim() || outDir;
      i += 1;
    }
  }
  if (!storySlug) throw new Error("Missing --story <slug>");
  return { storySlug, days, outDir };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(num, den) {
  if (den <= 0) return 0;
  return Math.round((num * 10000) / den) / 100;
}

function stampDate() {
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

async function fetchWindow(db, storyId, fromDaysAgo, toDaysAgo) {
  const res = await db.query(
    `
    SELECT
      COUNT(*)::int AS done_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'APPROVED_HUMAN'
      )::int AS human_pass_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'FAILED_HUMAN_REJECTED'
      )::int AS human_reject_runs,
      COUNT(*) FILTER (
        WHERE COALESCE(result_json->>'supervisor_decision','auto_pass') = 'manual_review'
      )::int AS manual_review_runs,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(result_json->>'supervisor_retry_used','false')) = 'true'
      )::int AS retry_runs,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(result_json->>'exploration_used','false')) = 'true'
      )::int AS exploration_runs,
      COUNT(DISTINCT COALESCE(NULLIF(result_json->>'strategy_selected',''), '(none)'))::int AS strategy_diversity,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(human_outcome,''), result_json->>'human_outcome', '') = 'APPROVED_HUMAN'
          AND lower(COALESCE(result_json->>'supervisor_retry_used','false')) <> 'true'
      )::int AS first_pass_success_runs
    FROM public.ingest_task
    WHERE story_id = $1
      AND task_type = 'CHAPTER_SPLIT_LLM'
      AND status = 'DONE'
      AND updated_at >= now() - ($2::text || ' days')::interval
      AND updated_at < now() - ($3::text || ' days')::interval
    `,
    [storyId, String(fromDaysAgo), String(toDaysAgo)]
  );
  const row = res.rows[0] || {};
  const done = toNum(row.done_runs);
  const humanPass = toNum(row.human_pass_runs);
  const manualReview = toNum(row.manual_review_runs);
  const retry = toNum(row.retry_runs);
  const exploration = toNum(row.exploration_runs);
  const firstPass = toNum(row.first_pass_success_runs);
  const humanReject = toNum(row.human_reject_runs);
  return {
    done_runs: done,
    human_pass_rate: pct(humanPass, done),
    human_reject_rate: pct(humanReject, done),
    manual_review_rate: pct(manualReview, done),
    reprocess_rate: pct(retry, done),
    strategy_diversity: toNum(row.strategy_diversity),
    first_pass_success_rate: pct(firstPass, done),
    exploration_rate: pct(exploration, done),
  };
}

function recommendation(current, previous) {
  const out = [];
  const humanPassDrop = current.human_pass_rate - previous.human_pass_rate;
  if (current.done_runs === 0) {
    out.push("No runs in current window. Keep policy unchanged and gather fresh data.");
    return out;
  }
  if (current.strategy_diversity < 2) {
    out.push("Increase exploration rate by +0.03 for next week (max 0.20) to avoid strategy lock-in.");
  }
  if (current.reprocess_rate > 35) {
    out.push("Tighten first-attempt quality gates and force one extra retry for high-fragmentation chapters.");
  }
  if (current.first_pass_success_rate < 55) {
    out.push("Bias away from current top failed strategy using supervisor history and issue hints.");
  }
  if (humanPassDrop < -3) {
    out.push("Human pass dropped >3pt vs previous window. Freeze new policy changes and run root-cause review.");
  }
  if (current.manual_review_rate > 45 && current.human_reject_rate < 10) {
    out.push("Manual review might be too strict. Relax threshold slightly for low-risk chapters.");
  }
  if (!out.length) {
    out.push("Metrics stable. Keep current policy and refresh baseline only if guardrail stays green.");
  }
  return out;
}

function renderMarkdown(input) {
  const lines = [];
  lines.push(`# Split Weekly Review (${input.storySlug})`);
  lines.push("");
  lines.push(`- Story ID: ${input.storyId}`);
  lines.push(`- Generated at (UTC): ${input.generatedAt}`);
  lines.push(`- Window size: ${input.days} days`);
  lines.push("");
  lines.push("## KPI Snapshot");
  lines.push("");
  lines.push("| KPI | Current Window | Previous Window | Delta |");
  lines.push("|---|---:|---:|---:|");
  const keys = [
    "done_runs",
    "human_pass_rate",
    "human_reject_rate",
    "manual_review_rate",
    "reprocess_rate",
    "strategy_diversity",
    "first_pass_success_rate",
    "exploration_rate",
  ];
  for (const key of keys) {
    const c = toNum(input.current[key]);
    const p = toNum(input.previous[key]);
    const d = Math.round((c - p) * 100) / 100;
    lines.push(`| ${key} | ${c.toFixed(2)} | ${p.toFixed(2)} | ${d >= 0 ? "+" : ""}${d.toFixed(2)} |`);
  }
  lines.push("");
  lines.push("## Recommendations");
  lines.push("");
  for (const r of input.recommendations) {
    lines.push(`- ${r}`);
  }
  lines.push("");
  lines.push("## Tuning Decision Log (Fill this section)");
  lines.push("");
  lines.push("- Decision owner:");
  lines.push("- Policy change applied:");
  lines.push("- Expected KPI impact:");
  lines.push("- Rollback condition:");
  lines.push("- Notes:");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  const db = new Client({ connectionString: DB_DSN });
  await db.connect();
  try {
    const storyId = await resolveStoryId(db, args.storySlug);
    const current = await fetchWindow(db, storyId, args.days, 0);
    const previous = await fetchWindow(db, storyId, args.days * 2, args.days);
    const recommendations = recommendation(current, previous);
    const generatedAt = new Date().toISOString();
    const json = {
      ok: true,
      story_slug: args.storySlug,
      story_id: storyId,
      days: args.days,
      current,
      previous,
      recommendations,
      generated_at: generatedAt,
    };

    const md = renderMarkdown({
      storySlug: args.storySlug,
      storyId,
      days: args.days,
      current,
      previous,
      recommendations,
      generatedAt,
    });

    const outAbs = path.isAbsolute(args.outDir) ? args.outDir : path.resolve(REPO_ROOT, args.outDir);
    await fs.mkdir(outAbs, { recursive: true });
    const base = `${args.storySlug}-${stampDate()}`;
    const mdPath = path.join(outAbs, `${base}.md`);
    const jsonPath = path.join(outAbs, `${base}.json`);
    await fs.writeFile(mdPath, md, "utf8");
    await fs.writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          ok: true,
          story_slug: args.storySlug,
          story_id: storyId,
          days: args.days,
          report_markdown: mdPath,
          report_json: jsonPath,
          generated_at: generatedAt,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("[doctor-split-weekly-review] FAIL", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
