import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_BASELINE = path.resolve(process.cwd(), "..", "..", "benchmarks", "split_benchmark_baseline.json");
const DEFAULT_GOLDEN = path.resolve(process.cwd(), "..", "..", "benchmarks", "split_golden_set.json");
const DEFAULT_THRESHOLDS = path.resolve(process.cwd(), "..", "..", "benchmarks", "split_guardrail_thresholds.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const hasValue = args[i + 1] && !args[i + 1].startsWith("--");
    flags.set(key, hasValue ? args[i + 1] : "1");
    if (hasValue) i += 1;
  }
  return {
    baseline: path.resolve(flags.get("baseline") || DEFAULT_BASELINE),
    golden: path.resolve(flags.get("golden") || DEFAULT_GOLDEN),
    thresholds: path.resolve(flags.get("thresholds") || DEFAULT_THRESHOLDS),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("COMPARE_OUTPUT_NOT_JSON");
  return JSON.parse(text.slice(start));
}

function loadThresholds(filePath) {
  const defaults = {
    max_pass_rate_drop_pct: 0,
    max_failed_cases_delta: 0,
    max_flagged_pct_regression: 3,
    max_fragmentation_regression: 6,
    max_mid_word_cut_regression: 0,
    max_abbrev_or_name_cut_regression: 0,
    max_llm_calls_used_regression: 1,
    allow_hard_fail_regression: false,
    per_case_overrides: {},
  };
  if (!fs.existsSync(filePath)) return defaults;
  const parsed = readJson(filePath);
  return {
    ...defaults,
    ...(parsed && typeof parsed === "object" ? parsed : {}),
    per_case_overrides:
      parsed && typeof parsed === "object" && parsed.per_case_overrides && typeof parsed.per_case_overrides === "object"
        ? parsed.per_case_overrides
        : {},
  };
}

function evaluate(compareJson, thresholds) {
  const violations = [];
  const currPassRate = toNum(compareJson.pass_rate_pct);
  const prevPassRate = toNum(readJson(compareJson.baseline_file).pass_rate_pct);
  const passRateDrop = prevPassRate - currPassRate;
  if (passRateDrop > toNum(thresholds.max_pass_rate_drop_pct)) {
    violations.push(`pass_rate_drop ${passRateDrop.toFixed(2)} > ${toNum(thresholds.max_pass_rate_drop_pct).toFixed(2)}`);
  }

  const failedDelta = toNum(compareJson.failed_cases) - toNum(readJson(compareJson.baseline_file).failed_cases);
  if (failedDelta > toNum(thresholds.max_failed_cases_delta)) {
    violations.push(`failed_cases_delta ${failedDelta} > ${toNum(thresholds.max_failed_cases_delta)}`);
  }

  const caseViolations = [];
  for (const row of compareJson.compare || []) {
    const key = `${row.story_slug}::${row.chapter_id}`;
    const o = thresholds.per_case_overrides[key] || {};
    const maxFlagged = o.max_flagged_pct_regression ?? thresholds.max_flagged_pct_regression;
    const maxFrag = o.max_fragmentation_regression ?? thresholds.max_fragmentation_regression;
    const maxMid = o.max_mid_word_cut_regression ?? thresholds.max_mid_word_cut_regression;
    const maxAbbrev = o.max_abbrev_or_name_cut_regression ?? thresholds.max_abbrev_or_name_cut_regression;
    const maxLlm = o.max_llm_calls_used_regression ?? thresholds.max_llm_calls_used_regression;
    const allowHardFail = o.allow_hard_fail_regression ?? thresholds.allow_hard_fail_regression;

    const delta = row.delta || {};
    const current = row.current || {};
    const previous = row.previous || {};
    const local = [];

    if (toNum(delta.flagged_pct) > toNum(maxFlagged)) local.push(`flagged_pct_delta ${toNum(delta.flagged_pct).toFixed(2)} > ${toNum(maxFlagged).toFixed(2)}`);
    if (toNum(delta.fragmentation_score) > toNum(maxFrag)) {
      local.push(`fragmentation_delta ${toNum(delta.fragmentation_score).toFixed(2)} > ${toNum(maxFrag).toFixed(2)}`);
    }
    if (toNum(delta.mid_word_cut_count) > toNum(maxMid)) {
      local.push(`mid_word_cut_delta ${toNum(delta.mid_word_cut_count)} > ${toNum(maxMid)}`);
    }
    if (toNum(delta.abbrev_or_name_cut_count) > toNum(maxAbbrev)) {
      local.push(`abbrev_or_name_cut_delta ${toNum(delta.abbrev_or_name_cut_count)} > ${toNum(maxAbbrev)}`);
    }
    if (toNum(delta.llm_calls_used) > toNum(maxLlm)) {
      local.push(`llm_calls_used_delta ${toNum(delta.llm_calls_used)} > ${toNum(maxLlm)}`);
    }
    if (!allowHardFail && previous.hard_fail === false && current.hard_fail === true) {
      local.push("hard_fail regressed false->true");
    }
    if (row.status !== "pass") {
      local.push("benchmark status != pass");
    }
    if (local.length) {
      caseViolations.push({ key, violations: local });
    }
  }

  return { violations, caseViolations };
}

function runCompare(args) {
  const child = spawnSync(
    process.execPath,
    ["scripts/doctor_split_benchmark.mjs", "compare", "--baseline", args.baseline, "--golden", args.golden],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  if (child.error) throw child.error;
  if (!child.stdout) {
    throw new Error(`COMPARE_EMPTY_OUTPUT (exit=${child.status}) ${child.stderr || ""}`.trim());
  }
  const json = parseJsonFromStdout(child.stdout);
  return { json, status: Number(child.status || 0), stderr: String(child.stderr || "") };
}

function main() {
  const args = parseArgs();
  const thresholds = loadThresholds(args.thresholds);
  const compare = runCompare(args);
  const evaluated = evaluate(compare.json, thresholds);

  const output = {
    ok: evaluated.violations.length === 0 && evaluated.caseViolations.length === 0,
    generated_at: new Date().toISOString(),
    baseline_file: args.baseline,
    golden_file: args.golden,
    thresholds_file: args.thresholds,
    benchmark: {
      total_cases: toNum(compare.json.total_cases),
      passed_cases: toNum(compare.json.passed_cases),
      failed_cases: toNum(compare.json.failed_cases),
      pass_rate_pct: toNum(compare.json.pass_rate_pct),
    },
    global_violations: evaluated.violations,
    case_violations: evaluated.caseViolations,
  };

  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

try {
  main();
} catch (error) {
  console.error("[doctor-split-guardrail] FAIL", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
