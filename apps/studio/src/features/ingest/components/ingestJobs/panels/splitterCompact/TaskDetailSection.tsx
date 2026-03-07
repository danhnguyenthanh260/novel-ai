import { JsonPromptTabs } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/JsonPromptTabs";
import type { ScenesTrackerChapterData } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/ChapterScenesTracker";
import {
  ageSecFromIso,
  extractPrompt,
  formatAge,
  profileForRootCause,
  runbookHintText,
} from "@/features/ingest/components/ingestJobs/panels/splitterCompact/splitterHelpers";
import type { IngestJobsControllerState } from "@/features/ingest/hooks/useIngestJobsController";

export function TaskDetailSection({
  state,
  splitSlaSec,
  splitStaleSec,
}: {
  state: IngestJobsControllerState;
  splitSlaSec: number;
  splitStaleSec: number;
}) {
  if (!state.selectedTask) return null;

  const age = ageSecFromIso(state.selectedTask.updated_at);
  const isRunning = state.selectedTask.status === "RUNNING";
  const taskOperationalState = String(
    (state.selectedTask.result_json as Record<string, unknown> | null | undefined)?.operational_state || "",
  ).toUpperCase();
  const isNeedsRetryDone = state.selectedTask.status === "DONE" && taskOperationalState === "NEEDS_RETRY";
  const taskError =
    (typeof state.selectedTask.error === "string" && state.selectedTask.error.trim().length > 0
      ? state.selectedTask.error.trim()
      : "") ||
    (typeof (state.selectedTask.result_json as Record<string, unknown> | null | undefined)?.error === "string"
      ? String((state.selectedTask.result_json as Record<string, unknown>).error)
      : "");
  const promptData = extractPrompt(state.selectedTask.payload_json ?? {}, state.selectedTask.result_json ?? {});
  const splitLane = state.workerStatus?.lanes?.find((x) => x.lane === "split");
  const llmReady = (state.workerStatus?.detail || "").toLowerCase().includes("ready");
  const splitRuntime =
    (state.selectedTask?.result_json as Record<string, unknown> | null | undefined)?.split_runtime &&
      typeof (state.selectedTask?.result_json as Record<string, unknown>).split_runtime === "object"
      ? ((state.selectedTask?.result_json as Record<string, unknown>).split_runtime as Record<string, unknown>)
      : {};
  const rootCause = typeof splitRuntime.root_cause_class === "string" ? splitRuntime.root_cause_class : "UNKNOWN";
  const rootCauseConfidence = Number.isFinite(Number(splitRuntime.root_cause_confidence))
    ? Number(splitRuntime.root_cause_confidence)
    : null;
  const recommendedAction = typeof splitRuntime.recommended_action_code === "string" ? splitRuntime.recommended_action_code : null;
  const runbookHintCode = typeof splitRuntime.runbook_hint_code === "string" ? splitRuntime.runbook_hint_code : null;
  const resultJson = state.selectedTask?.result_json as Record<string, unknown> | null | undefined;
  const taskArtifact =
    resultJson?.analysis_chunk_artifact && typeof resultJson.analysis_chunk_artifact === "object"
      ? (resultJson.analysis_chunk_artifact as Record<string, unknown>)
      : {};
  const taskDiagnostics =
    resultJson?.analysis_chunk_diagnostics && typeof resultJson.analysis_chunk_diagnostics === "object"
      ? (resultJson.analysis_chunk_diagnostics as Record<string, unknown>)
      : taskArtifact.diagnostics && typeof taskArtifact.diagnostics === "object"
        ? (taskArtifact.diagnostics as Record<string, unknown>)
        : {};
  const taskOversizedCountRaw = Number(taskDiagnostics.oversized_count);
  const taskOversizedCount = Number.isFinite(taskOversizedCountRaw) ? taskOversizedCountRaw : null;
  const degradePathTaken = Boolean(splitRuntime.degrade_path_taken);
  const degradeReasonCode =
    typeof splitRuntime.degrade_reason_code === "string" && splitRuntime.degrade_reason_code.trim().length > 0
      ? splitRuntime.degrade_reason_code
      : null;
  const deterministicFallbackApplied = Boolean(splitRuntime.deterministic_fallback_applied);
  const taskScenesData: ScenesTrackerChapterData | null =
    resultJson?.scenes && Array.isArray(resultJson.scenes)
      ? {
        operational_state: String(resultJson.operational_state || "") as
          | "READY_FOR_ANALYSIS"
          | "NEEDS_RETRY"
          | null,
        analysis_chunk_artifact: taskArtifact,
        analysis_chunk_diagnostics: taskDiagnostics,
        scenes: resultJson.scenes as ScenesTrackerChapterData["scenes"],
      }
      : null;

  const executionSec = typeof splitRuntime.duration_sec === "number" ? splitRuntime.duration_sec : null;

  return (
    <>
      <div className="rounded border border-[#223247] bg-[#0f172a] p-3 text-xs">
        <div className="text-sm font-medium text-slate-100">Task #{state.selectedTask.seq_no}</div>
        <div className="muted mt-1">
          {state.selectedTask.task_type} | {state.selectedTask.status}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="text-slate-400">Attempt Age: {formatAge(age)}</span>
          <span className="text-sky-300 border-l border-slate-700 pl-2">
            Execution Time (LLMs & Algo): {Number.isFinite(executionSec) ? `${Math.round(executionSec!)}s` : "--"}
          </span>
          {isRunning && age > splitSlaSec ? (
            <span className="rounded border border-amber-500/40 bg-amber-900/20 px-1 py-0.5 text-amber-200">SLA breach</span>
          ) : null}
          {isRunning && age > splitStaleSec ? (
            <span className="rounded border border-rose-500/40 bg-rose-900/20 px-1 py-0.5 text-rose-200">Likely stale</span>
          ) : null}
        </div>
        {taskError ? (
          <div className="mt-2 rounded border border-rose-500/40 bg-rose-900/20 px-2 py-1 text-[11px] text-rose-200">
            FAILED: {taskError}
          </div>
        ) : null}
        {isNeedsRetryDone ? (
          <div className="mt-2 rounded border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-[11px] text-rose-200">
            <div className="font-semibold mb-1">DONE but NEEDS_RETRY</div>
            <div>
              {degradePathTaken
                ? "The system exhausted its maximum extended time budget before finishing recursive splits for this very large chapter."
                : "The split completed, but some resulting scenes are still too large despite the maximum budget allowance."}
            </div>
            <div className="mt-1 text-amber-200">
              Manual review of the chapter length is recommended, or you may attempt a <strong>Smart Retry</strong> to try a different structural approach.
            </div>
          </div>
        ) : null}
        {degradePathTaken ? (
          <div
            className="mt-2 rounded border border-amber-500/40 bg-amber-900/20 px-2 py-1 text-[11px] text-amber-200"
            title="This split used deterministic fallback due to budget pressure. Manual review recommended."
          >
            Fallback Split (Budget){degradeReasonCode ? `: ${degradeReasonCode}` : ""}
          </div>
        ) : null}
        {deterministicFallbackApplied ? (
          <div className="mt-2 rounded border border-sky-500/40 bg-sky-900/20 px-2 py-1 text-[11px] text-sky-200">
            Auto-split oversized
          </div>
        ) : null}
        <div className="mt-2 rounded border border-[#223247] bg-[#0b1526] px-2 py-1 text-[11px]">
          <div className="mb-1 text-slate-300">Verify checklist</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-slate-400">worker</span>
            <span className={state.workerStatus?.running ? "text-emerald-300" : "text-rose-300"}>
              {state.workerStatus?.running ? "running" : "stopped"}
            </span>
            <span className="text-slate-400">split lane</span>
            <span className={splitLane?.running ? "text-emerald-300" : "text-rose-300"}>
              {splitLane?.running ? "running" : "off"}
            </span>
            <span className="text-slate-400">llm</span>
            <span className={llmReady ? "text-emerald-300" : "text-amber-300"}>{llmReady ? "ready" : "unknown/not-ready"}</span>
            <span className="text-slate-400">prompt trace</span>
            <span className={promptData.text ? "text-emerald-300" : "text-amber-300"}>
              {promptData.text ? "available" : promptData.unavailableReason || "unavailable"}
            </span>
            <span className="text-slate-400">root cause</span>
            <span className="text-amber-300">{rootCause}</span>
            <span className="text-slate-400">recommended</span>
            <span className="text-slate-200">{recommendedAction || "-"}</span>
            <span className="text-slate-400">confidence</span>
            <span className="text-slate-200">
              {rootCauseConfidence !== null ? `${Math.round(rootCauseConfidence * 100)}%` : "-"}
            </span>
          </div>
          <div className="mt-2 rounded border border-[#2A3441] bg-[#0a1220] px-2 py-1 text-[10px] text-slate-300">
            <span className="text-slate-400">runbook:</span>{" "}
            {runbookHintText(runbookHintCode, { oversizedCount: taskOversizedCount })}
          </div>
        </div>
        <div className="mt-2">
          <button
            type="button"
            className="shell-link px-2 py-1 text-xs"
            onClick={() => state.runAction("retry_task", state.selectedTask!.id)}
            disabled={state.acting || !["FAILED", "RUNNING"].includes(state.selectedTask.status)}
          >
            Retry Task
          </button>
          {state.selectedTask.status === "FAILED" ||
            state.selectedTask.status === "RUNNING" ||
            (state.selectedTask.status === "DONE" &&
              String((state.selectedTask.result_json as Record<string, unknown> | null | undefined)?.operational_state || "").toUpperCase() ===
              "NEEDS_RETRY") ? (
            <button
              type="button"
              className="ml-2 shell-link px-2 py-1 text-xs border-[#9de5dc]/40 text-[#9de5dc]"
              onClick={() => {
                const result = (state.selectedTask?.result_json ?? {}) as Record<string, unknown>;
                const runtime =
                  result.split_runtime && typeof result.split_runtime === "object"
                    ? (result.split_runtime as Record<string, unknown>)
                    : {};
                const runtimeRootCause = typeof runtime.root_cause_class === "string" ? runtime.root_cause_class : null;
                state.runAction("retry_task", state.selectedTask!.id, { retryProfile: profileForRootCause(runtimeRootCause) });
              }}
              disabled={state.acting}
            >
              Smart Retry
            </button>
          ) : null}
        </div>
      </div>

      <JsonPromptTabs
        payload={state.selectedTask.payload_json ?? {}}
        result={state.selectedTask.result_json ?? {}}
        promptData={extractPrompt(state.selectedTask.payload_json ?? {}, state.selectedTask.result_json ?? {})}
        scenesData={taskScenesData}
      />
    </>
  );
}
