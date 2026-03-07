import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const DEFAULT_GOLDEN = process.env.SPLIT_GOLDEN_FILE || path.resolve(process.cwd(), "..", "benchmarks", "split_golden_set.json");
const DEFAULT_BASELINE = process.env.SPLIT_BASELINE_FILE || path.resolve(process.cwd(), "..", "benchmarks", "split_benchmark_baseline.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  const out = `${JSON.stringify(value, null, 2)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, out, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args[0] || "report";
  const flags = new Map();
  for (let i = 1; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "1";
    flags.set(key, val);
    if (val !== "1") i += 1;
  }
  return { mode, flags };
}

function buildMetrics(resultJson, taskId, updatedAt) {
  const qr = resultJson?.quality_report || {};
  const supervisorDecision = String(resultJson?.supervisor_decision || "unknown");
  const sceneCount = toNumber(resultJson?.scenes?.length);
  const totalScenes = toNumber(qr?.total, sceneCount);
  return {
    task_id: Number(taskId),
    updated_at: updatedAt ? new Date(updatedAt).toISOString() : null,
    strategy_selected: String(resultJson?.strategy_selected || "unknown"),
    supervisor_decision: supervisorDecision,
    safe_to_approve:
      resultJson?.safe_to_approve == null ? supervisorDecision === "auto_pass" : toBool(resultJson?.safe_to_approve),
    llm_calls_used: toNumber(resultJson?.llm_calls_used),
    llm_calls_budget: toNumber(resultJson?.llm_calls_budget),
    scene_count: sceneCount,
    flagged_pct: toNumber(qr?.flagged_pct),
    flagged_count: toNumber(qr?.flagged_count),
    total_scenes: totalScenes,
    mid_word_cut_count: toNumber(qr?.mid_word_cut_count),
    abbrev_or_name_cut_count: toNumber(qr?.abbrev_or_name_cut_count),
    fragmentation_score: toNumber(qr?.fragmentation_score),
    hard_fail: toBool(qr?.hard_fail || resultJson?.hard_fail),
  };
}

function evaluateThresholds(metrics, target = {}) {
  const violations = [];
  if (target.max_flagged_pct != null && metrics.flagged_pct > Number(target.max_flagged_pct)) {
    violations.push(`flagged_pct ${metrics.flagged_pct} > ${target.max_flagged_pct}`);
  }
  if (target.max_mid_word_cut != null && metrics.mid_word_cut_count > Number(target.max_mid_word_cut)) {
    violations.push(`mid_word_cut_count ${metrics.mid_word_cut_count} > ${target.max_mid_word_cut}`);
  }
  if (target.max_abbrev_or_name_cut != null && metrics.abbrev_or_name_cut_count > Number(target.max_abbrev_or_name_cut)) {
    violations.push(`abbrev_or_name_cut_count ${metrics.abbrev_or_name_cut_count} > ${target.max_abbrev_or_name_cut}`);
  }
  if (target.max_fragmentation_score != null && metrics.fragmentation_score > Number(target.max_fragmentation_score)) {
    violations.push(`fragmentation_score ${metrics.fragmentation_score} > ${target.max_fragmentation_score}`);
  }
  if (target.require_safe_to_approve === true && metrics.safe_to_approve !== true) {
    violations.push("safe_to_approve is false");
  }
  return violations;
}

function metricDelta(curr, prev) {
  return {
    flagged_pct: toNumber(curr.flagged_pct) - toNumber(prev?.flagged_pct),
    mid_word_cut_count: toNumber(curr.mid_word_cut_count) - toNumber(prev?.mid_word_cut_count),
    abbrev_or_name_cut_count: toNumber(curr.abbrev_or_name_cut_count) - toNumber(prev?.abbrev_or_name_cut_count),
    fragmentation_score: toNumber(curr.fragmentation_score) - toNumber(prev?.fragmentation_score),
    llm_calls_used: toNumber(curr.llm_calls_used) - toNumber(prev?.llm_calls_used),
  };
}

async function fetchLatestSplit(db, storySlug, chapterId) {
  const q = await db.query(
    `SELECT t.id, t.updated_at, t.result_json
       FROM public.ingest_task t
       JOIN public.story_series ss ON ss.id = t.story_id
      WHERE ss.slug = $1
        AND t.task_type = 'CHAPTER_SPLIT_LLM'
        AND t.status = 'DONE'
        AND COALESCE(t.result_json->>'chapter_id', '') = $2
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT 1`,
    [storySlug, chapterId]
  );
  if (!q.rows[0]) return null;
  return q.rows[0];
}

async function main() {
  const { mode, flags } = parseArgs();
  assert(["report", "baseline", "compare"].includes(mode), `Unsupported mode: ${mode}`);
  const goldenPath = path.resolve(flags.get("golden") || DEFAULT_GOLDEN);
  const baselinePath = path.resolve(flags.get("baseline") || DEFAULT_BASELINE);

  const golden = readJson(goldenPath);
  assert(Array.isArray(golden?.cases) && golden.cases.length > 0, "Golden set must have non-empty 'cases'");

  const db = new Client({ connectionString: DB_DSN });
  await db.connect();
  try {
    const results = [];
    for (const c of golden.cases) {
      const storySlug = String(c.story_slug || "").trim();
      const chapterId = String(c.chapter_id || "").trim();
      assert(storySlug && chapterId, "Each case must include story_slug and chapter_id");
      const row = await fetchLatestSplit(db, storySlug, chapterId);
      if (!row) {
        results.push({
          story_slug: storySlug,
          chapter_id: chapterId,
          status: "missing",
          violations: ["missing latest DONE CHAPTER_SPLIT_LLM task"],
        });
        continue;
      }
      const metrics = buildMetrics(row.result_json, row.id, row.updated_at);
      const violations = evaluateThresholds(metrics, c.target || {});
      results.push({
        story_slug: storySlug,
        chapter_id: chapterId,
        status: violations.length ? "fail" : "pass",
        metrics,
        target: c.target || {},
        violations,
      });
    }

    const failed = results.filter((x) => x.status !== "pass");
    const summary = {
      generated_at: new Date().toISOString(),
      mode,
      golden_file: goldenPath,
      total_cases: results.length,
      passed_cases: results.length - failed.length,
      failed_cases: failed.length,
      pass_rate_pct: results.length ? Math.round(((results.length - failed.length) * 10000) / results.length) / 100 : 0,
      results,
    };

    if (mode === "baseline") {
      writeJson(baselinePath, summary);
      console.log(`[doctor-split-benchmark] baseline saved -> ${baselinePath}`);
    } else if (mode === "compare") {
      const prev = readJson(baselinePath);
      const byKey = new Map((prev?.results || []).map((x) => [`${x.story_slug}::${x.chapter_id}`, x]));
      const compare = summary.results.map((x) => {
        const key = `${x.story_slug}::${x.chapter_id}`;
        const p = byKey.get(key);
        return {
          story_slug: x.story_slug,
          chapter_id: x.chapter_id,
          status: x.status,
          prev_status: p?.status || "missing",
          delta: metricDelta(x.metrics || {}, p?.metrics || {}),
          current: x.metrics || {},
          previous: p?.metrics || {},
          violations: x.violations || [],
        };
      });
      const out = {
        ...summary,
        baseline_file: baselinePath,
        compare,
      };
      console.log(JSON.stringify(out, null, 2));
      if (failed.length) process.exitCode = 2;
      return;
    }

    console.log(JSON.stringify(summary, null, 2));
    if (failed.length && mode !== "baseline") process.exitCode = 2;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("[doctor-split-benchmark] FAIL", err);
  process.exit(1);
});
