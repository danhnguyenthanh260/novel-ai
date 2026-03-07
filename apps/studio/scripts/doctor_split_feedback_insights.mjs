import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const DB_DSN = process.env.DATABASE_URL || process.env.DB_DSN || "postgresql://novel:novelpass@localhost:5433/novel";
const DEFAULT_DAYS = 30;
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_OUT_DIR = "docs/operations/split-feedback-insights";

function parseArgs() {
  const args = process.argv.slice(2);
  let storySlug = "";
  let days = DEFAULT_DAYS;
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

function stamp() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonLike(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v;
}

function normalizeSpaces(v) {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim();
}

function hasAny(text, needles) {
  return needles.some((x) => text.includes(x));
}

function extractNoteTags(note, issueCode) {
  const tags = new Set();
  const t = normalizeSpaces(note).toLowerCase();

  if (issueCode === "MID_WORD_CUT") tags.add("CUT_MID_WORD");
  if (issueCode === "BOUNDARY_QUALITY") tags.add("BOUNDARY_BAD");
  if (issueCode === "SCENE_MERGE_NEEDED") tags.add("MERGE_NEEDED");
  if (issueCode === "SCENE_SPLIT_TOO_WIDE") tags.add("SPLIT_TOO_WIDE");
  if (issueCode === "SCENE_SPLIT_TOO_FRAGMENTED") tags.add("SPLIT_TOO_FRAGMENTED");
  if (issueCode === "TITLE_SUMMARY_MISMATCH") tags.add("SUMMARY_DRIFT");

  if (hasAny(t, ["mid-word", "mid word", "cắt giữa từ", "giua tu"])) tags.add("CUT_MID_WORD");
  if (hasAny(t, ["boundary", "cắt", "cat", "điểm cắt", "diem cat", "split sai"])) tags.add("BOUNDARY_BAD");
  if (hasAny(t, ["merge", "gộp", "gop", "dính", "dinh"])) tags.add("MERGE_NEEDED");
  if (hasAny(t, ["quá rộng", "qua rong", "too wide", "ôm quá", "om qua", "time jump", "context jump"])) tags.add("SPLIT_TOO_WIDE");
  if (hasAny(t, ["fragment", "vụn", "vun", "too fragmented", "quá nhỏ", "qua nho"])) tags.add("SPLIT_TOO_FRAGMENTED");
  if (hasAny(t, ["summary", "title", "hallucination", "ảo", "ao", "mismatch", "không khớp", "khong khop"])) tags.add("SUMMARY_DRIFT");
  if (hasAny(t, ["quote", "dialogue", "hội thoại", "hoi thoai", "dấu \"", "dau \""])) tags.add("QUOTE_DIALOGUE");
  if (hasAny(t, ["pov", "point of view", "ngôi kể", "ngoi ke", "xưng", "xung"])) tags.add("POV_DRIFT");
  if (hasAny(t, ["nhân vật", "nhan vat", "name", "tên", "ten", "character"])) tags.add("ENTITY_NAME_DRIFT");

  if (tags.size === 0) tags.add("OTHER_UNMAPPED");
  return [...tags];
}

function collectHintKeys(resultJson) {
  const obj = parseJsonLike(resultJson);
  const hints = parseJsonLike(obj.issue_hints);
  return Object.keys(hints).map((x) => x.toLowerCase());
}

function expectedHintTokens(tag) {
  switch (tag) {
    case "CUT_MID_WORD":
      return ["mid_word", "fragmentation", "repair"];
    case "BOUNDARY_BAD":
      return ["boundary", "context", "pov", "time", "quote"];
    case "MERGE_NEEDED":
      return ["merge", "context", "semantic"];
    case "SPLIT_TOO_WIDE":
      return ["context", "time", "semantic", "wide"];
    case "SPLIT_TOO_FRAGMENTED":
      return ["fragment", "mid_word", "merge"];
    case "SUMMARY_DRIFT":
      return ["summary", "title", "semantic"];
    case "QUOTE_DIALOGUE":
      return ["quote", "dialogue"];
    case "POV_DRIFT":
      return ["pov", "voice"];
    case "ENTITY_NAME_DRIFT":
      return ["name", "entity", "canon"];
    default:
      return [];
  }
}

function tagMatchesHints(tag, hintKeys) {
  const needles = expectedHintTokens(tag);
  if (!needles.length) return false;
  return hintKeys.some((key) => needles.some((n) => key.includes(n)));
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

async function loadFeedbackRows(db, storyId, days) {
  const res = await db.query(
    `
    SELECT
      f.id,
      f.story_id,
      f.job_id,
      f.chapter_task_id,
      f.chapter_id,
      f.strategy AS feedback_strategy,
      f.rating,
      f.issue_code,
      f.note,
      f.feedback_quality_score,
      f.boundary_scene_idx_left,
      f.boundary_scene_idx_right,
      f.boundary_char_offset,
      f.created_at,
      t.result_json,
      t.payload_json,
      COALESCE(NULLIF(t.human_outcome, ''), NULLIF(t.result_json->>'human_outcome', '')) AS human_outcome,
      sm.label AS supervisor_label
    FROM public.split_feedback f
    LEFT JOIN public.ingest_task t
      ON t.id = f.chapter_task_id
     AND t.story_id = f.story_id
     AND t.task_type = 'CHAPTER_SPLIT_LLM'
    LEFT JOIN public.supervisor_memory sm
      ON sm.story_id = f.story_id
     AND sm.chapter_task_id = f.chapter_task_id
    WHERE f.story_id = $1
      AND f.created_at >= now() - ($2::text || ' days')::interval
    ORDER BY f.created_at DESC, f.id DESC
    `,
    [storyId, String(days)]
  );
  return res.rows;
}

async function loadChapterTransitions(db, storyId, days) {
  const res = await db.query(
    `
    SELECT chapter_id, label, created_at
    FROM public.supervisor_memory
    WHERE story_id = $1
      AND created_at >= now() - ($2::text || ' days')::interval
    ORDER BY chapter_id ASC, created_at ASC, id ASC
    `,
    [storyId, String(days)]
  );
  return res.rows;
}

async function loadSplitRuns(db, storyId, days) {
  const res = await db.query(
    `
    SELECT
      t.id AS chapter_task_id,
      t.job_id,
      COALESCE(NULLIF(t.result_json->>'chapter_id',''), NULLIF(t.payload_json->>'chapter_id','')) AS chapter_id,
      t.updated_at,
      COALESCE(NULLIF(t.human_outcome, ''), NULLIF(t.result_json->>'human_outcome', '')) AS human_outcome,
      CASE
        WHEN j.status = 'REJECTED' THEN 'FAILED_HUMAN_REJECTED'
        WHEN EXISTS (
          SELECT 1
          FROM public.ingest_task s
          WHERE s.job_id = t.job_id
            AND s.story_id = t.story_id
            AND s.task_type = 'SCENE_CREATE'
            AND COALESCE(s.payload_json->>'chapter_task_id', '') = t.id::text
        ) THEN 'APPROVED_HUMAN'
        ELSE NULL
      END AS inferred_human_outcome,
      COALESCE(NULLIF(t.result_json->>'strategy_selected',''), 'LEGACY_BASE') AS strategy_selected,
      COALESCE(NULLIF(t.result_json->>'supervisor_decision',''), 'auto_pass') AS supervisor_decision,
      COALESCE((t.result_json->>'safe_to_approve')::boolean, false) AS safe_to_approve,
      COALESCE((t.result_json->>'supervisor_retry_used')::boolean, false) AS supervisor_retry_used,
      COALESCE((t.result_json->'quality_report'->>'flagged_pct')::numeric, 0) AS flagged_pct,
      COALESCE((t.result_json->'quality_report'->>'fragmentation_score')::numeric, 0) AS fragmentation_score,
      COALESCE(t.result_json->'issue_hints', '{}'::jsonb) AS issue_hints_json,
      (
        COALESCE(NULLIF(t.result_json->>'source_type',''), NULLIF(t.payload_json->>'source_type','')) = 'reprocess_scene_only'
        OR (t.payload_json ? 'reprocess_reason_code')
      ) AS is_reprocess,
      t.result_json
    FROM public.ingest_task t
    JOIN public.ingest_job j
      ON j.id = t.job_id
     AND j.story_id = t.story_id
    WHERE t.story_id = $1
      AND t.task_type = 'CHAPTER_SPLIT_LLM'
      AND t.status = 'DONE'
      AND t.updated_at >= now() - ($2::text || ' days')::interval
    ORDER BY chapter_id ASC, t.updated_at ASC, t.id ASC
    `,
    [storyId, String(days)]
  );
  return res.rows;
}

function aggregate(rows) {
  const byTag = new Map();
  const byIssueCode = new Map();
  const mismatchSamples = [];
  let alignedTags = 0;
  let totalTags = 0;

  for (const row of rows) {
    const issueCode = row.issue_code || "OTHER";
    const resultJson = parseJsonLike(row.result_json);
    const tags = extractNoteTags(row.note, issueCode);
    const hintKeys = collectHintKeys(resultJson);
    const flaggedPct = toNum(resultJson?.quality_report?.flagged_pct);
    const fragmentation = toNum(resultJson?.quality_report?.fragmentation_score);
    const strategy = resultJson?.strategy_selected || row.feedback_strategy || "-";
    const safeToApprove = String(resultJson?.safe_to_approve || "").toLowerCase() === "true";

    for (const tag of tags) {
      totalTags += 1;
      const matched = tagMatchesHints(tag, hintKeys);
      if (matched) alignedTags += 1;

      if (!byTag.has(tag)) byTag.set(tag, { count: 0, sumFlagged: 0, sumFrag: 0, hintMatched: 0, topStrategies: new Map() });
      const r = byTag.get(tag);
      r.count += 1;
      r.sumFlagged += flaggedPct;
      r.sumFrag += fragmentation;
      if (matched) r.hintMatched += 1;
      r.topStrategies.set(strategy, (r.topStrategies.get(strategy) || 0) + 1);

      if (!matched && mismatchSamples.length < 25) {
        mismatchSamples.push({
          feedback_id: Number(row.id),
          chapter_id: row.chapter_id,
          chapter_task_id: Number(row.chapter_task_id || 0),
          issue_code: issueCode,
          tag,
          strategy,
          safe_to_approve: safeToApprove,
          supervisor_label: row.supervisor_label || null,
          note: normalizeSpaces(row.note).slice(0, 220),
        });
      }
    }

    if (!byIssueCode.has(issueCode)) byIssueCode.set(issueCode, { count: 0, avgQualityScore: 0, sumQualityScore: 0 });
    const c = byIssueCode.get(issueCode);
    c.count += 1;
    c.sumQualityScore += toNum(row.feedback_quality_score);
    c.avgQualityScore = c.sumQualityScore / Math.max(c.count, 1);
  }

  const tagRows = [...byTag.entries()]
    .map(([tag, v]) => {
      const topStrategy = [...v.topStrategies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
      return {
        tag,
        count: v.count,
        avg_flagged_pct: Math.round((v.sumFlagged / Math.max(v.count, 1)) * 100) / 100,
        avg_fragmentation: Math.round((v.sumFrag / Math.max(v.count, 1)) * 100) / 100,
        hint_align_rate: Math.round((v.hintMatched * 10000) / Math.max(v.count, 1)) / 100,
        top_strategy: topStrategy,
      };
    })
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const issueCodeRows = [...byIssueCode.entries()]
    .map(([issueCode, v]) => ({
      issue_code: issueCode,
      count: v.count,
      avg_feedback_quality_score: Math.round((v.avgQualityScore || 0) * 1000) / 1000,
    }))
    .sort((a, b) => b.count - a.count || a.issue_code.localeCompare(b.issue_code));

  return {
    tagRows,
    issueCodeRows,
    mismatchSamples,
    hint_alignment_rate: Math.round((alignedTags * 10000) / Math.max(totalTags, 1)) / 100,
  };
}

function buildFeedbackByTask(rows) {
  const byTask = new Map();
  for (const row of rows) {
    const taskId = Number(row.chapter_task_id || 0);
    if (!taskId) continue;
    if (!byTask.has(taskId)) byTask.set(taskId, { tags: new Set(), issueCodes: new Set(), notes: [] });
    const item = byTask.get(taskId);
    const issueCode = row.issue_code || "OTHER";
    item.issueCodes.add(issueCode);
    for (const tag of extractNoteTags(row.note, issueCode)) item.tags.add(tag);
    const note = normalizeSpaces(row.note);
    if (note && item.notes.length < 2) item.notes.push(note.slice(0, 160));
  }
  return byTask;
}

function classifyRunLabel(run) {
  const humanOutcome = run.human_outcome || run.inferred_human_outcome || "";
  if (humanOutcome === "APPROVED_HUMAN") return run.is_reprocess ? "SUCCESS_AFTER_REPROCESS" : "SUCCESS_NO_REPROCESS";
  if (humanOutcome === "FAILED_HUMAN_REJECTED") return "FAILED_PATTERN";
  if (String(run.supervisor_decision) === "manual_review") return "FAILED_PATTERN";
  const hardFail = String(parseJsonLike(run.result_json)?.quality_report?.hard_fail || "").toLowerCase() === "true";
  if (hardFail) return "FAILED_PATTERN";
  return "OTHER";
}

function compareFailToSuccess(runs, feedbackByTask) {
  const byChapter = new Map();
  for (const run of runs) {
    const chapterId = run.chapter_id || "";
    if (!chapterId) continue;
    if (!byChapter.has(chapterId)) byChapter.set(chapterId, []);
    byChapter.get(chapterId).push(run);
  }

  const pairs = [];
  const byStrategyTransition = new Map();
  const byCauseTag = new Map();
  let sumFlaggedDelta = 0;
  let sumFragDelta = 0;

  for (const [chapterId, chapterRuns] of byChapter.entries()) {
    for (let i = 0; i < chapterRuns.length; i += 1) {
      const failed = chapterRuns[i];
      if (classifyRunLabel(failed) !== "FAILED_PATTERN") continue;
      const success = chapterRuns.slice(i + 1).find((x) => {
        const label = classifyRunLabel(x);
        return label === "SUCCESS_AFTER_REPROCESS" || label === "SUCCESS_NO_REPROCESS";
      });
      if (!success) continue;

      const failedTaskId = Number(failed.chapter_task_id || 0);
      const fFeedback = feedbackByTask.get(failedTaskId);
      const causeTags = fFeedback ? [...fFeedback.tags] : [];
      const issueCodes = fFeedback ? [...fFeedback.issueCodes] : [];
      const strategyTransition = `${failed.strategy_selected || "-"} -> ${success.strategy_selected || "-"}`;
      byStrategyTransition.set(strategyTransition, (byStrategyTransition.get(strategyTransition) || 0) + 1);
      for (const tag of causeTags) byCauseTag.set(tag, (byCauseTag.get(tag) || 0) + 1);

      const flaggedDelta = toNum(failed.flagged_pct) - toNum(success.flagged_pct);
      const fragDelta = toNum(failed.fragmentation_score) - toNum(success.fragmentation_score);
      sumFlaggedDelta += flaggedDelta;
      sumFragDelta += fragDelta;

      pairs.push({
        chapter_id: chapterId,
        failed_task_id: failedTaskId,
        success_task_id: Number(success.chapter_task_id || 0),
        failed_strategy: failed.strategy_selected || "-",
        success_strategy: success.strategy_selected || "-",
        failed_retry_used: Boolean(failed.supervisor_retry_used),
        success_retry_used: Boolean(success.supervisor_retry_used),
        flagged_pct_failed: toNum(failed.flagged_pct),
        flagged_pct_success: toNum(success.flagged_pct),
        flagged_pct_delta: Math.round(flaggedDelta * 100) / 100,
        fragmentation_failed: toNum(failed.fragmentation_score),
        fragmentation_success: toNum(success.fragmentation_score),
        fragmentation_delta: Math.round(fragDelta * 100) / 100,
        cause_tags: causeTags,
        issue_codes: issueCodes,
        sample_note: fFeedback?.notes?.[0] || null,
      });
    }
  }

  const topStrategyTransitions = [...byStrategyTransition.entries()]
    .map(([k, v]) => ({ strategy_transition: k, win_count: v }))
    .sort((a, b) => b.win_count - a.win_count || a.strategy_transition.localeCompare(b.strategy_transition))
    .slice(0, 12);

  const topCauseTags = [...byCauseTag.entries()]
    .map(([k, v]) => ({ tag: k, win_count: v }))
    .sort((a, b) => b.win_count - a.win_count || a.tag.localeCompare(b.tag))
    .slice(0, 12);

  return {
    pair_count: pairs.length,
    avg_flagged_pct_delta: pairs.length ? Math.round((sumFlaggedDelta * 100) / pairs.length) / 100 : 0,
    avg_fragmentation_delta: pairs.length ? Math.round((sumFragDelta * 100) / pairs.length) / 100 : 0,
    top_strategy_transitions: topStrategyTransitions,
    top_cause_tags: topCauseTags,
    pairs: pairs.slice(0, 50),
  };
}

function summarizeTransitions(rows) {
  const byChapter = new Map();
  for (const row of rows) {
    if (!row.chapter_id) continue;
    if (!byChapter.has(row.chapter_id)) byChapter.set(row.chapter_id, []);
    byChapter.get(row.chapter_id).push(row.label);
  }

  let chaptersWithFail = 0;
  let failToSuccess = 0;
  for (const labels of byChapter.values()) {
    const firstFail = labels.indexOf("FAILED_PATTERN");
    if (firstFail < 0) continue;
    chaptersWithFail += 1;
    const later = labels.slice(firstFail + 1);
    if (later.includes("SUCCESS_AFTER_REPROCESS") || later.includes("SUCCESS_NO_REPROCESS")) failToSuccess += 1;
  }
  return {
    chapters_with_failed_pattern: chaptersWithFail,
    chapters_fail_to_success: failToSuccess,
    fail_to_success_rate: chaptersWithFail > 0 ? Math.round((failToSuccess * 10000) / chaptersWithFail) / 100 : 0,
  };
}

function renderMarkdown(input) {
  const lines = [];
  lines.push(`# Split Feedback Insights (${input.storySlug})`);
  lines.push("");
  lines.push(`- Story ID: ${input.storyId}`);
  lines.push(`- Window: last ${input.days} days`);
  lines.push(`- Feedback rows: ${input.feedbackRows}`);
  lines.push(`- Hint alignment rate (note tags vs issue_hints): ${input.hintAlignmentRate.toFixed(2)}%`);
  lines.push(`- Chapters fail->success: ${input.transition.chapters_fail_to_success}/${input.transition.chapters_with_failed_pattern} (${input.transition.fail_to_success_rate.toFixed(2)}%)`);
  lines.push("");

  lines.push("## Issue Code Distribution");
  lines.push("");
  lines.push("| Issue Code | Count | Avg Feedback Quality |");
  lines.push("|---|---:|---:|");
  for (const row of input.issueCodeRows) {
    lines.push(`| ${row.issue_code} | ${row.count} | ${row.avg_feedback_quality_score.toFixed(3)} |`);
  }
  if (!input.issueCodeRows.length) lines.push("| (none) | 0 | 0.000 |");
  lines.push("");

  lines.push("## Normalized Root Causes from Notes");
  lines.push("");
  lines.push("| Root Cause Tag | Count | Avg Flagged % | Avg Fragmentation | Hint Align % | Top Strategy |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const row of input.tagRows) {
    lines.push(
      `| ${row.tag} | ${row.count} | ${row.avg_flagged_pct.toFixed(2)} | ${row.avg_fragmentation.toFixed(
        2
      )} | ${row.hint_align_rate.toFixed(2)} | ${row.top_strategy} |`
    );
  }
  if (!input.tagRows.length) lines.push("| (none) | 0 | 0.00 | 0.00 | 0.00 | - |");
  lines.push("");

  lines.push("## Mismatch Samples (note reason not reflected in issue_hints)");
  lines.push("");
  lines.push("| Feedback ID | Chapter | Task | Issue | Tag | Strategy | SafeToApprove | Supervisor | Note |");
  lines.push("|---:|---|---:|---|---|---|---|---|---|");
  for (const row of input.mismatchSamples) {
    lines.push(
      `| ${row.feedback_id} | ${row.chapter_id || "-"} | ${row.chapter_task_id} | ${row.issue_code || "-"} | ${row.tag} | ${
        row.strategy
      } | ${row.safe_to_approve ? "true" : "false"} | ${row.supervisor_label || "-"} | ${row.note || "-"} |`
    );
  }
  if (!input.mismatchSamples.length) lines.push("| - | - | - | - | - | - | - | - | - |");
  lines.push("");

  lines.push("## Fail -> Success Compare Engine");
  lines.push("");
  lines.push(`- Pair count: ${input.compare.pair_count}`);
  lines.push(`- Avg flagged_pct improvement: ${input.compare.avg_flagged_pct_delta.toFixed(2)}`);
  lines.push(`- Avg fragmentation improvement: ${input.compare.avg_fragmentation_delta.toFixed(2)}`);
  lines.push("");

  lines.push("### Top Strategy Transitions");
  lines.push("");
  lines.push("| Strategy Transition | Win Count |");
  lines.push("|---|---:|");
  for (const row of input.compare.topStrategyTransitions) {
    lines.push(`| ${row.strategy_transition} | ${row.win_count} |`);
  }
  if (!input.compare.topStrategyTransitions.length) lines.push("| (none) | 0 |");
  lines.push("");

  lines.push("### Top Cause Tags in Win Pairs");
  lines.push("");
  lines.push("| Cause Tag | Win Count |");
  lines.push("|---|---:|");
  for (const row of input.compare.topCauseTags) {
    lines.push(`| ${row.tag} | ${row.win_count} |`);
  }
  if (!input.compare.topCauseTags.length) lines.push("| (none) | 0 |");
  lines.push("");

  lines.push("### Pair Samples");
  lines.push("");
  lines.push("| Chapter | Failed Task | Success Task | Failed Strategy | Success Strategy | Flagged Delta | Frag Delta | Cause Tags |");
  lines.push("|---|---:|---:|---|---|---:|---:|---|");
  for (const row of input.compare.pairs) {
    lines.push(
      `| ${row.chapter_id} | ${row.failed_task_id} | ${row.success_task_id} | ${row.failed_strategy} | ${row.success_strategy} | ${row.flagged_pct_delta.toFixed(
        2
      )} | ${row.fragmentation_delta.toFixed(2)} | ${(row.cause_tags || []).join(", ") || "-"} |`
    );
  }
  if (!input.compare.pairs.length) lines.push("| - | - | - | - | - | 0.00 | 0.00 | - |");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  const db = new Client({ connectionString: DB_DSN });
  await db.connect();
  try {
    const storyId = await resolveStoryId(db, args.storySlug);
    const feedbackRows = await loadFeedbackRows(db, storyId, args.days);
    const transitionRows = await loadChapterTransitions(db, storyId, Math.max(args.days, 60));
    const splitRuns = await loadSplitRuns(db, storyId, Math.max(args.days, 90));
    const agg = aggregate(feedbackRows);
    const feedbackByTask = buildFeedbackByTask(feedbackRows);
    const compare = compareFailToSuccess(splitRuns, feedbackByTask);
    const transition = summarizeTransitions(transitionRows);
    const generatedAt = new Date().toISOString();

    const json = {
      ok: true,
      story_slug: args.storySlug,
      story_id: storyId,
      days: args.days,
      feedback_rows: feedbackRows.length,
      hint_alignment_rate: agg.hint_alignment_rate,
      transition,
      issue_code_distribution: agg.issueCodeRows,
      normalized_root_causes: agg.tagRows,
      mismatch_samples: agg.mismatchSamples,
      compare_engine: compare,
      generated_at: generatedAt,
    };

    const md = renderMarkdown({
      storySlug: args.storySlug,
      storyId,
      days: args.days,
      feedbackRows: feedbackRows.length,
      hintAlignmentRate: agg.hint_alignment_rate,
      transition,
      issueCodeRows: agg.issueCodeRows,
      tagRows: agg.tagRows,
      mismatchSamples: agg.mismatchSamples,
      compare: {
        ...compare,
        topStrategyTransitions: compare.top_strategy_transitions,
        topCauseTags: compare.top_cause_tags,
      },
    });

    const outAbs = path.isAbsolute(args.outDir) ? args.outDir : path.resolve(REPO_ROOT, args.outDir);
    await fs.mkdir(outAbs, { recursive: true });
    const base = `${args.storySlug}-${stamp()}`;
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
          feedback_rows: feedbackRows.length,
          hint_alignment_rate: agg.hint_alignment_rate,
          compare_pair_count: compare.pair_count,
          report_markdown: mdPath,
          report_json: jsonPath,
          generated_at: generatedAt,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("[doctor-split-feedback-insights] FAIL", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
