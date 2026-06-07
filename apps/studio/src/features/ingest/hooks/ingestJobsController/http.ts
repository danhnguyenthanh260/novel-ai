import type {
  ExistingChapter,
  FeedbackDraft,
  IngestJob,
  IngestTask,
  RuntimeReadiness,
  SourceDocItem,
  SplitDraftData,
  SplitDraftScene,
  WorkerLaneStatus,
  WorkerStatus,
} from "@/features/ingest/components/ingestJobs/types";
import {
  parseExistingChapters,
  parseSourceDocItems,
  parseSplitDraftResponse,
} from "@/features/ingest/components/ingestJobs/mappers";

type JsonRecord = Record<string, unknown>;

async function parseJsonResponse(res: Response): Promise<JsonRecord> {
  return (await res.json()) as JsonRecord;
}

function explainIngestError(code: unknown): string | null {
  if (typeof code !== "string" || !code) return null;
  if (/^ZIP_FILE_CHAPTER_NUMBER_MISSING_\d+$/.test(code)) {
    return `${code}: rename each ZIP file to include chapter/ch plus a number, or start with a number, for example chapter-01.txt, ch02.md, or 01-title.txt.`;
  }
  if (/^ZIP_FILE_SCENE_DELIMITER_MISSING_\d+$/.test(code)) {
    return `${code}: manual split requires a scene delimiter such as ## Scene or --- in this chapter.`;
  }
  if (code === "ZIP_DECOMPRESS_FAILED") {
    return `${code}: the file could not be opened as a ZIP archive. Re-export it as a standard .zip file and try again.`;
  }
  if (/^PASTE_SCENE_DELIMITER_MISSING_\d+$/.test(code)) {
    return `${code}: manual split requires scene delimiters. Switch to auto split or add ## Scene / --- markers.`;
  }
  if (code === "WORKER_SCRIPT_NOT_FOUND") {
    return `${code}: the app runtime cannot see the memory worker file. Check repo mount, cwd, and MEMORY_WORKER_SCRIPT.`;
  }
  return code;
}

function ingestErrorMessage(json: JsonRecord): string {
  const raw = Array.isArray(json.errors) ? json.errors : [json.error];
  return raw.map(explainIngestError).filter(Boolean).join(", ") || "INGEST_REQUEST_FAILED";
}

function resolveReadiness(raw: unknown): RuntimeReadiness | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as JsonRecord;
  return {
    ok: Boolean(value.ok),
    missing_tables: Array.isArray(value.missing_tables) ? value.missing_tables.map((item) => String(item)) : [],
    hint: typeof value.hint === "string" ? value.hint : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

function resolveWorkerStatus(worker: unknown): WorkerStatus | null {
  if (!worker || typeof worker !== "object") return null;
  const value = worker as JsonRecord;
  return {
    enabled: Boolean(value.enabled),
    running: Boolean(value.running),
    pid: Number.isFinite(Number(value.pid)) ? Number(value.pid) : null,
    detail: typeof value.detail === "string" ? value.detail : undefined,
  };
}

export async function fetchWorkerStatus(baseUrl: string): Promise<WorkerStatus | null> {
  const res = await fetch(`${baseUrl}/ingest/worker`, { cache: "no-store" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : "WORKER_STATUS_FAILED");
  }
  const workerData = resolveWorkerStatus(json.worker);
  if (workerData && Array.isArray(json.lanes)) {
    workerData.lanes = json.lanes as WorkerLaneStatus[];
  }
  if (workerData) workerData.readiness = resolveReadiness(json.readiness);
  return workerData;
}

export async function postWorkerAction(baseUrl: string, action: "start" | "stop" | "restart" | "kill" | "start_llama") {
  const res = await fetch(`${baseUrl}/ingest/worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `WORKER_${action.toUpperCase()}_FAILED`);
  }
  return {
    worker: {
      ...(resolveWorkerStatus(json.worker) ?? { enabled: false, running: false, pid: null }),
      readiness: resolveReadiness(json.readiness),
    },
    result: json.result && typeof json.result === "object" ? (json.result as JsonRecord) : null,
  };
}

export async function fetchWorkerLogs(baseUrl: string, type: "worker" | "llama", lines: number = 200): Promise<string> {
  const res = await fetch(`${baseUrl}/ingest/worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logs", type, lines }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `WORKER_LOGS_FAILED`);
  }
  return typeof json.logs === "string" ? json.logs : "";
}

export async function fetchSourceDocs(baseUrl: string): Promise<SourceDocItem[]> {
  const res = await fetch(`${baseUrl}/ingest/source-docs`, { cache: "no-store" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : "SOURCE_DOCS_LIST_FAILED");
  }
  return parseSourceDocItems(json);
}

export async function postSetCanonicalSourceDoc(baseUrl: string, sourceDocId: string): Promise<string> {
  const res = await fetch(`${baseUrl}/ingest/source-docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_doc_id: sourceDocId }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : "SOURCE_DOC_SET_CANONICAL_FAILED");
  }
  return typeof json.chapter_id === "string" ? json.chapter_id : "-";
}

export async function fetchJobs(listUrl: string): Promise<{
  jobs: IngestJob[];
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}> {
  const res = await fetch(listUrl, { cache: "no-store" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `GET_INGEST_JOBS_FAILED_${res.status}`);
  }
  const jobs = Array.isArray(json.jobs) ? (json.jobs as IngestJob[]) : [];
  const paging = json.pagination && typeof json.pagination === "object" ? (json.pagination as JsonRecord) : {};
  return {
    jobs,
    total: Number(paging.total) || 0,
    hasPrev: Boolean(paging.has_prev),
    hasNext: Boolean(paging.has_next),
  };
}

export async function fetchTasks(baseUrl: string, jobId: number): Promise<IngestTask[]> {
  const res = await fetch(`${baseUrl}/ingest/jobs?job_id=${jobId}`, { cache: "no-store" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `GET_INGEST_TASKS_FAILED_${res.status}`);
  }
  return Array.isArray(json.tasks) ? (json.tasks as IngestTask[]) : [];
}

export async function fetchSplitDraft(baseUrl: string, jobId: number): Promise<SplitDraftData> {
  const res = await fetch(`${baseUrl}/ingest/jobs/${jobId}/split-draft`, { cache: "no-store" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `GET_SPLIT_DRAFT_FAILED_${res.status}`);
  }
  return parseSplitDraftResponse(json);
}

export async function postRebuildGlobalProfile(baseUrl: string): Promise<{ chapterProfiles: number; globalBest: string }> {
  const res = await fetch(`${baseUrl}/ingest/rebuild-global-profile`, { method: "POST" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : "REBUILD_GLOBAL_PROFILE_FAILED");
  }
  return {
    chapterProfiles: Number(json.chapter_profiles ?? 0),
    globalBest: typeof json.global_best === "string" ? json.global_best : "unknown",
  };
}

export type SplitMaturityReport = {
  processLegacy: boolean;
  legacyRowsUpdated: number;
  generatedAt: string;
  windows: Array<{
    days: 7 | 14 | 30;
    doneRuns: number;
    machinePassRate: number;
    humanPassRate: number;
    pendingHumanRate: number;
    humanRejectRate: number;
    manualReviewRate: number;
    retryRate: number;
    firstPassSuccessRate: number;
    explorationRate: number;
    strategySwitchRate: number;
    avgFlaggedPct: number;
    avgFragmentation: number;
    strategyDiversity: number;
  }>;
};

export type IngestTaxonomyConfig = {
  taxonomyVersion: string;
  rulePackVersion: string;
  tokenKeys: string[];
};

export async function fetchIngestTaxonomyConfig(baseUrl: string): Promise<IngestTaxonomyConfig> {
  const res = await fetch(`${baseUrl}/ingest/taxonomy-config`, { cache: "no-store" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `GET_TAXONOMY_CONFIG_FAILED_${res.status}`);
  }
  const tokenKeys = Array.isArray(json.token_keys) ? json.token_keys.map((x) => String(x)) : ["UNCLASSIFIED"];
  return {
    taxonomyVersion: typeof json.taxonomy_version === "string" ? json.taxonomy_version : "v1.0",
    rulePackVersion: typeof json.rule_pack_version === "string" ? json.rule_pack_version : "rp1.0",
    tokenKeys,
  };
}

export async function postMaturityReport(baseUrl: string, processLegacy: boolean): Promise<SplitMaturityReport> {
  const res = await fetch(`${baseUrl}/ingest/maturity-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ process_legacy: processLegacy }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : "MATURITY_REPORT_FAILED");
  }
  const windowsRaw = Array.isArray(json.windows) ? json.windows : [];
  return {
    processLegacy: Boolean(json.process_legacy),
    legacyRowsUpdated: Number(json.legacy_rows_updated ?? 0),
    generatedAt: typeof json.generated_at === "string" ? json.generated_at : new Date().toISOString(),
    windows: windowsRaw
      .map((row) => {
        const value = row as JsonRecord;
        const days = Number(value.days);
        if (days !== 7 && days !== 14 && days !== 30) return null;
        return {
          days: days as 7 | 14 | 30,
          doneRuns: Number(value.done_runs ?? 0),
          machinePassRate: Number(value.machine_pass_rate ?? 0),
          humanPassRate: Number(value.human_pass_rate ?? 0),
          pendingHumanRate: Number(value.pending_human_rate ?? 0),
          humanRejectRate: Number(value.human_reject_rate ?? 0),
          manualReviewRate: Number(value.manual_review_rate ?? 0),
          retryRate: Number(value.retry_rate ?? 0),
          firstPassSuccessRate: Number(value.first_pass_success_rate ?? 0),
          explorationRate: Number(value.exploration_rate ?? 0),
          strategySwitchRate: Number(value.strategy_switch_rate ?? 0),
          avgFlaggedPct: Number(value.avg_flagged_pct ?? 0),
          avgFragmentation: Number(value.avg_fragmentation ?? 0),
          strategyDiversity: Number(value.strategy_diversity ?? 0),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  };
}

export async function fetchStoryChapters(storySlug: string): Promise<ExistingChapter[]> {
  const res = await fetch(`/api/stories/${encodeURIComponent(storySlug)}/chapters`, { cache: "no-store" });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `GET_STORY_CHAPTERS_FAILED_${res.status}`);
  }
  return parseExistingChapters(json);
}

export async function postApproveSplit(
  baseUrl: string,
  jobId: number,
  createdBy: string,
  scenes: SplitDraftScene[],
  chapterTaskId?: number
): Promise<JsonRecord> {
  const chapterPath = chapterTaskId
    ? `/ingest/jobs/${jobId}/chapters/${chapterTaskId}/approve-split`
    : `/ingest/jobs/${jobId}/approve-split`;
  const res = await fetch(`${baseUrl}${chapterPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approved_scenes: scenes,
      created_by: createdBy.trim() || "ui",
    }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `APPROVE_SPLIT_FAILED_${res.status}`);
  }
  return json;
}

export async function postRejectSplit(baseUrl: string, jobId: number, createdBy: string, reason: string): Promise<void> {
  const res = await fetch(`${baseUrl}/ingest/jobs/${jobId}/reject-split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: reason.trim() || null,
      created_by: createdBy.trim() || "ui",
    }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `REJECT_SPLIT_FAILED_${res.status}`);
  }
}

export async function postReprocessScenes(
  baseUrl: string,
  payload: {
    chapterIds: string[];
    reprocessReasonCode:
    | "BOUNDARY_QUALITY"
    | "MID_WORD_CUT"
    | "SCENE_SPLIT_TOO_WIDE"
    | "SCENE_SPLIT_TOO_FRAGMENTED"
    | "QUOTE_CONTINUITY_BREAK"
    | "SYSTEMIC_ENTITY_SPLIT"
    | "OTHER";
    reprocessNote: string;
    splitMode: "auto" | "manual";
    selfHealingEnabled: boolean;
    autoRetryEnabled: boolean;
    maxLlmCalls: 1 | 2 | 3;
    reviewMode: "AUTO_LOCK" | "REVIEW_GATE";
    createdBy: string;
    sourceJobId?: number | null;
    forcedStrategy?: string | null;
  }
): Promise<JsonRecord> {
  const res = await fetch(`${baseUrl}/ingest/reprocess-scenes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chapter_ids: payload.chapterIds,
      reprocess_reason_code: payload.reprocessReasonCode,
      reprocess_note: payload.reprocessNote.trim() || null,
      split_mode: payload.splitMode,
      self_healing_enabled: payload.selfHealingEnabled,
      auto_retry_enabled: payload.autoRetryEnabled,
      max_llm_calls: payload.maxLlmCalls,
      review_mode: payload.reviewMode,
      created_by: payload.createdBy.trim() || "ui",
      source_job_id: payload.sourceJobId ?? undefined,
      forced_strategy: payload.forcedStrategy ?? null,
    }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `REPROCESS_SCENES_FAILED_${res.status}`);
  }
  return json;
}

export async function postSplitFeedback(
  baseUrl: string,
  jobId: number,
  chapterTaskId: number,
  chapterStrategy: string | null | undefined,
  draft: FeedbackDraft,
  createdBy: string
): Promise<Record<string, unknown>> {
  const tokenKey = (draft.tokenKey || "UNCLASSIFIED").trim().toUpperCase();
  const locationRef = draft.locationRef.trim();
  const reasonText = draft.note.trim();
  const noteTemplate = `${tokenKey} + ${locationRef || "Scene ?"} + ${reasonText || "-"}`;
  const res = await fetch(`${baseUrl}/ingest/jobs/${jobId}/chapters/${chapterTaskId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      strategy: chapterStrategy ?? null,
      rating: -1,
      issue_code: tokenKey === "UNCLASSIFIED" ? "OTHER" : tokenKey,
      note: noteTemplate,
      boundary_ref:
        draft.sceneIdxLeft || draft.sceneIdxRight || draft.charOffset
          ? {
            scene_idx_left: draft.sceneIdxLeft,
            scene_idx_right: draft.sceneIdxRight,
            char_offset: draft.charOffset,
          }
          : null,
      created_by: createdBy.trim() || "ui",
    }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `SPLIT_FEEDBACK_FAILED_${res.status}`);
  }
  return json;
}

export async function patchIngestJobAction(
  baseUrl: string,
  jobId: number,
  action: "cancel_job" | "retry_failed_tasks" | "retry_task",
  taskId?: number,
  retryProfile?: "auto_recovery_outline" | "auto_recovery_budget" | "auto_recovery_artifact" | "auto_recovery_transport"
): Promise<void> {
  const res = await fetch(`${baseUrl}/ingest/jobs`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      job_id: jobId,
      task_id: taskId,
      retry_profile: retryProfile,
    }),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(typeof json.error === "string" ? json.error : `INGEST_ACTION_FAILED_${res.status}`);
  }
}

export async function postValidateUpload(baseUrl: string, form: FormData): Promise<{ chapters: number; scenesEstimate: number }> {
  const res = await fetch(`${baseUrl}/ingest/validate`, {
    method: "POST",
    body: form,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(ingestErrorMessage(json));
  }
  return {
    chapters: Number((json.summary as JsonRecord | undefined)?.total_chapters ?? 0),
    scenesEstimate: Number((json.summary as JsonRecord | undefined)?.total_scenes_estimate ?? 0),
  };
}

export async function postCreateIngestJob(baseUrl: string, form: FormData): Promise<JsonRecord> {
  const res = await fetch(`${baseUrl}/ingest/jobs`, {
    method: "POST",
    body: form,
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || json.ok === false) {
    throw new Error(ingestErrorMessage(json));
  }
  return json;
}
