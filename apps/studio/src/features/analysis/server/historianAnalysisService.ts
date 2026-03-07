import { pool } from "@/server/db/pool";
import { getIngestWorkerStatus, getLlamaServerStatus, getWorkerLaneStatus } from "@/features/ingest/server/workerControl";

type HistorianFactV3 = {
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
  evidence?: string;
  entity_type?: "PERSON" | "LOCATION" | "ORG" | "ITEM" | "OTHER";
  classification?: "STATIC" | "EPHEMERAL" | "META";
  is_unreliable?: boolean;
  is_relationship?: boolean;
  affinity_weight?: number;
  affinity_prev?: number | null;
  affinity_shift?: number;
  affinity_shift_history?: Array<{
    from: number;
    to: number;
    delta: number;
    event_signal?: number;
  }>;
};

type HistorianSnapshotV3 = {
  snapshot_version?: string;
  chapter_id?: string | null;
  fact_status?: string;
  emotional_target?: string | null;
  sensory_profile?: {
    dominant_colors?: string[];
    atmosphere_scents?: string[];
    temperature_delta?: number;
  };
  character_voices?: Array<{
    name: string;
    tone?: string;
    sentence_cadence?: "short" | "med" | "long";
    vocabulary_tier?: "low" | "mid" | "high";
  }>;
  world_rules?: Array<{ label: string; detail?: string }>;
  style_dna?: {
    dialogue_to_narration_ratio?: number;
    adjective_density?: number;
    metaphor_rhetoric_frequency?: number;
  };
  facts?: HistorianFactV3[];
  open_loops?: Array<{ id?: string; description?: string; urgency?: number }>;
  narrative_metrics?: {
    swas?: { mental_imagery?: number; engagement?: number };
    narrative_tension?: number;
    style_similarity?: number;
    narrative_score?: number;
    lore_debt?: boolean;
  };
  external_signals?: Record<string, unknown>;
};

type HistorianAnalysisData = Record<string, unknown> & {
  snapshot_v3?: HistorianSnapshotV3;
};

type HistorianSnapshotItem = {
  id: number;
  source: "SNAPSHOT" | "TASK_RESULT";
  task_id: number | null;
  task_status: string | null;
  chapter_id: string | null;
  fact_status: string;
  ready_for_writing: boolean;
  degraded_mode: boolean;
  narrative_score: number;
  emotional_target: string | null;
  created_at: string;
  elapsed_sec: number | null;
  active: boolean;
  analysis_data: HistorianAnalysisData | null;
  scope_type: "chapter" | "batch" | "arc" | "story";
  scope_key: string;
  status: "DRAFT" | "APPROVED" | "SUPERSEDED" | "CANCELED";
  prep_status?: "NONE" | "CREATED";
  rollup_task_status?: "NONE" | "READY" | "RUNNING" | "DONE" | "FAILED" | "FAILED_STALE";
  final_source?: "ROLLUP" | "NONE";
  blocking_reason?: "DB_UNAVAILABLE" | "LLM_UNAVAILABLE" | "WAITING_QUEUE" | "TASK_FAILED" | "READY";
  aggregate_status?: "NONE" | "CREATED";
  rollup_status?: "NONE" | "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  is_final_analysis_ready?: boolean;
  intermediate_only?: boolean;
  analysis_state_reason?: "WORKER_OFF" | "LANE_OFF" | "LLM_OFF" | "WAITING_QUEUE" | "TASK_FAILED" | "FAILED_STALE" | "READY";
  rollup_task_id?: number | null;
  rollup_input_payload?: Record<string, unknown> | null;
  final_memory_payload?: Record<string, unknown> | null;
  final_source_table?: "story_milestone" | "writing_scope_snapshot_v1" | "none";
  final_payload_schema_version?: string | null;
  task_result_compact?: Record<string, unknown> | null;
  rollup_last_updated_at?: string | null;
  rollup_timeout_sec?: number;
  stale_running?: boolean;
  is_intermediate_prep?: boolean;
  final_payload_available?: boolean;
  vetting_summary: {
    fact_status: string;
    duplicate_count: number;
    conflict_count: number;
    classification_stats: Record<string, number>;
    entity_type_stats: Record<string, number>;
    entity_type_conflict_count: number;
  };
};

type RollupStatus = "NONE" | "QUEUED" | "RUNNING" | "DONE" | "FAILED";
type RollupTaskStatus = "NONE" | "READY" | "RUNNING" | "DONE" | "FAILED" | "FAILED_STALE";
type AnalysisStateReason = "WORKER_OFF" | "LANE_OFF" | "LLM_OFF" | "WAITING_QUEUE" | "TASK_FAILED" | "FAILED_STALE" | "READY";
type BlockingReason = "DB_UNAVAILABLE" | "LLM_UNAVAILABLE" | "WAITING_QUEUE" | "TASK_FAILED" | "READY";
type ScopeRuntimeState = {
  prep_status: "NONE" | "CREATED";
  rollup_task_status: RollupTaskStatus;
  final_analysis_ready: boolean;
  final_source: "ROLLUP" | "NONE";
  blocking_reason: BlockingReason;
  aggregate_status: "NONE" | "CREATED";
  rollup_status: RollupStatus;
  is_final_analysis_ready: boolean;
  intermediate_only: boolean;
  analysis_state_reason: AnalysisStateReason;
  rollup_task_id: number | null;
  rollup_result_json: Record<string, unknown> | null;
  rollup_payload_json?: Record<string, unknown> | null;
  final_memory_payload?: Record<string, unknown> | null;
  final_source_table?: "story_milestone" | "writing_scope_snapshot_v1" | "none";
  final_payload_schema_version?: string | null;
  rollup_input_chapter_snapshots?: Array<{
    snapshot_id: number;
    chapter_id: string | null;
    snapshot_v3: Record<string, unknown>;
  }>;
  rollup_error?: string | null;
  stale_running?: boolean;
  rollup_last_updated_at?: string | null;
  rollup_timeout_sec?: number;
};

type ScopeType = "chapter" | "batch" | "arc" | "story";
type HistorianRunningTask = {
  id: number;
  task_type: "WRITING_ANALYSIS" | "MEMORY_ROLLUP";
  status: "READY" | "RUNNING";
  chapter_id: string | null;
  scope: string;
  started_at: string | null;
  updated_at: string | null;
  age_sec: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function coverageThresholdForScope(scopeType: "batch" | "arc" | "story"): number {
  const envKey =
    scopeType === "batch"
      ? "HISTORIAN_COVERAGE_THRESHOLD_BATCH"
      : scopeType === "arc"
        ? "HISTORIAN_COVERAGE_THRESHOLD_ARC"
        : "HISTORIAN_COVERAGE_THRESHOLD_STORY";
  const fallback = scopeType === "story" ? 0.9 : 1.0;
  const raw = Number(process.env[envKey] ?? fallback);
  return clamp01(raw);
}

function chapterNoFromId(chapterId: string | null | undefined): number | undefined {
  const text = String(chapterId || "").trim();
  if (!text) return undefined;
  const m = text.match(/(\d+)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function chapterSortKey(chapterId: string): number {
  const n = chapterNoFromId(chapterId);
  return Number.isFinite(Number(n)) ? Number(n) : Number.MAX_SAFE_INTEGER;
}

async function isLlamaHttpReady(): Promise<boolean> {
  const rawBase = String(process.env.LLM_API_BASE || "http://localhost:8080/v1").trim();
  const base = rawBase.replace(/\/v1\/?$/i, "");
  const healthUrl = `${base}/health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function isTruthyEnv(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? (fallback ? "1" : "0")).trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function deriveScopeFromPayload(
  payload: Record<string, unknown> | null | undefined,
  chapterId: string | null
): { scopeType: ScopeType; scopeKey: string } {
  const p = payload ?? {};
  const scopeRaw = String(p.scope || "").trim().toLowerCase();
  if (scopeRaw === "chapter_range") {
    const from = String(p.chapter_from || "").trim();
    const to = String(p.chapter_to || "").trim();
    const key = from && to ? `${from}-${to}` : (chapterId || "batch:unknown");
    return { scopeType: "batch", scopeKey: key };
  }
  if (scopeRaw === "arc") {
    const arcId = String(p.arc_id || "").trim();
    return { scopeType: "arc", scopeKey: arcId ? `arc:${arcId}` : "arc:unknown" };
  }
  if (scopeRaw === "story") {
    return { scopeType: "story", scopeKey: "story:all" };
  }
  return { scopeType: "chapter", scopeKey: chapterId || "chapter:unknown" };
}

function normalizeScopeForRollup(rawScope: string): ScopeType {
  const raw = String(rawScope || "").trim().toLowerCase();
  if (raw === "chapter_range") return "batch";
  if (raw === "arc" || raw === "story" || raw === "batch" || raw === "chapter") return raw;
  return "chapter";
}

function buildAnalysisStateReason(args: {
  rollupStatus: RollupStatus;
  workerRunning: boolean;
  laneRunning: boolean;
  llamaRunning: boolean;
  llamaReady: boolean;
}): AnalysisStateReason {
  if (args.rollupStatus === "DONE") return "READY";
  if (args.rollupStatus === "FAILED") return "TASK_FAILED";
  if (!args.workerRunning && !args.laneRunning) return "WORKER_OFF";
  if (args.workerRunning && !args.laneRunning) {
    // If worker is running but lane specifies specifically, wait, Worker Master includes lane=all
    // Actually, if lane is off but master is on, it's fine.
    // If we only need one of them to be on, we just check if (!workerRunning && !laneRunning).
  }
  // If we reach here, at least one of workerRunning or laneRunning is true.
  if (!args.llamaRunning || !args.llamaReady) return "LLM_OFF";
  return "WAITING_QUEUE";
}

function buildBlockingReason(args: {
  rollupTaskStatus: RollupTaskStatus;
  workerRunning: boolean;
  laneRunning: boolean;
  llamaRunning: boolean;
  llamaReady: boolean;
  rollupError?: string | null;
}): BlockingReason {
  if (args.rollupTaskStatus === "DONE") return "READY";
  if (args.rollupTaskStatus === "FAILED" || args.rollupTaskStatus === "FAILED_STALE") return "TASK_FAILED";
  const err = String(args.rollupError || "").toUpperCase();
  if (err.startsWith("FAILED_DB:")) return "DB_UNAVAILABLE";
  if (!args.llamaRunning || !args.llamaReady) return "LLM_UNAVAILABLE";
  if (!args.workerRunning && !args.laneRunning) return "DB_UNAVAILABLE";
  return "WAITING_QUEUE";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown, maxItems = 64): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function asObjectArray(value: unknown, maxItems = 64): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === "object" && !Array.isArray(x))
    .map((x) => x as Record<string, unknown>)
    .slice(0, maxItems);
}

function normalizeArcMemoryPayload(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = asRecord(raw);
  const arcWindowRaw = asRecord(payload.arc_window);
  const chapterFrom = String(arcWindowRaw.chapter_from || payload.chapter_from || "").trim();
  const chapterTo = String(arcWindowRaw.chapter_to || payload.chapter_to || "").trim();
  const chapterIds = asStringArray(arcWindowRaw.chapter_ids);
  const milestonesRaw = asObjectArray(payload.arc_milestones, 32);
  const subplotsOpen = Array.isArray(payload.subplots_open)
    ? asObjectArray(payload.subplots_open, 64)
    : asObjectArray(payload.subplots, 64).map((sp, idx) => ({
      id: String(sp.id || `subplot_${idx + 1}`).trim(),
      description: String(sp.description || "").trim(),
      chapter_id: sp.chapter_id ?? null,
      urgency: Number(sp.urgency || 0),
    }));
  const subplotsResolved = Array.isArray(payload.subplots_resolved)
    ? asObjectArray(payload.subplots_resolved, 64)
    : [];
  const constraints = asStringArray(payload.constraints_for_next_chapter || payload.constraints, 24);
  const qualityRaw = asRecord(payload.quality);
  const validationFlags = asStringArray(qualityRaw.validation_flags, 24);
  const score = Number(
    qualityRaw.score ??
    payload.quality_score ??
    asRecord(payload.pacing_state).avg_narrative_score ??
    0
  );
  const confidenceRaw = qualityRaw.confidence;
  const confidence = Number.isFinite(Number(confidenceRaw))
    ? Number(confidenceRaw)
    : Math.max(0.1, Math.min(0.98, Number.isFinite(score) ? score + 0.5 : 0.5));
  const out: Record<string, unknown> = {
    schema_version: String(payload.schema_version || "arc_memory_v5"),
    arc_window: {
      chapter_from: chapterFrom || null,
      chapter_to: chapterTo || null,
      chapter_ids: chapterIds,
    },
    arc_milestones: milestonesRaw,
    subplots_open: subplotsOpen,
    subplots_resolved: subplotsResolved,
    carry_forward_hooks: asStringArray(payload.carry_forward_hooks, 24),
    conflict_state: String(payload.conflict_state || "").trim() || "Unknown",
    constraints_for_next_chapter: constraints,
    source_snapshot_ids: (Array.isArray(payload.source_snapshot_ids) ? payload.source_snapshot_ids : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0),
    quality: {
      score: Number.isFinite(score) ? Number(score) : 0,
      confidence,
      validation_flags: validationFlags,
    },
  };
  if (!chapterFrom || !chapterTo) return null;
  return out;
}

function normalizeSagaMemoryPayload(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = asRecord(raw);
  const schemaVersion = String(payload.schema_version || "saga_memory_v5").trim();
  const out: Record<string, unknown> = {
    schema_version: schemaVersion || "saga_memory_v5",
    source_snapshot_ids: (Array.isArray(payload.source_snapshot_ids) ? payload.source_snapshot_ids : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.floor(n)),
    rebuild_reason: String(payload.rebuild_reason || "").trim() || null,
    global_milestones: Array.isArray(payload.global_milestones) ? payload.global_milestones : [],
    theme_threads: Array.isArray(payload.theme_threads) ? payload.theme_threads : [],
    canon_risks: asStringArray(payload.canon_risks, 24),
    next_chapter_guardrails: asStringArray(payload.next_chapter_guardrails, 24),
    unresolved_lore_debt: Array.isArray(payload.unresolved_lore_debt) ? payload.unresolved_lore_debt : [],
    lore_debt_summary: asRecord(payload.lore_debt_summary),
  };
  if (!Array.isArray(out.global_milestones) || !Array.isArray(out.next_chapter_guardrails)) return null;
  return out;
}

function memoryRollupStaleTimeoutSec(): number {
  const baseRaw = Number(process.env.LLM_TIMEOUT_WRITING_ANALYSIS ?? 300);
  const mulRaw = Number(process.env.MEMORY_ROLLUP_STALE_TIMEOUT_MULTIPLIER ?? 3);
  const base = Number.isFinite(baseRaw) && baseRaw > 0 ? baseRaw : 300;
  const mul = Number.isFinite(mulRaw) && mulRaw > 0 ? mulRaw : 3;
  return Math.max(120, Math.floor(base * mul));
}

function autoRecoverStaleRollupEnabled(): boolean {
  return isTruthyEnv("ANALYSIS_AUTO_RECOVER_STALE_ROLLUP", false);
}

const autoRecoverCooldownByScope = new Map<string, number>();

function autoRecoverCooldownSec(): number {
  const raw = Number(process.env.ANALYSIS_AUTO_RECOVER_COOLDOWN_SEC ?? 60);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
}

function shouldAutoRecoverScope(scopeRuntimeKey: string): boolean {
  const now = Date.now();
  const cooldownMs = autoRecoverCooldownSec() * 1000;
  const last = autoRecoverCooldownByScope.get(scopeRuntimeKey) ?? 0;
  if (now - last < cooldownMs) return false;
  autoRecoverCooldownByScope.set(scopeRuntimeKey, now);
  return true;
}

async function loadArcChapterIds(storyId: number, arcId: number): Promise<string[]> {
  const res = await pool.query<{ chapter_id: string }>(
    `SELECT chapter_id
       FROM public.story_chapter
      WHERE story_id = $1
        AND arc_id = $2
      ORDER BY
        NULLIF(regexp_replace(chapter_id, '[^0-9]', '', 'g'), '')::int NULLS LAST,
        chapter_id ASC`,
    [storyId, arcId]
  );
  return res.rows.map((r) => String(r.chapter_id || "").trim()).filter(Boolean);
}

async function createScopeAggregateSnapshot(
  storyId: number,
  args: {
    scopeType: "batch" | "arc" | "story";
    scopeKey: string;
    targetChapters: string[];
    createdBy: string;
  }
) {
  const chapters = [...new Set(args.targetChapters.map((x) => String(x || "").trim()).filter(Boolean))];
  const total = chapters.length;
  if (total === 0) throw new Error("EMPTY_SCOPE_TARGET");

  const approvedRes = await pool.query<{
    chapter_id: string;
    snapshot_id: number;
    fact_status: string;
    ready_for_writing: boolean;
    degraded_mode: boolean;
    narrative_score: string | number | null;
    emotional_target: string | null;
    snapshot_json: unknown;
  }>(
    `SELECT
       a.chapter_id,
       s.id AS snapshot_id,
       s.fact_status,
       s.ready_for_writing,
       s.degraded_mode,
       s.narrative_score::text AS narrative_score,
       s.emotional_target,
       s.snapshot_json
     FROM public.story_active_analysis_snapshot a
     JOIN public.writing_snapshot_v3 s ON s.id = a.snapshot_id
    WHERE a.story_id = $1
      AND a.chapter_id = ANY($2::text[])`,
    [storyId, chapters]
  );

  const approvedRows = approvedRes.rows.filter(
    (r) => r.ready_for_writing && r.fact_status === "CLEAN" && !r.degraded_mode
  );
  const approvedSet = new Set(approvedRows.map((r) => String(r.chapter_id)));
  const missing = chapters.filter((c) => !approvedSet.has(c));
  const approvedCount = approvedRows.length;
  const complete = missing.length === 0;
  const avgScore =
    approvedCount > 0
      ? approvedRows.reduce((sum, r) => sum + Number(r.narrative_score || 0), 0) / approvedCount
      : 0;

  const sourceSnapshotIds = approvedRows.map((r) => Number(r.snapshot_id)).filter((n) => Number.isFinite(n) && n > 0);
  const coverageRatio = total > 0 ? approvedCount / total : 0;
  const coverageThreshold = coverageThresholdForScope(args.scopeType);
  const coveragePass = approvedCount > 0 && coverageRatio >= coverageThreshold;
  const factStatus = coveragePass ? "CLEAN" : "INCOMPLETE_COVERAGE";
  const readyForWriting = coveragePass;
  const emotionalTargets = approvedRows
    .map((r) => String(r.emotional_target || "").trim())
    .filter(Boolean);
  const emotionalTarget = emotionalTargets.length > 0 ? emotionalTargets[0] : null;

  const snapshotJson = {
    scope_type: args.scopeType,
    scope_key: args.scopeKey,
    source_snapshot_ids: sourceSnapshotIds,
    coverage: {
      total,
      approved: approvedCount,
      missing,
    },
    aggregate_metrics: {
      narrative_score_avg: Number(avgScore.toFixed(4)),
      coverage_ratio: Number(coverageRatio.toFixed(4)),
      coverage_threshold: Number(coverageThreshold.toFixed(4)),
    },
  };

  const insertRes = await pool.query<{ id: number }>(
    `INSERT INTO public.writing_scope_snapshot_v1
       (story_id, scope_type, scope_key, source_snapshot_ids, coverage_json, fact_status, ready_for_writing, degraded_mode, narrative_score, emotional_target, snapshot_json, created_by, approval_status)
     VALUES
       ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, false, $8, $9, $10::jsonb, $11, 'DRAFT')
     RETURNING id`,
    [
      storyId,
      args.scopeType,
      args.scopeKey,
      JSON.stringify(sourceSnapshotIds),
      JSON.stringify({ total, approved: approvedCount, missing }),
      factStatus,
      readyForWriting,
      Number(avgScore.toFixed(4)),
      emotionalTarget,
      JSON.stringify(snapshotJson),
      args.createdBy,
    ]
  );
  return {
    snapshotId: Number(insertRes.rows[0].id),
    factStatus,
    readyForWriting,
    coverageThreshold,
    coverageRatio: Number(coverageRatio.toFixed(4)),
    coverage: { total, approved: approvedCount, missing },
    sourceSnapshotIds,
  };
}

async function enqueueMemoryRollup(
  storyId: number,
  args: {
    scopeType: "batch" | "arc" | "story";
    scopeKey: string;
    chapterIds: string[];
    sourceSnapshotIds: number[];
    createdBy: string;
    retconRebuild?: boolean;
  }
): Promise<{ jobId: number; taskId: number } | null> {
  const chapterIds = [...new Set(args.chapterIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (chapterIds.length === 0) return null;
  const ordered = [...chapterIds].sort((a, b) => chapterSortKey(a) - chapterSortKey(b) || a.localeCompare(b));
  const chapterFrom = ordered[0];
  const chapterTo = ordered[ordered.length - 1];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobRes = await client.query<{ id: number }>(
      `INSERT INTO public.ingest_job
         (story_id, created_by, status, mode, config_json, total_tasks, completed_tasks)
       VALUES
         ($1, $2, 'RUNNING', 'AUTO_LOCK', $3::jsonb, 1, 0)
       RETURNING id`,
      [
        storyId,
        "historian_analysis_console",
        JSON.stringify({
          pipeline_type: "MEMORY_ROLLUP",
          scope_type: args.scopeType,
          scope_key: args.scopeKey,
          chapter_from: chapterFrom,
          chapter_to: chapterTo,
          chapter_ids: ordered,
        }),
      ]
    );
    const jobId = Number(jobRes.rows[0].id);
    const taskRes = await client.query<{ id: number }>(
      `INSERT INTO public.ingest_task
         (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
       VALUES
         ($1, $2, 'MEMORY_ROLLUP', 'memory_rollup', 'READY', $3::jsonb, 1)
       RETURNING id`,
      [
        jobId,
        storyId,
        JSON.stringify({
          scope_type: args.scopeType,
          scope_key: args.scopeKey,
          chapter_from: chapterFrom,
          chapter_to: chapterTo,
          chapter_ids: ordered,
          source_snapshot_ids: args.sourceSnapshotIds,
          approval_lane: "APPROVED_ONLY",
          created_by: args.createdBy,
          retcon_rebuild: Boolean(args.retconRebuild),
          rollup_mode: args.retconRebuild ? "rebuild" : "incremental",
        }),
      ]
    );
    await client.query("COMMIT");
    return { jobId, taskId: Number(taskRes.rows[0].id) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function enqueueRetconRebuildFromChapter(
  storyId: number,
  chapterId: string
): Promise<{ jobId: number; taskId: number } | null> {
  const all = await loadStoryChapterIds(storyId);
  const targetNo = chapterNoFromId(chapterId);
  if (!targetNo) return null;
  const affected = all.filter((x) => {
    const n = chapterNoFromId(x);
    return Boolean(n && n >= targetNo);
  });
  if (affected.length === 0) return null;
  return enqueueMemoryRollup(storyId, {
    scopeType: "batch",
    scopeKey: `retcon:${chapterId}->latest`,
    chapterIds: affected,
    sourceSnapshotIds: [],
    createdBy: "retcon_rebuild",
    retconRebuild: true,
  });
}

function extractVettingSummary(analysisData: Record<string, unknown> | null, fallbackFactStatus: string): HistorianSnapshotItem["vetting_summary"] {
  const data = analysisData ?? {};
  const vetting = (data.vetting_report && typeof data.vetting_report === "object")
    ? (data.vetting_report as Record<string, unknown>)
    : {};
  const factStatus = String(vetting.fact_status || fallbackFactStatus || "UNVETTED").toUpperCase();
  const duplicateCount = Number(vetting.duplicate_count ?? 0);
  const conflictCount = Number(vetting.conflict_count ?? 0);
  const rawStats = (vetting.classification_stats && typeof vetting.classification_stats === "object")
    ? (vetting.classification_stats as Record<string, unknown>)
    : {};
  const rawEntityStats = (vetting.entity_type_stats && typeof vetting.entity_type_stats === "object")
    ? (vetting.entity_type_stats as Record<string, unknown>)
    : {};
  const entityTypeConflictCount = Number(vetting.entity_type_conflicts && Array.isArray(vetting.entity_type_conflicts) ? vetting.entity_type_conflicts.length : 0);
  const classificationStats: Record<string, number> = {};
  const entityTypeStats: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawStats)) {
    const n = Number(v);
    classificationStats[String(k)] = Number.isFinite(n) ? n : 0;
  }
  for (const [k, v] of Object.entries(rawEntityStats)) {
    const n = Number(v);
    entityTypeStats[String(k)] = Number.isFinite(n) ? n : 0;
  }
  return {
    fact_status: factStatus,
    duplicate_count: Number.isFinite(duplicateCount) ? duplicateCount : 0,
    conflict_count: Number.isFinite(conflictCount) ? conflictCount : 0,
    classification_stats: classificationStats,
    entity_type_stats: entityTypeStats,
    entity_type_conflict_count: Number.isFinite(entityTypeConflictCount) ? entityTypeConflictCount : 0,
  };
}

async function loadStoryChapterIds(storyId: number): Promise<string[]> {
  const res = await pool.query<{ chapter_id: string }>(
    `WITH chapter_ids AS (
       SELECT chapter_id::text AS chapter_id
       FROM public.narrative_scene
       WHERE story_id = $1
       UNION
       SELECT chapter_id::text AS chapter_id
       FROM public.narrative_chapter_staging
       WHERE story_id = $1
       UNION
       SELECT chapter_id::text AS chapter_id
       FROM public.writing_snapshot_v3
       WHERE story_id = $1
     )
     SELECT chapter_id
     FROM chapter_ids
     WHERE COALESCE(chapter_id, '') <> ''
     ORDER BY
       NULLIF(regexp_replace(chapter_id, '[^0-9]', '', 'g'), '')::int NULLS LAST,
       chapter_id ASC`,
    [storyId]
  );
  return res.rows.map((r) => String(r.chapter_id || "").trim()).filter(Boolean);
}

async function loadStoryArcs(storyId: number): Promise<Array<{ id: number; name: string; slug: string | null }>> {
  const res = await pool.query<{ id: number; name: string; slug: string | null }>(
    `SELECT id, name, slug
       FROM public.story_arc
      WHERE story_id = $1
      ORDER BY id ASC`,
    [storyId]
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name || "").trim() || `arc-${r.id}`,
    slug: r.slug ? String(r.slug) : null,
  }));
}

async function loadLatestSplitOperationalState(
  storyId: number,
  chapterId: string
): Promise<{
  operationalState: "READY_FOR_ANALYSIS" | "NEEDS_RETRY" | "UNKNOWN";
  reason: string | null;
  artifactStatus: string | null;
  coverageRatio: number;
  coveragePass: boolean;
}> {
  const res = await pool.query<{
    result_json: unknown;
  }>(
    `SELECT result_json
       FROM public.ingest_task
      WHERE story_id = $1
        AND task_type = 'CHAPTER_SPLIT_LLM'
        AND status = 'DONE'
        AND (
          COALESCE(result_json->>'chapter_id', '') = $2
          OR COALESCE(payload_json->>'chapter_id', '') = $2
        )
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [storyId, chapterId]
  );
  if ((res.rowCount ?? 0) <= 0) {
    return {
      operationalState: "UNKNOWN",
      reason: "MISSING_SPLIT_RESULT",
      artifactStatus: null,
      coverageRatio: 0,
      coveragePass: false,
    };
  }
  const resultJson = (res.rows[0]?.result_json && typeof res.rows[0]?.result_json === "object")
    ? (res.rows[0].result_json as Record<string, unknown>)
    : {};
  const operationalStateRaw = String(resultJson.operational_state || "").trim().toUpperCase();
  const artifact = (resultJson.analysis_chunk_artifact && typeof resultJson.analysis_chunk_artifact === "object")
    ? (resultJson.analysis_chunk_artifact as Record<string, unknown>)
    : {};
  const coverage = (artifact.coverage && typeof artifact.coverage === "object")
    ? (artifact.coverage as Record<string, unknown>)
    : {};
  const coverageRatio = Number(coverage.coverage_ratio ?? 0);
  const coveragePass = Boolean(coverage.passes_gate) && Number.isFinite(coverageRatio) && coverageRatio >= 0.99;
  const artifactStatus = String(artifact.status || "").trim().toUpperCase() || null;
  const resolvedState: "READY_FOR_ANALYSIS" | "NEEDS_RETRY" | "UNKNOWN" =
    operationalStateRaw === "READY_FOR_ANALYSIS"
      ? "READY_FOR_ANALYSIS"
      : operationalStateRaw === "NEEDS_RETRY"
        ? "NEEDS_RETRY"
        : artifactStatus === "READY_FOR_ANALYSIS" && coveragePass
          ? "READY_FOR_ANALYSIS"
          : "NEEDS_RETRY";
  return {
    operationalState: resolvedState,
    reason: String(resultJson.operational_state_reason || "").trim() || null,
    artifactStatus,
    coverageRatio: Number.isFinite(coverageRatio) ? coverageRatio : 0,
    coveragePass,
  };
}

export async function listHistorianSnapshots(
  storyId: number,
  chapterId?: string,
  scopeTypeFilter: "chapter" | "arc" | "story" | "batch" | "all" = "all"
) {
  const chapter = String(chapterId || "").trim();
  const activeMapRes = await pool.query<{ chapter_id: string; snapshot_id: number }>(
    `SELECT chapter_id, snapshot_id
         FROM public.story_active_analysis_snapshot
        WHERE story_id = $1
          AND ($2::text = '' OR chapter_id = $2)`,
    [storyId, chapter]
  );
  const activeSnapshotByChapter = new Map<string, number>();
  for (const row of activeMapRes.rows) {
    const ch = String(row.chapter_id || "").trim();
    const snap = Number(row.snapshot_id || 0);
    if (ch && Number.isFinite(snap) && snap > 0) activeSnapshotByChapter.set(ch, snap);
  }
  const activeSnapshotId = chapter ? (activeSnapshotByChapter.get(chapter) ?? null) : null;
  const activeScopeMap = new Map<string, number>();
  try {
    const activeScopeRes = await pool.query<{ scope_type: string; scope_key: string; snapshot_id: number }>(
      `SELECT scope_type, scope_key, snapshot_id
         FROM public.story_active_analysis_scope_snapshot
        WHERE story_id = $1`,
      [storyId]
    );
    for (const row of activeScopeRes.rows) {
      const scopeType = String(row.scope_type || "").trim().toLowerCase();
      const scopeKey = String(row.scope_key || "").trim();
      const snap = Number(row.snapshot_id || 0);
      if (!scopeType || !scopeKey || !Number.isFinite(snap) || snap <= 0) continue;
      activeScopeMap.set(`${scopeType}:${scopeKey}`, snap);
    }
  } catch {
    // scope tables may not exist yet before migration 064
  }

  const rowsRes = await pool.query<{
    id: number;
    task_id: number | null;
    chapter_id: string | null;
    fact_status: string;
    ready_for_writing: boolean;
    degraded_mode: boolean;
    narrative_score: string | number | null;
    emotional_target: string | null;
    approval_status: string | null;
    snapshot_json: unknown;
    created_at: string;
  }>(
    `SELECT id, task_id, chapter_id, fact_status, ready_for_writing, degraded_mode, narrative_score::text, emotional_target, approval_status, snapshot_json, created_at
       FROM public.writing_snapshot_v3
      WHERE story_id = $1
        AND ($2::text = '' OR chapter_id = $2::text)
      ORDER BY created_at DESC, id DESC
      LIMIT 120`,
    [storyId, chapter]
  );
  const snapshotTaskIds = rowsRes.rows
    .map((r) => (r.task_id == null ? null : Number(r.task_id)))
    .filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
  const snapshotTaskRes = snapshotTaskIds.length > 0
    ? await pool.query<{ id: number; result_json: unknown; payload_json: unknown; status: string; created_at: string; updated_at: string }>(
      `SELECT id, result_json, payload_json, status, created_at::text, updated_at::text
         FROM public.ingest_task
        WHERE id = ANY($1::bigint[])`,
      [snapshotTaskIds]
    )
    : { rows: [] as Array<{ id: number; result_json: unknown; payload_json: unknown; status: string; created_at: string; updated_at: string }> };
  const snapshotTaskPromptRes = snapshotTaskIds.length > 0
    ? await pool.query<{
      task_id: number | null;
      hydration_output_text: string | null;
      hydration_output_hash: string | null;
      llm_request_meta_json: unknown;
      hydration_render_steps_json: unknown;
      created_at: string;
    }>(
      `SELECT task_id,
              hydration_output_text,
              hydration_output_hash,
              llm_request_meta_json,
              hydration_render_steps_json,
              created_at::text
         FROM (
           SELECT
             task_id,
             hydration_output_text,
             hydration_output_hash,
             llm_request_meta_json,
             hydration_render_steps_json,
             created_at,
             id,
             ROW_NUMBER() OVER (
               PARTITION BY task_id
               ORDER BY
                 CASE UPPER(COALESCE(llm_request_meta_json->>'trace_phase',''))
                   WHEN 'POST_LLM' THEN 2
                   WHEN 'PRE_LLM' THEN 1
                   ELSE 0
                 END DESC,
                 created_at DESC,
                 id DESC
             ) AS rn
           FROM public.agent_prompt_hydration_trace
           WHERE task_id = ANY($1::bigint[])
             AND agent_name = 'WRITING_ANALYSIS'
         ) t
        WHERE rn = 1`,
      [snapshotTaskIds]
    )
    : {
      rows: [] as Array<{
        task_id: number | null;
        hydration_output_text: string | null;
        hydration_output_hash: string | null;
        llm_request_meta_json: unknown;
        hydration_render_steps_json: unknown;
        created_at: string;
      }>
    };

  const snapshotTaskPromptMap = new Map<number, {
    prompt_text: string | null;
    prompt_hash: string | null;
    llm_request_meta_json: Record<string, unknown>;
    trace_phase: string | null;
    trace_status: string | null;
    trace_source: string | null;
    prompt_unavailable_reason: string | null;
    trace_created_at: string;
  }>();
  for (const row of snapshotTaskPromptRes.rows) {
    const taskId = Number(row.task_id || 0);
    if (!Number.isFinite(taskId) || taskId <= 0) continue;
    const meta = row.llm_request_meta_json && typeof row.llm_request_meta_json === "object"
      ? (row.llm_request_meta_json as Record<string, unknown>)
      : {};
    const render = row.hydration_render_steps_json && typeof row.hydration_render_steps_json === "object"
      ? (row.hydration_render_steps_json as Record<string, unknown>)
      : {};
    const tracePhase = String(meta.trace_phase || render.trace_phase || "").trim().toUpperCase() || null;
    const traceStatus = String(meta.trace_status || render.trace_status || "").trim().toUpperCase() || null;
    const traceSource = String(meta.trace_source || render.trace_source || "").trim().toLowerCase() || null;
    const promptText = row.hydration_output_text ? String(row.hydration_output_text) : null;
    const promptUnavailableReason =
      promptText
        ? null
        : tracePhase === "PRE_LLM"
          ? "PROMPT_PENDING_PRE_LLM"
          : tracePhase === "POST_LLM"
            ? "PROMPT_EMPTY_POST_LLM"
            : "PROMPT_UNAVAILABLE";
    snapshotTaskPromptMap.set(taskId, {
      prompt_text: promptText,
      prompt_hash: row.hydration_output_hash ? String(row.hydration_output_hash) : null,
      llm_request_meta_json: meta,
      trace_phase: tracePhase,
      trace_status: traceStatus,
      trace_source: traceSource,
      prompt_unavailable_reason: promptUnavailableReason,
      trace_created_at: row.created_at,
    });
  }

  const snapshotTaskResultMap = new Map<number, { result: Record<string, unknown>; payload: Record<string, unknown>; status: string; created_at: string; updated_at: string }>();
  for (const row of snapshotTaskRes.rows) {
    const parsed = (row.result_json && typeof row.result_json === "object")
      ? (row.result_json as Record<string, unknown>)
      : {};
    const payload = (row.payload_json && typeof row.payload_json === "object")
      ? (row.payload_json as Record<string, unknown>)
      : {};
    snapshotTaskResultMap.set(Number(row.id), { result: parsed, payload, status: row.status, created_at: row.created_at, updated_at: row.updated_at });
  }
  const snapshotItems: HistorianSnapshotItem[] = rowsRes.rows.map((r) => {
    const taskMeta = r.task_id != null ? snapshotTaskResultMap.get(Number(r.task_id)) : undefined;
    const taskPrompt = r.task_id != null ? snapshotTaskPromptMap.get(Number(r.task_id)) : undefined;
    const analysisData =
      r.task_id != null
        ? (() => {
          const base = taskMeta?.result && typeof taskMeta.result === "object"
            ? ({ ...(taskMeta.result as Record<string, unknown>) })
            : ({} as Record<string, unknown>);
          if (taskPrompt) {
            base._prompt_hydration = {
              prompt_text: taskPrompt.prompt_text,
              prompt_hash: taskPrompt.prompt_hash,
              llm_request_meta_json: taskPrompt.llm_request_meta_json,
              trace_phase: taskPrompt.trace_phase,
              trace_status: taskPrompt.trace_status,
              trace_source: taskPrompt.trace_source,
              prompt_unavailable_reason: taskPrompt.prompt_unavailable_reason,
              trace_created_at: taskPrompt.trace_created_at,
            };
          }
          return base;
        })()
        : (
          r.snapshot_json && typeof r.snapshot_json === "object"
            ? ({ snapshot_v3: r.snapshot_json } as Record<string, unknown>)
            : null
        );
    const scope = r.chapter_id
      ? ({ scopeType: "chapter" as const, scopeKey: String(r.chapter_id) })
      : deriveScopeFromPayload(taskMeta?.payload, r.chapter_id);
    const active = r.chapter_id ? activeSnapshotByChapter.get(String(r.chapter_id)) === Number(r.id) : false;
    const approvalStatus = String(r.approval_status || "DRAFT").trim().toUpperCase();
    const elapsedSec =
      r.task_id != null && taskMeta?.created_at && taskMeta?.updated_at
        ? Math.max(0, Math.floor((new Date(taskMeta.updated_at).getTime() - new Date(taskMeta.created_at).getTime()) / 1000))
        : null;
    return {
      id: Number(r.id),
      source: "SNAPSHOT",
      task_id: r.task_id == null ? null : Number(r.task_id),
      task_status: r.task_id == null ? "DONE" : (taskMeta?.status || "DONE"),
      chapter_id: r.chapter_id,
      fact_status: r.fact_status,
      ready_for_writing: Boolean(r.ready_for_writing),
      degraded_mode: Boolean(r.degraded_mode),
      narrative_score: Number(r.narrative_score || 0),
      emotional_target: r.emotional_target,
      created_at: r.created_at,
      elapsed_sec: Number.isFinite(Number(elapsedSec)) ? Number(elapsedSec) : null,
      active,
      analysis_data: analysisData,
      scope_type: scope.scopeType,
      scope_key: scope.scopeKey,
      status: active ? "APPROVED" : (approvalStatus === "CANCELED" ? "CANCELED" : approvalStatus === "SUPERSEDED" ? "SUPERSEDED" : "DRAFT"),
      vetting_summary: extractVettingSummary(analysisData, r.fact_status),
    };
  });

  const scopeItems: HistorianSnapshotItem[] = [];
  try {
    const scopeRows = await pool.query<{
      id: number;
      scope_type: string;
      scope_key: string;
      fact_status: string;
      ready_for_writing: boolean;
      degraded_mode: boolean;
      narrative_score: string | number | null;
      emotional_target: string | null;
      approval_status: string | null;
      snapshot_json: unknown;
      created_at: string;
    }>(
      `SELECT id, scope_type, scope_key, fact_status, ready_for_writing, degraded_mode, narrative_score::text, emotional_target, approval_status, snapshot_json, created_at
         FROM public.writing_scope_snapshot_v1
        WHERE story_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 120`,
      [storyId]
    );
    for (const row of scopeRows.rows) {
      const scopeType = String(row.scope_type || "").trim().toLowerCase() as ScopeType;
      if (scopeType !== "batch" && scopeType !== "arc" && scopeType !== "story") continue;
      const scopeKey = String(row.scope_key || "").trim();
      const analysisData =
        row.snapshot_json && typeof row.snapshot_json === "object"
          ? ({ snapshot_v3: row.snapshot_json } as Record<string, unknown>)
          : null;
      const active = activeScopeMap.get(`${scopeType}:${scopeKey}`) === Number(row.id);
      const approvalStatus = String(row.approval_status || "DRAFT").trim().toUpperCase();
      scopeItems.push({
        id: Number(row.id),
        source: "SNAPSHOT",
        task_id: null,
        task_status: "DONE",
        chapter_id: null,
        fact_status: String(row.fact_status || "UNVETTED"),
        ready_for_writing: Boolean(row.ready_for_writing),
        degraded_mode: Boolean(row.degraded_mode),
        narrative_score: Number(row.narrative_score || 0),
        emotional_target: row.emotional_target,
        created_at: row.created_at,
        elapsed_sec: null,
        active,
        analysis_data: analysisData,
        scope_type: scopeType,
        scope_key: scopeKey,
        status: active ? "APPROVED" : (approvalStatus === "CANCELED" ? "CANCELED" : approvalStatus === "SUPERSEDED" ? "SUPERSEDED" : "DRAFT"),
        vetting_summary: extractVettingSummary(analysisData, String(row.fact_status || "UNVETTED")),
      });
    }
  } catch {
    // scope table may not exist yet
  }

  const allItems = [...snapshotItems, ...scopeItems]
    .map((item) => ({ ...item }))
    .sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      return tB - tA;
    })
    .slice(0, 120);

  const items = scopeTypeFilter === "all"
    ? allItems
    : allItems.filter((item) => item.scope_type === scopeTypeFilter);

  const runningTaskRes = await pool.query<{
    id: number;
    task_type: "WRITING_ANALYSIS" | "MEMORY_ROLLUP";
    status: "READY" | "RUNNING";
    chapter_id: string | null;
    scope: string | null;
    started_at: string | null;
    updated_at: string | null;
    age_sec: string | number | null;
  }>(
    `SELECT
       t.id,
       t.task_type,
       t.status,
       COALESCE(t.payload_json->>'chapter_id', t.payload_json->>'chapter_from') AS chapter_id,
       COALESCE(t.payload_json->>'scope', t.payload_json->>'scope_type', 'chapter') AS scope,
       t.created_at::text AS started_at,
       t.updated_at::text AS updated_at,
       EXTRACT(EPOCH FROM (now() - COALESCE(t.updated_at, t.created_at)))::int AS age_sec
     FROM public.ingest_task t
     JOIN public.ingest_job j ON j.id = t.job_id
     WHERE t.story_id = $1
       AND t.task_type IN ('WRITING_ANALYSIS', 'MEMORY_ROLLUP')
       AND t.status IN ('READY', 'RUNNING')
       AND j.status = 'RUNNING'
     ORDER BY t.status DESC, t.updated_at DESC, t.id DESC
     LIMIT 30`,
    [storyId]
  );
  const allRunningTasks: HistorianRunningTask[] = runningTaskRes.rows.map((r) => ({
    id: Number(r.id),
    task_type: r.task_type,
    status: r.status,
    chapter_id: r.chapter_id ? String(r.chapter_id) : null,
    scope: String(r.scope || "chapter"),
    started_at: r.started_at,
    updated_at: r.updated_at,
    age_sec: Number(r.age_sec || 0),
  }));
  const running_tasks = scopeTypeFilter === "all"
    ? allRunningTasks
    : allRunningTasks.filter((task) => {
      const raw = String(task.scope || "").trim().toLowerCase();
      const normalized =
        raw === "chapter_range" ? "batch"
          : (raw === "chapter" || raw === "arc" || raw === "story" || raw === "batch" ? raw : "chapter");
      return normalized === scopeTypeFilter;
    });
  let worker_status: { enabled: boolean; running: boolean; pid: number | null; detail?: string } | null = null;
  let analysis_lane_status: { lane: "analysis"; running: boolean; pid: number | null } | null = null;
  let llama_status: { running: boolean; pid: number | null; detail?: string; http_ready?: boolean } | null = null;
  try {
    worker_status = await getIngestWorkerStatus();
  } catch {
    worker_status = null;
  }
  try {
    const lane = await getWorkerLaneStatus("analysis");
    analysis_lane_status = { lane: "analysis", running: Boolean(lane.running), pid: lane.pid ?? null };
  } catch {
    analysis_lane_status = null;
  }
  try {
    const llama = await getLlamaServerStatus();
    llama_status = {
      running: Boolean(llama.running),
      pid: llama.pid ?? null,
      detail: llama.detail,
      http_ready: await isLlamaHttpReady(),
    };
  } catch {
    llama_status = null;
  }
  const workerRunning = Boolean(worker_status?.running);
  const laneRunning = Boolean(analysis_lane_status?.running);
  const llamaRunning = Boolean(llama_status?.running);
  const llamaReady = Boolean(llama_status?.http_ready);

  const rollupRes = await pool.query<{
    id: number;
    status: string;
    scope_type: string | null;
    scope_key: string | null;
    payload_json: unknown;
    result_json: unknown;
    error: string | null;
    updated_at: string;
  }>(
    `SELECT DISTINCT ON (COALESCE(payload_json->>'scope_type', ''), COALESCE(payload_json->>'scope_key', ''))
       id,
       status,
       payload_json->>'scope_type' AS scope_type,
       payload_json->>'scope_key' AS scope_key,
       payload_json,
       result_json,
       error,
       updated_at::text AS updated_at
     FROM public.ingest_task
     WHERE story_id = $1
       AND task_type = 'MEMORY_ROLLUP'
       AND COALESCE(payload_json->>'scope_type', '') IN ('batch', 'arc', 'story')
       AND COALESCE(payload_json->>'scope_key', '') <> ''
     ORDER BY COALESCE(payload_json->>'scope_type', ''), COALESCE(payload_json->>'scope_key', ''), updated_at DESC NULLS LAST, id DESC
     LIMIT 300`,
    [storyId]
  );
  const rollupByScope = new Map<string, {
    task_id: number;
    status: string;
    payload_json: Record<string, unknown> | null;
    result_json: Record<string, unknown> | null;
    error: string | null;
    updated_at: string | null;
  }>();
  for (const row of rollupRes.rows) {
    const scopeType = normalizeScopeForRollup(String(row.scope_type || ""));
    if (scopeType !== "batch" && scopeType !== "arc" && scopeType !== "story") continue;
    const scopeKey = String(row.scope_key || "").trim();
    if (!scopeKey) continue;
    const key = `${scopeType}:${scopeKey}`;
    const resultJson = row.result_json && typeof row.result_json === "object"
      ? (row.result_json as Record<string, unknown>)
      : null;
    const payloadJson = row.payload_json && typeof row.payload_json === "object"
      ? (row.payload_json as Record<string, unknown>)
      : null;
    rollupByScope.set(key, {
      task_id: Number(row.id || 0),
      status: String(row.status || "").trim().toUpperCase(),
      payload_json: payloadJson,
      result_json: resultJson,
      error: row.error ? String(row.error) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
    });
  }

  const scopeRuntimeStateByKey = new Map<string, ScopeRuntimeState>();
  const scopeKeys = new Set(
    allItems
      .filter((it) => it.scope_type !== "chapter")
      .map((it) => `${it.scope_type}:${it.scope_key}`)
  );
  for (const key of scopeKeys) {
    const hasAggregate = allItems.some((it) => `${it.scope_type}:${it.scope_key}` === key && it.source === "SNAPSHOT");
    const rollup = rollupByScope.get(key);
    let rollupStatus: RollupStatus = "NONE";
    let rollupTaskStatus: RollupTaskStatus = "NONE";
    let finalReady = false;
    const timeoutSec = memoryRollupStaleTimeoutSec();
    const rollupUpdatedAt = rollup?.updated_at || null;
    const ageSec = rollupUpdatedAt ? Math.max(0, Math.floor((Date.now() - new Date(rollupUpdatedAt).getTime()) / 1000)) : 0;
    const staleRunning = Boolean(rollup && rollup.status === "RUNNING" && ageSec > timeoutSec);
    if (staleRunning && autoRecoverStaleRollupEnabled() && shouldAutoRecoverScope(key)) {
      const firstColon = key.indexOf(":");
      const scopeType = firstColon > 0 ? key.slice(0, firstColon) : key;
      const scopeKey = firstColon > 0 ? key.slice(firstColon + 1) : "";
      if ((scopeType === "arc" || scopeType === "story" || scopeType === "batch") && scopeKey) {
        await recoverHistorianRollupTask(storyId, {
          scope_type: scopeType as "arc" | "story" | "batch",
          scope_key: scopeKey,
          mode: "requeue",
        }).catch(() => null);
        // show queued state right away after auto recover
        rollupStatus = "QUEUED";
        rollupTaskStatus = "READY";
      }
    }
    if (rollup) {
      if (staleRunning) {
        rollupStatus = "FAILED";
        rollupTaskStatus = "FAILED_STALE";
      } else if (rollup.status === "RUNNING") {
        rollupStatus = "RUNNING";
        rollupTaskStatus = "RUNNING";
      } else if (rollup.status === "READY") {
        rollupStatus = "QUEUED";
        rollupTaskStatus = "READY";
      } else if (rollup.status === "DONE") {
        // Task completion truth for business output is validated against memory tables later.
        rollupStatus = "DONE";
        rollupTaskStatus = "DONE";
        finalReady = false;
      } else {
        rollupStatus = "FAILED";
        rollupTaskStatus = "FAILED";
      }
    } else if (hasAggregate) {
      rollupStatus = "QUEUED";
      rollupTaskStatus = "READY";
    }
    const blockingReason = buildBlockingReason({
      rollupTaskStatus,
      workerRunning,
      laneRunning,
      llamaRunning,
      llamaReady,
      rollupError: rollup?.error,
    });
    const reason: AnalysisStateReason = staleRunning
      ? "FAILED_STALE"
      : buildAnalysisStateReason({
      rollupStatus,
      workerRunning,
      laneRunning,
      llamaRunning,
      llamaReady,
    });
    scopeRuntimeStateByKey.set(key, {
      prep_status: hasAggregate ? "CREATED" : "NONE",
      rollup_task_status: rollupTaskStatus,
      final_analysis_ready: finalReady,
      final_source: finalReady ? "ROLLUP" : "NONE",
      blocking_reason: blockingReason,
      aggregate_status: hasAggregate ? "CREATED" : "NONE",
      rollup_status: rollupStatus,
      is_final_analysis_ready: finalReady,
      intermediate_only: hasAggregate && !finalReady,
      analysis_state_reason: reason,
      rollup_task_id: rollup?.task_id ?? null,
      rollup_payload_json: rollup?.payload_json ?? null,
      rollup_result_json: rollup?.result_json ?? null,
      final_memory_payload: null,
      final_source_table: "none",
      final_payload_schema_version: null,
      rollup_input_chapter_snapshots: [],
      rollup_error: rollup?.error ?? null,
      stale_running: staleRunning,
      rollup_last_updated_at: rollupUpdatedAt,
      rollup_timeout_sec: timeoutSec,
    });
  }

  // Resolve business-truth final payload from memory tables (not ingest_task compact result).
  for (const [k, state] of scopeRuntimeStateByKey.entries()) {
    const firstColon = k.indexOf(":");
    const scopeType = (firstColon > 0 ? k.slice(0, firstColon) : k) as ScopeType;
    const scopeKey = firstColon > 0 ? k.slice(firstColon + 1) : "";
    if (!scopeKey) continue;

    if (scopeType === "story") {
      const storyRes = await pool.query<{ snapshot_json: unknown }>(
        `SELECT snapshot_json
           FROM public.writing_scope_snapshot_v1
          WHERE story_id = $1
            AND scope_type = 'story'
            AND scope_key = $2
            AND COALESCE(is_stale, false) = false
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [storyId, scopeKey]
      );
      if ((storyRes.rowCount ?? 0) > 0) {
        const normalized = normalizeSagaMemoryPayload(asRecord(storyRes.rows[0].snapshot_json));
        if (normalized) {
          state.final_memory_payload = normalized;
          state.final_source_table = "writing_scope_snapshot_v1";
          state.final_payload_schema_version = String(normalized.schema_version || "saga_memory_v5");
        }
      }
      continue;
    }

    // arc/batch resolve from milestone range with payload range hints.
    const payload = asRecord(state.rollup_payload_json);
    let chapterFrom = String(payload.chapter_from || "").trim();
    let chapterTo = String(payload.chapter_to || "").trim();
    if ((!chapterFrom || !chapterTo) && scopeType === "batch") {
      const m = scopeKey.match(/^([^>:\s]+)-([^>:\s]+)$/);
      if (m) {
        chapterFrom = chapterFrom || String(m[1]).trim();
        chapterTo = chapterTo || String(m[2]).trim();
      }
    }
    const arcId = scopeType === "arc"
      ? Number(String(scopeKey || "").replace(/^arc:/, ""))
      : 0;
    const milestoneRes = await pool.query<{ summary_json: unknown }>(
      `SELECT summary_json
         FROM public.story_milestone
        WHERE story_id = $1
          AND COALESCE(is_stale, false) = false
          AND (
            ($2::bigint > 0 AND arc_id = $2::bigint)
            OR ($3::text <> '' AND $4::text <> '' AND chapter_from = $3 AND chapter_to = $4)
            OR (summary_json->>'scope_type' = $5 AND summary_json->>'scope_key' = $6)
          )
        ORDER BY updated_at DESC, id DESC
        LIMIT 1`,
      [storyId, Number.isFinite(arcId) ? arcId : 0, chapterFrom, chapterTo, scopeType, scopeKey]
    );
    if ((milestoneRes.rowCount ?? 0) > 0) {
      const normalized = normalizeArcMemoryPayload(asRecord(milestoneRes.rows[0].summary_json));
      if (normalized) {
        state.final_memory_payload = normalized;
        state.final_source_table = "story_milestone";
        state.final_payload_schema_version = String(normalized.schema_version || "arc_memory_v5");
      }
    }
  }

  // Final-ready truth: rollup must be DONE and memory payload must be usable.
  for (const state of scopeRuntimeStateByKey.values()) {
    const rollupDone = state.rollup_task_status === "DONE";
    const hasFinalPayload = Boolean(state.final_memory_payload && Object.keys(state.final_memory_payload).length > 0);
    const payloadSrcIds = Array.isArray(state.rollup_payload_json?.source_snapshot_ids)
      ? (state.rollup_payload_json?.source_snapshot_ids as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.floor(n))
      : [];
    const finalSrcIds = Array.isArray(state.final_memory_payload?.source_snapshot_ids)
      ? ((state.final_memory_payload?.source_snapshot_ids as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.floor(n)))
      : [];
    const payloadSrcSorted = [...payloadSrcIds].sort((a, b) => a - b);
    const finalSrcSorted = [...finalSrcIds].sort((a, b) => a - b);
    const srcMatch = payloadSrcIds.length > 0
      ? (
        finalSrcIds.length === 0
          ? true
          : (
            payloadSrcSorted.length === finalSrcSorted.length &&
            payloadSrcSorted.every((v, idx) => v === finalSrcSorted[idx])
          )
      )
      : true;
    if (rollupDone && hasFinalPayload) {
      if (!srcMatch) {
        state.final_analysis_ready = false;
        state.is_final_analysis_ready = false;
        state.final_source = "NONE";
        state.rollup_status = "FAILED";
        state.rollup_task_status = "FAILED";
        state.analysis_state_reason = "TASK_FAILED";
        state.blocking_reason = "TASK_FAILED";
        state.rollup_error = state.rollup_error || "TASK_FAILED_PERSISTENCE_SOURCE_MISMATCH";
        continue;
      }
      state.final_analysis_ready = true;
      state.is_final_analysis_ready = true;
      state.final_source = "ROLLUP";
      state.blocking_reason = "READY";
      state.analysis_state_reason = "READY";
      continue;
    }
    state.final_analysis_ready = false;
    state.is_final_analysis_ready = false;
    state.final_source = "NONE";
    if (rollupDone && !hasFinalPayload) {
      state.rollup_status = "FAILED";
      state.rollup_task_status = "FAILED";
      state.analysis_state_reason = "TASK_FAILED";
      state.blocking_reason = "TASK_FAILED";
      state.rollup_error = state.rollup_error || "TASK_FAILED_PERSISTENCE";
    }
  }

  // Hydrate original chapter snapshot inputs for each rollup scope.
  const snapshotIdsToLoad = new Set<number>();
  const scopeSnapshotIds = new Map<string, number[]>();
  for (const [k, state] of scopeRuntimeStateByKey.entries()) {
    const srcIdsRaw = Array.isArray(state.rollup_payload_json?.source_snapshot_ids)
      ? (state.rollup_payload_json?.source_snapshot_ids as unknown[])
      : [];
    const ids: number[] = [];
    for (const x of srcIdsRaw) {
      const n = Number(x);
      if (Number.isFinite(n) && n > 0) {
        const id = Math.floor(n);
        ids.push(id);
        snapshotIdsToLoad.add(id);
      }
    }
    scopeSnapshotIds.set(k, ids);
  }
  const snapshotsById = new Map<number, { snapshot_id: number; chapter_id: string | null; snapshot_v3: Record<string, unknown> }>();
  if (snapshotIdsToLoad.size > 0) {
    const ids = Array.from(snapshotIdsToLoad.values());
    const snapRes = await pool.query<{
      id: number;
      chapter_id: string | null;
      snapshot_json: unknown;
    }>(
      `SELECT id, chapter_id, snapshot_json
         FROM public.writing_snapshot_v3
        WHERE story_id = $1
          AND id = ANY($2::bigint[])`,
      [storyId, ids]
    );
    for (const row of snapRes.rows) {
      const snap = row.snapshot_json && typeof row.snapshot_json === "object"
        ? (row.snapshot_json as Record<string, unknown>)
        : {};
      snapshotsById.set(Number(row.id), {
        snapshot_id: Number(row.id),
        chapter_id: row.chapter_id ? String(row.chapter_id) : null,
        snapshot_v3: snap,
      });
    }
  }
  for (const [k, state] of scopeRuntimeStateByKey.entries()) {
    const ids = scopeSnapshotIds.get(k) || [];
    state.rollup_input_chapter_snapshots = ids
      .map((id) => snapshotsById.get(id))
      .filter((x): x is { snapshot_id: number; chapter_id: string | null; snapshot_v3: Record<string, unknown> } => Boolean(x));
  }

  const itemsWithState = items.map((item) => {
    if (item.scope_type === "chapter") return item;
    const key = `${item.scope_type}:${item.scope_key}`;
    const state = scopeRuntimeStateByKey.get(key);
    if (!state) return item;
    let analysisData = item.analysis_data;
    if (state.final_memory_payload && item.source === "SNAPSHOT") {
      analysisData = {
        _view_mode: "ROLLUP_PREFERRED",
        final_memory_payload: state.final_memory_payload,
        task_result_compact: state.rollup_result_json || {},
        aggregate_snapshot: item.analysis_data || {},
      };
    } else if (item.source === "SNAPSHOT") {
      analysisData = {
        _view_mode: "INTERMEDIATE_PREP_ONLY",
        aggregate_snapshot: item.analysis_data || {},
      };
    }
    return {
      ...item,
      analysis_data: analysisData,
      prep_status: state.prep_status,
      rollup_task_status: state.rollup_task_status,
      final_source: state.final_source,
      blocking_reason: state.blocking_reason,
      aggregate_status: state.aggregate_status,
      rollup_status: state.rollup_status,
      is_final_analysis_ready: state.is_final_analysis_ready,
      intermediate_only: state.intermediate_only,
      analysis_state_reason: state.analysis_state_reason,
      rollup_task_id: state.rollup_task_id,
      rollup_input_payload: state.rollup_payload_json ?? null,
      final_memory_payload: state.final_memory_payload ?? null,
      final_source_table: state.final_source_table ?? "none",
      final_payload_schema_version: state.final_payload_schema_version ?? null,
      task_result_compact: state.rollup_result_json ?? null,
      rollup_input_chapter_snapshots: state.rollup_input_chapter_snapshots ?? [],
      stale_running: Boolean(state.stale_running),
      rollup_last_updated_at: state.rollup_last_updated_at || null,
      rollup_timeout_sec: state.rollup_timeout_sec,
      is_intermediate_prep: state.prep_status === "CREATED" && !state.final_analysis_ready,
      final_payload_available: state.final_analysis_ready && Boolean(state.final_memory_payload && Object.keys(state.final_memory_payload).length > 0),
    };
  });

  const approvedGroupKeys = new Set(
    itemsWithState
      .filter((it) => it.status === "APPROVED")
      .map((it) => `${it.scope_type}:${it.scope_key}`)
  );
  for (const item of itemsWithState) {
    if (item.status === "APPROVED" || item.status === "CANCELED") continue;
    const groupKey = `${item.scope_type}:${item.scope_key}`;
    if (item.source === "SNAPSHOT" && approvedGroupKeys.has(groupKey)) {
      item.status = "SUPERSEDED";
    }
  }
  const chapters = await loadStoryChapterIds(storyId);
  const arcs = await loadStoryArcs(storyId);
  const scope_runtime_state = Object.fromEntries(Array.from(scopeRuntimeStateByKey.entries()).map(([k, v]) => [k, v]));
  return {
    active_snapshot_id: activeSnapshotId,
    chapters,
    arcs,
    items: itemsWithState,
    running_tasks,
    worker_status,
    analysis_lane_status,
    llama_status,
    worker_master_running: workerRunning,
    worker_lane_running: laneRunning,
    scope_runtime_state,
  };
}

export async function getHistorianGoNoGoMetrics(storyId: number, days = 7) {
  const windowDays = Number.isFinite(Number(days)) ? Math.max(1, Math.min(60, Number(days))) : 7;
  const latencyRes = await pool.query<{ p95_sec: string | number | null; run_count: string | number | null }>(
    `SELECT
       percentile_cont(0.95) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at))
       )::numeric(12,4) AS p95_sec,
       count(*)::int AS run_count
     FROM public.ingest_task
     WHERE story_id = $1
       AND task_type = 'WRITING_ANALYSIS'
       AND status = 'DONE'
       AND created_at >= now() - ($2::text || ' days')::interval`,
    [storyId, String(windowDays)]
  );
  const latencyP95Sec = Number(latencyRes.rows[0]?.p95_sec ?? 0);
  const runCount = Number(latencyRes.rows[0]?.run_count ?? 0);

  const entityRes = await pool.query<{
    total_clean: string | number | null;
    total_entity_conflicts: string | number | null;
  }>(
    `SELECT
       COALESCE(sum((vetting_json->'vetting_report'->>'clean_count')::numeric), 0)::numeric(18,4) AS total_clean,
       COALESCE(sum(jsonb_array_length(COALESCE(vetting_json->'vetting_report'->'entity_type_conflicts', '[]'::jsonb))), 0)::numeric(18,4) AS total_entity_conflicts
     FROM public.writing_analysis_staging
     WHERE story_id = $1
       AND updated_at >= now() - ($2::text || ' days')::interval`,
    [storyId, String(windowDays)]
  );
  const totalClean = Number(entityRes.rows[0]?.total_clean ?? 0);
  const totalEntityConflicts = Number(entityRes.rows[0]?.total_entity_conflicts ?? 0);
  const entityAccuracy = totalClean > 0
    ? Math.max(0, Math.min(1, 1 - totalEntityConflicts / totalClean))
    : 0;

  let leakCount = 0;
  let totalStatic = 0;
  try {
    const leakRes = await pool.query<{ leak_count: string | number | null; total_static: string | number | null }>(
      `SELECT
         count(*) FILTER (WHERE UPPER(COALESCE(classification, '')) = 'EPHEMERAL' AND COALESCE(is_static, false) = true)::int AS leak_count,
         count(*) FILTER (WHERE UPPER(COALESCE(classification, '')) = 'STATIC' OR COALESCE(is_static, false) = true)::int AS total_static
       FROM public.canon_fact
       WHERE story_id = $1`,
      [storyId]
    );
    leakCount = Number(leakRes.rows[0]?.leak_count ?? 0);
    totalStatic = Number(leakRes.rows[0]?.total_static ?? 0);
  } catch {
    leakCount = 0;
    totalStatic = 0;
  }

  let tokensReductionPct: number | null = null;
  let tokenGateReason = "TOKEN_BASELINE_NOT_INSTRUMENTED";
  try {
    const promptRes = await pool.query<{
      avg_prompt_tokens_est: string | number | null;
      sample_count: string | number | null;
    }>(
      `SELECT
         AVG(
           NULLIF(
             COALESCE(
               (llm_request_meta_json->>'prompt_tokens_est')::numeric,
               (length(COALESCE(hydration_output_text, '')) / 4.0)
             ),
             0
           )
         )::numeric(18,4) AS avg_prompt_tokens_est,
         count(*)::int AS sample_count
       FROM public.agent_prompt_hydration_trace
       WHERE story_id = $1
         AND agent_name = 'WRITING_ANALYSIS'
         AND created_at >= now() - ($2::text || ' days')::interval`,
      [storyId, String(windowDays)]
    );
    const avgPromptTokens = Number(promptRes.rows[0]?.avg_prompt_tokens_est ?? 0);
    const samplePromptCount = Number(promptRes.rows[0]?.sample_count ?? 0);
    const baselineRaw = Number(process.env.HISTORIAN_PROMPT_BASELINE_TOKENS ?? 0);
    if (samplePromptCount <= 0 || !Number.isFinite(avgPromptTokens) || avgPromptTokens <= 0) {
      tokenGateReason = "TOKEN_SAMPLE_EMPTY";
    } else if (!Number.isFinite(baselineRaw) || baselineRaw <= 0) {
      tokenGateReason = "TOKEN_BASELINE_NOT_INSTRUMENTED";
    } else {
      tokensReductionPct = (baselineRaw - avgPromptTokens) / baselineRaw;
      tokenGateReason = "TOKEN_BASELINE_COMPARISON";
    }
  } catch {
    tokensReductionPct = null;
    tokenGateReason = "TOKEN_METRICS_QUERY_FAILED";
  }
  const tokenGateMet = tokensReductionPct != null && Number.isFinite(tokensReductionPct) && tokensReductionPct >= 0.3;
  const entityGateMet = entityAccuracy >= 0.95;
  const latencyGateMet = latencyP95Sec > 0 ? latencyP95Sec <= 30 * 1.7 : false;
  const noGo = leakCount > 0;

  let runningTasksWithPromptTraceRate = 0;
  let promptUnavailableRate = 0;
  let analysisBlockedByContractRate = 0;
  let coverageGateFailRate = 0;
  let splitPreemptedRate = 0;
  let rollupDoneRate = 0;
  let rollupFailedDbRate = 0;
  let rollupStaleRate = 0;
  let rollupP50Sec = 0;
  let rollupP95Sec = 0;
  try {
    const taskHealth = await pool.query<{
      running_count: string | number | null;
      running_with_trace_count: string | number | null;
      failed_count: string | number | null;
      blocked_contract_count: string | number | null;
      coverage_fail_count: string | number | null;
    }>(
      `WITH running_tasks AS (
         SELECT id
         FROM public.ingest_task
         WHERE story_id = $1
           AND task_type = 'WRITING_ANALYSIS'
           AND status = 'RUNNING'
       ),
       running_with_trace AS (
         SELECT DISTINCT task_id
         FROM public.agent_prompt_hydration_trace
         WHERE story_id = $1
           AND agent_name = 'WRITING_ANALYSIS'
           AND task_id IN (SELECT id FROM running_tasks)
       ),
       failed_tasks AS (
         SELECT id, COALESCE(error, '') AS err
         FROM public.ingest_task
         WHERE story_id = $1
           AND task_type = 'WRITING_ANALYSIS'
           AND status = 'FAILED'
           AND updated_at >= now() - ($2::text || ' days')::interval
       )
       SELECT
         (SELECT count(*)::int FROM running_tasks) AS running_count,
         (SELECT count(*)::int FROM running_with_trace) AS running_with_trace_count,
         (SELECT count(*)::int FROM failed_tasks) AS failed_count,
         (SELECT count(*)::int FROM failed_tasks WHERE err LIKE 'ANALYSIS_INPUT_%') AS blocked_contract_count,
         (SELECT count(*)::int FROM failed_tasks WHERE err LIKE '%ANALYSIS_INPUT_COVERAGE_GATE_FAIL%') AS coverage_fail_count`,
      [storyId, String(windowDays)]
    );
    const row = taskHealth.rows[0] || {};
    const runningCount = Number(row.running_count ?? 0);
    const runningWithTraceCount = Number(row.running_with_trace_count ?? 0);
    const failedCount = Number(row.failed_count ?? 0);
    const blockedCount = Number(row.blocked_contract_count ?? 0);
    const coverageFailCount = Number(row.coverage_fail_count ?? 0);
    runningTasksWithPromptTraceRate = runningCount > 0 ? runningWithTraceCount / runningCount : 1;
    promptUnavailableRate = runningCount > 0 ? 1 - runningTasksWithPromptTraceRate : 0;
    analysisBlockedByContractRate = failedCount > 0 ? blockedCount / failedCount : 0;
    coverageGateFailRate = failedCount > 0 ? coverageFailCount / failedCount : 0;
  } catch {
    // best-effort metrics
  }
  try {
    const splitPreempt = await pool.query<{ total_count: string | number | null; preempt_count: string | number | null }>(
      `SELECT
         count(*)::int AS total_count,
         count(*) FILTER (
           WHERE COALESCE(result_json->'split_runtime'->'preemption'->>'recursion_skipped', 'false') = 'true'
              OR COALESCE(result_json->'split_runtime'->>'stop_reason', '') = 'TIME_BUDGET_PREEMPTED'
         )::int AS preempt_count
       FROM public.ingest_task
       WHERE story_id = $1
         AND task_type = 'CHAPTER_SPLIT_LLM'
         AND status = 'DONE'
         AND updated_at >= now() - ($2::text || ' days')::interval`,
      [storyId, String(windowDays)]
    );
    const totalCount = Number(splitPreempt.rows[0]?.total_count ?? 0);
    const preemptCount = Number(splitPreempt.rows[0]?.preempt_count ?? 0);
    splitPreemptedRate = totalCount > 0 ? preemptCount / totalCount : 0;
  } catch {
    // best-effort metrics
  }
  try {
    const rollupRes = await pool.query<{
      total_count: string | number | null;
      done_count: string | number | null;
      failed_db_count: string | number | null;
      stale_count: string | number | null;
      p50_sec: string | number | null;
      p95_sec: string | number | null;
    }>(
      `SELECT
         count(*)::int AS total_count,
         count(*) FILTER (WHERE status = 'DONE')::int AS done_count,
         count(*) FILTER (WHERE status = 'FAILED' AND COALESCE(error, '') LIKE 'FAILED_DB:%')::int AS failed_db_count,
         count(*) FILTER (WHERE status = 'FAILED' AND COALESCE(error, '') LIKE 'FAILED_STALE:%')::int AS stale_count,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)))::numeric(12,4) AS p50_sec,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)))::numeric(12,4) AS p95_sec
       FROM public.ingest_task
       WHERE story_id = $1
         AND task_type = 'MEMORY_ROLLUP'
         AND updated_at >= now() - ($2::text || ' days')::interval`,
      [storyId, String(windowDays)]
    );
    const row = rollupRes.rows[0] || {};
    const total = Number(row.total_count ?? 0);
    const done = Number(row.done_count ?? 0);
    const failedDb = Number(row.failed_db_count ?? 0);
    const stale = Number(row.stale_count ?? 0);
    rollupDoneRate = total > 0 ? done / total : 0;
    rollupFailedDbRate = total > 0 ? failedDb / total : 0;
    rollupStaleRate = total > 0 ? stale / total : 0;
    rollupP50Sec = Number(row.p50_sec ?? 0);
    rollupP95Sec = Number(row.p95_sec ?? 0);
  } catch {
    // best-effort metrics
  }
  return {
    window_days: windowDays,
    sample_size: runCount,
    metrics: {
      p95_latency_sec: latencyP95Sec,
      entity_accuracy: Number(entityAccuracy.toFixed(4)),
      ephemeral_leak_count: leakCount,
      static_fact_count: totalStatic,
      prompt_token_reduction_pct: tokensReductionPct,
      running_tasks_with_prompt_trace_rate: Number(runningTasksWithPromptTraceRate.toFixed(4)),
      prompt_unavailable_rate: Number(promptUnavailableRate.toFixed(4)),
      analysis_blocked_by_contract_rate: Number(analysisBlockedByContractRate.toFixed(4)),
      coverage_gate_fail_rate: Number(coverageGateFailRate.toFixed(4)),
      split_preempted_rate: Number(splitPreemptedRate.toFixed(4)),
      rollup_done_rate: Number(rollupDoneRate.toFixed(4)),
      rollup_failed_db_rate: Number(rollupFailedDbRate.toFixed(4)),
      rollup_stale_rate: Number(rollupStaleRate.toFixed(4)),
      rollup_time_to_done_sec_p50: Number(rollupP50Sec.toFixed(2)),
      rollup_time_to_done_sec_p95: Number(rollupP95Sec.toFixed(2)),
    },
    gates: {
      go: {
        token_reduction_ge_30pct: { pass: tokenGateMet, reason: tokenGateReason },
        entity_accuracy_ge_95pct: { pass: entityGateMet },
        p95_latency_le_1_7x_baseline: { pass: latencyGateMet },
      },
      no_go: {
        ephemeral_leak_into_global: { pass: !noGo, leak_count: leakCount },
      },
    },
  };
}

export async function runHistorianAnalysis(
  storyId: number,
  args: {
    chapter_id?: string;
    instructions?: string;
    scope?: "story" | "chapter" | "chapter_range" | "arc";
    chapter_from?: string;
    chapter_to?: string;
    arc_id?: number | string;
    action_type?: "chapter_analysis" | "rollup";
  }
) {
  const scope = (String(args.scope || "chapter").trim().toLowerCase() as "story" | "chapter" | "chapter_range" | "arc");
  const actionType = String(args.action_type || "rollup").trim().toLowerCase() as "chapter_analysis" | "rollup";
  const instructions = String(args.instructions || "").trim() || "Analyze context across selected narrative scope.";
  const requestedChapterId = String(args.chapter_id || "").trim();
  const chapterFrom = String(args.chapter_from || "").trim();
  const chapterTo = String(args.chapter_to || "").trim();
  const arcId = Number(args.arc_id || 0);

  const chapters = await loadStoryChapterIds(storyId);
  let targetChapters: Array<string | null> = [];
  if (scope === "story") {
    targetChapters = chapters.length > 0 ? chapters : [null];
  } else if (scope === "chapter_range") {
    const fromNum = chapterNoFromId(chapterFrom);
    const toNum = chapterNoFromId(chapterTo);
    if (!fromNum || !toNum) throw new Error("INVALID_CHAPTER_RANGE");
    const minNum = Math.min(fromNum, toNum);
    const maxNum = Math.max(fromNum, toNum);
    targetChapters = chapters.filter((id) => {
      const n = chapterNoFromId(id);
      return Boolean(n && n >= minNum && n <= maxNum);
    });
    if (targetChapters.length === 0) throw new Error("EMPTY_CHAPTER_RANGE");
  } else if (scope === "arc") {
    if (!Number.isFinite(arcId) || arcId <= 0) throw new Error("INVALID_ARC_ID");
    targetChapters = await loadArcChapterIds(storyId, arcId);
    if (targetChapters.length === 0) throw new Error("EMPTY_ARC_SCOPE");
  } else {
    if (!requestedChapterId) throw new Error("MISSING_CHAPTER_ID");
    targetChapters = [requestedChapterId];
  }

  targetChapters = [...new Set(targetChapters.map((x) => (x ? String(x).trim() : null)))];
  targetChapters.sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    const ka = chapterSortKey(a);
    const kb = chapterSortKey(b);
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b);
  });

  if (scope === "chapter" || ((scope as string) !== "chapter" && actionType === "chapter_analysis")) {
    const preflightStrict = isTruthyEnv("ANALYSIS_PREFLIGHT_STRICT", true);
    if (preflightStrict) {
      const laneStatus = await getWorkerLaneStatus("analysis").catch(() => ({ lane: "analysis", running: false, pid: null }));
      if (!laneStatus.running) {
        throw new Error("ANALYSIS_LANE_OFFLINE");
      }
      const llamaStatus = await getLlamaServerStatus().catch(() => ({ running: false, pid: null, detail: "LLAMA_STATUS_CHECK_FAILED" }));
      if (!llamaStatus.running) {
        throw new Error("LLAMA_SERVER_OFFLINE");
      }
      const llamaReady = await isLlamaHttpReady();
      if (!llamaReady) {
        throw new Error("LLAMA_SERVER_NOT_READY");
      }
    }
    for (const chapterId of targetChapters) {
      if (!chapterId) continue;
      const gate = await loadLatestSplitOperationalState(storyId, chapterId);
      if (gate.operationalState !== "READY_FOR_ANALYSIS") {
        throw new Error("ANALYSIS_INPUT_OPERATIONAL_STATE_NOT_READY");
      }
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const jobRes = await client.query<{ id: number }>(
        `INSERT INTO public.ingest_job
           (story_id, created_by, status, mode, config_json, total_tasks, completed_tasks)
         VALUES
           ($1, 'historian_analysis_console', 'RUNNING', 'AUTO_LOCK', $2::jsonb, $3, 0)
         RETURNING id`,
        [
          storyId,
          JSON.stringify({
            pipeline_type: "HISTORIAN_ANALYSIS",
            scope,
            chapter_id: requestedChapterId || null,
            chapter_from: chapterFrom || null,
            chapter_to: chapterTo || null,
            arc_id: Number.isFinite(arcId) && arcId > 0 ? arcId : null,
            target_chapters: targetChapters,
            instructions,
          }),
          targetChapters.length || 1,
        ]
      );
      const jobId = Number(jobRes.rows[0].id);
      const tasks: number[] = [];
      let seqNo = 1;
      for (const chapterId of targetChapters.length > 0 ? targetChapters : [null]) {
        const chapterNo = chapterNoFromId(chapterId || undefined);
        const taskRes = await client.query<{ id: number }>(
          `INSERT INTO public.ingest_task
             (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
           VALUES
             ($1, $2, 'WRITING_ANALYSIS', 'chapter', 'READY', $3::jsonb, $4)
           RETURNING id`,
          [
            jobId,
            storyId,
            JSON.stringify({
              instructions,
              scope: "chapter", // We always run individual chapter analysis as chapter scope
              chapter_id: chapterId,
              chapter_no: chapterNo,
            }),
            seqNo++,
          ]
        );
        tasks.push(Number(taskRes.rows[0].id));
      }
      await client.query("COMMIT");
      const retconEnabled = isTruthyEnv("AUTOWRITE_V4_RETCON_REBUILD_ENABLED", false);
      let retconRebuild: { jobId: number; taskId: number } | null = null;
      if (retconEnabled && requestedChapterId) {
        retconRebuild = await enqueueRetconRebuildFromChapter(storyId, requestedChapterId).catch(() => null);
      }
      return {
        jobId,
        taskIds: tasks,
        taskId: tasks[0] ?? 0,
        mode: "chapter_runs" as const,
        retcon_rebuild_job_id: retconRebuild?.jobId ?? 0,
        retcon_rebuild_task_id: retconRebuild?.taskId ?? 0,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const scopeType: "batch" | "arc" | "story" =
    scope === "chapter_range" ? "batch" : scope === "arc" ? "arc" : "story";
  const scopeKey =
    scopeType === "batch"
      ? `${chapterFrom}-${chapterTo}`
      : scopeType === "arc"
        ? `arc:${arcId}`
        : "story:all";
  const aggregate = await createScopeAggregateSnapshot(storyId, {
    scopeType,
    scopeKey,
    targetChapters: targetChapters.filter((x): x is string => Boolean(x)),
    createdBy: "analysis_console",
  });
  const rollup = await enqueueMemoryRollup(storyId, {
    scopeType,
    scopeKey,
    chapterIds: targetChapters.filter((x): x is string => Boolean(x)),
    sourceSnapshotIds: aggregate.sourceSnapshotIds,
    createdBy: "analysis_console",
  });
  let workerState = { running: false };
  let laneState = { running: false };
  let llamaState = { running: false };
  let llamaReady = false;
  try {
    const w = await getIngestWorkerStatus();
    workerState = { running: Boolean(w.running) };
  } catch {
    workerState = { running: false };
  }
  try {
    const lane = await getWorkerLaneStatus("analysis");
    laneState = { running: Boolean(lane.running) };
  } catch {
    laneState = { running: false };
  }
  try {
    const llm = await getLlamaServerStatus();
    llamaState = { running: Boolean(llm.running) };
    llamaReady = await isLlamaHttpReady();
  } catch {
    llamaState = { running: false };
    llamaReady = false;
  }
  const rollupStatus: RollupStatus = rollup?.taskId ? "QUEUED" : "FAILED";
  const analysisState = rollupStatus === "FAILED" ? "ROLLUP_FAILED" : "ROLLUP_QUEUED";
  const analysisStateReason = buildAnalysisStateReason({
    rollupStatus,
    workerRunning: workerState.running,
    laneRunning: laneState.running,
    llamaRunning: llamaState.running,
    llamaReady,
  });
  return {
    jobId: 0,
    taskIds: [],
    taskId: 0,
    mode: "aggregate" as const,
    aggregate_snapshot_id: aggregate.snapshotId,
    scope_snapshot_id: aggregate.snapshotId,
    fact_status: aggregate.factStatus,
    ready_for_writing: aggregate.readyForWriting,
    coverage_threshold: aggregate.coverageThreshold,
    coverage_ratio: aggregate.coverageRatio,
    coverage: aggregate.coverage,
    memory_rollup_job_id: rollup?.jobId ?? 0,
    memory_rollup_task_id: rollup?.taskId ?? 0,
    analysis_state: analysisState,
    analysis_state_reason: analysisStateReason,
  };
}

export async function recoverHistorianRollupTask(
  storyId: number,
  args: { scope_type: "arc" | "story" | "batch"; scope_key: string; mode?: "requeue" | "fail" }
) {
  const scopeType = String(args.scope_type || "").trim().toLowerCase();
  const scopeKey = String(args.scope_key || "").trim();
  if (!scopeKey || !["arc", "story", "batch"].includes(scopeType)) {
    throw new Error("INVALID_SCOPE_FOR_RECOVERY");
  }
  const mode = String(args.mode || "requeue").trim().toLowerCase() === "fail" ? "fail" : "requeue";
  const timeoutSec = memoryRollupStaleTimeoutSec();
  const taskRes = await pool.query<{
    id: number;
    status: string;
    updated_at: string;
  }>(
    `SELECT id, status, updated_at::text
       FROM public.ingest_task
      WHERE story_id = $1
        AND task_type = 'MEMORY_ROLLUP'
        AND COALESCE(payload_json->>'scope_type', '') = $2
        AND COALESCE(payload_json->>'scope_key', '') = $3
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [storyId, scopeType, scopeKey]
  );
  if ((taskRes.rowCount ?? 0) <= 0) {
    return { ok: true, recovered: false, reason: "ROLLUP_TASK_NOT_FOUND", task_id: null, previous_status: null, mode };
  }
  const row = taskRes.rows[0];
  const taskId = Number(row.id || 0);
  const prevStatus = String(row.status || "").trim().toUpperCase();
  const updatedAt = String(row.updated_at || "");
  const ageSec = updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)) : 0;
  const stale = prevStatus === "RUNNING" && ageSec > timeoutSec;
  if (!stale) {
    return {
      ok: true,
      recovered: false,
      reason: "TASK_NOT_STALE_RUNNING",
      task_id: taskId,
      previous_status: prevStatus,
      mode,
      age_sec: ageSec,
      timeout_sec: timeoutSec,
    };
  }
  if (mode === "fail") {
    await pool.query(
      `UPDATE public.ingest_task
          SET status = 'FAILED',
              error = 'FAILED_STALE_MANUAL_RECOVERY',
              updated_at = now()
        WHERE id = $1`,
      [taskId]
    );
    return {
      ok: true,
      recovered: true,
      reason: "MARKED_FAILED",
      task_id: taskId,
      previous_status: prevStatus,
      mode,
      age_sec: ageSec,
      timeout_sec: timeoutSec,
    };
  }
  await pool.query(
    `UPDATE public.ingest_task
        SET status = 'READY',
            error = 'RECOVERED_STALE_RUNNING',
            updated_at = now()
      WHERE id = $1`,
    [taskId]
  );
  return {
    ok: true,
    recovered: true,
    reason: "REQUEUED_READY",
    task_id: taskId,
    previous_status: prevStatus,
    mode,
    age_sec: ageSec,
    timeout_sec: timeoutSec,
  };
}

export async function activateHistorianSnapshot(storyId: number, args: { snapshot_id: number; chapter_id?: string; scope_type?: string; scope_key?: string; activated_by?: string }) {
  const snapshotId = Number(args.snapshot_id || 0);
  if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
    throw new Error("INVALID_SNAPSHOT_ID");
  }
  const scopeTypeRaw = String(args.scope_type || "chapter").trim().toLowerCase();
  const scopeType = (scopeTypeRaw === "batch" || scopeTypeRaw === "arc" || scopeTypeRaw === "story")
    ? scopeTypeRaw
    : "chapter";
  const activatedBy = String(args.activated_by || "operator").trim() || "operator";

  if (scopeType !== "chapter") {
    const scopeKey = String(args.scope_key || "").trim();
    if (!scopeKey) throw new Error("MISSING_SCOPE_KEY");
    const scopeRes = await pool.query<{
      id: number;
      scope_type: string;
      scope_key: string;
      fact_status: string;
      ready_for_writing: boolean;
      degraded_mode: boolean;
    }>(
      `SELECT id, scope_type, scope_key, fact_status, ready_for_writing, degraded_mode
         FROM public.writing_scope_snapshot_v1
        WHERE id = $1
          AND story_id = $2
        LIMIT 1`,
      [snapshotId, storyId]
    );
    if ((scopeRes.rowCount ?? 0) === 0) throw new Error("SNAPSHOT_NOT_FOUND");
    const row = scopeRes.rows[0];
    if (String(row.scope_type).toLowerCase() !== scopeType || String(row.scope_key) !== scopeKey) {
      throw new Error("SCOPE_MISMATCH");
    }
    if (!row.ready_for_writing || row.fact_status !== "CLEAN" || row.degraded_mode) {
      throw new Error("SNAPSHOT_NOT_CLEAN_READY");
    }
    await pool.query(
      `INSERT INTO public.story_active_analysis_scope_snapshot (story_id, scope_type, scope_key, snapshot_id, activated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (story_id, scope_type, scope_key)
       DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id, activated_by = EXCLUDED.activated_by, updated_at = now()`,
      [storyId, scopeType, scopeKey, snapshotId, activatedBy]
    );
    await pool.query(
      `UPDATE public.writing_scope_snapshot_v1
          SET approval_status = CASE
            WHEN id = $4 THEN 'APPROVED'
            WHEN approval_status = 'APPROVED' THEN 'SUPERSEDED'
            WHEN approval_status = 'CANCELED' THEN 'CANCELED'
            ELSE approval_status
          END
        WHERE story_id = $1
          AND scope_type = $2
          AND scope_key = $3`,
      [storyId, scopeType, scopeKey, snapshotId]
    );
    return { ok: true, snapshot_id: snapshotId, scope_type: scopeType, scope_key: scopeKey };
  }

  const snapshotRes = await pool.query<{
    id: number;
    chapter_id: string | null;
    fact_status: string;
    ready_for_writing: boolean;
    degraded_mode: boolean;
  }>(
    `SELECT id, chapter_id, fact_status, ready_for_writing, degraded_mode
       FROM public.writing_snapshot_v3
      WHERE id = $1
        AND story_id = $2
      LIMIT 1`,
    [snapshotId, storyId]
  );
  if ((snapshotRes.rowCount ?? 0) === 0) throw new Error("SNAPSHOT_NOT_FOUND");
  const row = snapshotRes.rows[0];
  if (!row.ready_for_writing || row.fact_status !== "CLEAN" || row.degraded_mode) {
    throw new Error("SNAPSHOT_NOT_CLEAN_READY");
  }
  const chapterId = String(args.chapter_id || row.chapter_id || "").trim();
  if (!chapterId) throw new Error("MISSING_CHAPTER_ID");

  await pool.query(
    `INSERT INTO public.story_active_analysis_snapshot (story_id, chapter_id, snapshot_id, activated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (story_id, chapter_id)
     DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id, activated_by = EXCLUDED.activated_by, updated_at = now()`,
    [storyId, chapterId, snapshotId, activatedBy]
  );
  await pool.query(
    `UPDATE public.writing_snapshot_v3
        SET approval_status = CASE
          WHEN id = $3 THEN 'APPROVED'
          WHEN approval_status = 'APPROVED' THEN 'SUPERSEDED'
          WHEN approval_status = 'CANCELED' THEN 'CANCELED'
          ELSE approval_status
        END
      WHERE story_id = $1
        AND chapter_id = $2`,
    [storyId, chapterId, snapshotId]
  );

  return { ok: true, snapshot_id: snapshotId, chapter_id: chapterId };
}

export async function cancelHistorianSnapshot(
  storyId: number,
  args: { snapshot_id: number; chapter_id?: string; scope_type?: string; scope_key?: string }
) {
  const snapshotId = Number(args.snapshot_id || 0);
  if (!Number.isFinite(snapshotId) || snapshotId <= 0) throw new Error("INVALID_SNAPSHOT_ID");
  const scopeTypeRaw = String(args.scope_type || "chapter").trim().toLowerCase();
  const scopeType = (scopeTypeRaw === "batch" || scopeTypeRaw === "arc" || scopeTypeRaw === "story")
    ? scopeTypeRaw
    : "chapter";

  if (scopeType !== "chapter") {
    const scopeKey = String(args.scope_key || "").trim();
    if (!scopeKey) throw new Error("MISSING_SCOPE_KEY");
    const rs = await pool.query<{ id: number }>(
      `SELECT id
         FROM public.writing_scope_snapshot_v1
        WHERE id = $1 AND story_id = $2 AND scope_type = $3 AND scope_key = $4
        LIMIT 1`,
      [snapshotId, storyId, scopeType, scopeKey]
    );
    if ((rs.rowCount ?? 0) === 0) throw new Error("SNAPSHOT_NOT_FOUND");
    await pool.query(
      `UPDATE public.writing_scope_snapshot_v1
          SET approval_status = 'CANCELED'
        WHERE id = $1`,
      [snapshotId]
    );
    await pool.query(
      `DELETE FROM public.story_active_analysis_scope_snapshot
        WHERE story_id = $1 AND scope_type = $2 AND scope_key = $3 AND snapshot_id = $4`,
      [storyId, scopeType, scopeKey, snapshotId]
    );
    return { ok: true, snapshot_id: snapshotId, scope_type: scopeType, scope_key: scopeKey, status: "CANCELED" as const };
  }

  const chapterId = String(args.chapter_id || "").trim();
  const rs = await pool.query<{ id: number; chapter_id: string | null }>(
    `SELECT id, chapter_id
       FROM public.writing_snapshot_v3
      WHERE id = $1 AND story_id = $2
      LIMIT 1`,
    [snapshotId, storyId]
  );
  if ((rs.rowCount ?? 0) === 0) throw new Error("SNAPSHOT_NOT_FOUND");
  const ch = chapterId || String(rs.rows[0].chapter_id || "").trim();
  if (!ch) throw new Error("MISSING_CHAPTER_ID");
  await pool.query(
    `UPDATE public.writing_snapshot_v3
        SET approval_status = 'CANCELED'
      WHERE id = $1`,
    [snapshotId]
  );
  await pool.query(
    `DELETE FROM public.story_active_analysis_snapshot
      WHERE story_id = $1 AND chapter_id = $2 AND snapshot_id = $3`,
    [storyId, ch, snapshotId]
  );
  return { ok: true, snapshot_id: snapshotId, chapter_id: ch, status: "CANCELED" as const };
}
