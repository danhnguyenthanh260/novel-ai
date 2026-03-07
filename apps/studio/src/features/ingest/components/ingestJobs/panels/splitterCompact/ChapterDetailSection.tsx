import { createDefaultFeedbackDraft } from "@/features/ingest/components/ingestJobs/mappers";
import { StrategyFeedbackForm } from "@/features/ingest/components/ingestJobs/panels/splitDraftChapters/StrategyFeedbackForm";
import { JsonPromptTabs } from "@/features/ingest/components/ingestJobs/panels/splitterCompact/JsonPromptTabs";
import {
  extractPrompt,
  profileForRootCause,
  runbookHintText,
} from "@/features/ingest/components/ingestJobs/panels/splitterCompact/splitterHelpers";
import type { SplitDraftData } from "@/features/ingest/components/ingestJobs/types";
import type { IngestJobsControllerState } from "@/features/ingest/hooks/useIngestJobsController";

type SplitDraftChapter = SplitDraftData["chapters"][number];

export function ChapterDetailSection({
  state,
  selectedChapter,
}: {
  state: IngestJobsControllerState;
  selectedChapter: SplitDraftChapter;
}) {
  const rt = selectedChapter.split_runtime && typeof selectedChapter.split_runtime === "object" ? selectedChapter.split_runtime : {};
  const phaseTiming = rt.phase_timing && typeof rt.phase_timing === "object" ? rt.phase_timing : {};
  const phaseBudget = rt.phase_budget && typeof rt.phase_budget === "object" ? rt.phase_budget : {};
  const phaseStopReason = typeof rt.phase_stop_reason === "string" && rt.phase_stop_reason.trim().length > 0 ? rt.phase_stop_reason : "UNKNOWN";
  const rootCauseClass = typeof rt.root_cause_class === "string" && rt.root_cause_class.trim().length > 0 ? rt.root_cause_class : "UNKNOWN";
  const rootCauseConfidence = Number.isFinite(Number(rt.root_cause_confidence)) ? Number(rt.root_cause_confidence) : null;
  const recommendedActionCode =
    typeof rt.recommended_action_code === "string" && rt.recommended_action_code.trim().length > 0
      ? rt.recommended_action_code
      : null;
  const runbookHintCode =
    typeof rt.runbook_hint_code === "string" && rt.runbook_hint_code.trim().length > 0
      ? rt.runbook_hint_code
      : null;
  const retryProfileUsed =
    typeof rt.retry_profile_used === "string" && rt.retry_profile_used.trim().length > 0 ? rt.retry_profile_used : null;
  const budgetProfile = typeof rt.budget_profile === "string" && rt.budget_profile.trim().length > 0 ? rt.budget_profile : null;
  const outlineSec = Number(phaseTiming.outline_sec ?? 0);
  const primarySec = Number(phaseTiming.primary_sec ?? 0);
  const recursionSec = Number(phaseTiming.recursion_sec ?? 0);
  const repairSec = Number(phaseTiming.repair_sec ?? 0);
  const outlineBudget = Math.max(0, Number(phaseBudget.outline_budget_sec ?? 0));
  const primaryBudget = Math.max(0, Number(phaseBudget.primary_budget_sec ?? 0));
  const repairBudget = Math.max(0, Number(phaseBudget.repair_budget_sec ?? 0));
  const repairSummary = rt.repair_summary && typeof rt.repair_summary === "object" ? rt.repair_summary : {};
  const degradePathTaken = Boolean(rt.degrade_path_taken);
  const degradeReasonCode =
    typeof rt.degrade_reason_code === "string" && rt.degrade_reason_code.trim().length > 0 ? rt.degrade_reason_code : null;
  const deterministicFallbackApplied = Boolean(rt.deterministic_fallback_applied);
  const artifact =
    selectedChapter.analysis_chunk_artifact && typeof selectedChapter.analysis_chunk_artifact === "object"
      ? selectedChapter.analysis_chunk_artifact
      : {};
  const artifactStatus = typeof artifact.status === "string" ? artifact.status : "UNKNOWN";
  const diagnostics =
    selectedChapter.analysis_chunk_diagnostics && typeof selectedChapter.analysis_chunk_diagnostics === "object"
      ? selectedChapter.analysis_chunk_diagnostics
      : artifact.diagnostics && typeof artifact.diagnostics === "object"
        ? artifact.diagnostics
        : {};
  const oversizedCount = Number((diagnostics as Record<string, unknown>).oversized_count ?? 0);
  const maxChunkCharsObserved = Number((diagnostics as Record<string, unknown>).max_chunk_chars_observed ?? 0);
  const repairAttempted = Boolean((diagnostics as Record<string, unknown>).repair_attempted);
  const repairExhausted = Boolean((diagnostics as Record<string, unknown>).repair_exhausted);
  const executionSec = typeof rt.duration_sec === "number" ? rt.duration_sec : null;
  const notReadyReason =
    artifactStatus === "NOT_READY"
      ? oversizedCount > 0
        ? "ARTIFACT_NOT_READY_CHUNK_OVERSIZED"
        : selectedChapter.rerun_reason || "ANALYSIS_CHUNK_ARTIFACT_NOT_READY"
      : null;

  return (
    <>
      <div className="rounded border border-[#223247] bg-[#0f172a] p-3 text-xs">
        <div className="text-sm font-medium text-slate-100">
          {selectedChapter.chapter_id ?? `task#${selectedChapter.task_id}`}
        </div>
        <div className="muted mt-1">
          strategy: {selectedChapter.strategy_selected ?? "-"} | scenes: {selectedChapter.scenes.length}
        </div>
        {String(selectedChapter.status || "").toUpperCase() === "DONE" &&
          String(selectedChapter.operational_state || "").toUpperCase() === "NEEDS_RETRY" ? (
          <div className="mt-2 rounded border border-rose-500/40 bg-rose-900/20 px-2 py-1 text-[11px] text-rose-200">
            DONE but NEEDS_RETRY: split completed, artifact not analysis-ready.
            {selectedChapter.operational_state_reason ? ` (${selectedChapter.operational_state_reason})` : ""}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <span className="rounded border border-[#2A3441] px-2 py-0.5">
            phase: {selectedChapter.prompt_trace_phase || "UNKNOWN"}
          </span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">
            trace: {selectedChapter.prompt_trace_status || "UNKNOWN"}
          </span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">stop: {phaseStopReason}</span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">root_cause: {rootCauseClass}</span>
          <span className="rounded border border-[#2A3441] text-sky-300 px-2 py-0.5 whitespace-nowrap">
            exec {Number.isFinite(executionSec) ? `${Math.round(executionSec!)}s` : "--"}
          </span>
          {rootCauseConfidence !== null ? (
            <span className="rounded border border-[#2A3441] px-2 py-0.5">
              confidence: {Math.round(rootCauseConfidence * 100)}%
            </span>
          ) : null}
          {recommendedActionCode ? (
            <span className="rounded border border-[#2A3441] px-2 py-0.5">action: {recommendedActionCode}</span>
          ) : null}
          {retryProfileUsed ? (
            <span className="rounded border border-[#2A3441] px-2 py-0.5">retry_profile: {retryProfileUsed}</span>
          ) : null}
          {budgetProfile ? (
            <span className="rounded border border-[#2A3441] px-2 py-0.5">budget_profile: {budgetProfile}</span>
          ) : null}
          <span className="rounded border border-[#2A3441] px-2 py-0.5">
            outline {outlineSec.toFixed(2)}s/{outlineBudget.toFixed(0)}s
          </span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">
            primary {primarySec.toFixed(2)}s/{primaryBudget.toFixed(0)}s
          </span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">recursion {recursionSec.toFixed(2)}s</span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">
            repair {repairSec.toFixed(2)}s/{repairBudget.toFixed(0)}s
          </span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">artifact {artifactStatus}</span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">oversized {oversizedCount}</span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">max_chunk_chars {maxChunkCharsObserved}</span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">repair_attempted {repairAttempted ? "yes" : "no"}</span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">repair_exhausted {repairExhausted ? "yes" : "no"}</span>
          <span className="rounded border border-[#2A3441] px-2 py-0.5">
            repaired {Number((repairSummary as Record<string, unknown>).repaired_chunks ?? 0)} / remaining{" "}
            {Number((repairSummary as Record<string, unknown>).remaining_violations ?? 0)}
          </span>
          {selectedChapter.prompt_unavailable_reason ? (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              {selectedChapter.prompt_unavailable_reason}
            </span>
          ) : null}
          {notReadyReason ? (
            <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-200">
              {notReadyReason}
            </span>
          ) : null}
          {degradePathTaken ? (
            <span
              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200"
              title="This split used deterministic fallback due to budget pressure. Manual review recommended."
            >
              Fallback Split (Budget){degradeReasonCode ? `: ${degradeReasonCode}` : ""}
            </span>
          ) : null}
          {deterministicFallbackApplied ? (
            <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">
              Auto-split oversized
            </span>
          ) : null}
        </div>
        <div className="mt-2 rounded border border-[#223247] bg-[#0b1526] px-2 py-1 text-[11px] text-slate-300">
          <span className="text-slate-400">runbook:</span> {runbookHintText(runbookHintCode, { oversizedCount })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="shell-link px-2 py-1 text-xs text-emerald-300 border-emerald-900/50 hover:bg-emerald-950/30"
            onClick={() => state.runSplitAction("approve", selectedChapter.task_id, selectedChapter.scenes)}
            disabled={state.splitActing || selectedChapter.scenes.length === 0}
          >
            Approve
          </button>
          <button
            type="button"
            className="shell-link px-2 py-1 text-xs text-amber-300 border-amber-900/50 hover:bg-amber-950/30"
            onClick={() => state.reprocessSingleChapter(selectedChapter)}
            disabled={state.splitActing}
          >
            Reprocess (Fail)
          </button>
          <button
            type="button"
            className="shell-link px-2 py-1 text-xs"
            onClick={() => state.runAction("retry_task", selectedChapter.task_id)}
            disabled={state.acting || !["FAILED", "RUNNING"].includes(String(selectedChapter.status || "").toUpperCase())}
          >
            Retry Task
          </button>
          {["FAILED", "RUNNING"].includes(String(selectedChapter.status || "").toUpperCase()) ||
            (String(selectedChapter.status || "").toUpperCase() === "DONE" &&
              String(selectedChapter.operational_state || "").toUpperCase() === "NEEDS_RETRY") ? (
            <button
              type="button"
              className="shell-link px-2 py-1 text-xs border-[#9de5dc]/40 text-[#9de5dc]"
              onClick={() => {
                const runtime = selectedChapter.split_runtime ?? {};
                const rootCause = typeof runtime.root_cause_class === "string" ? runtime.root_cause_class : null;
                state.runAction("retry_task", selectedChapter.task_id, { retryProfile: profileForRootCause(rootCause) });
              }}
              disabled={state.splitActing || state.acting}
            >
              Smart Retry
            </button>
          ) : null}
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => state.submitSplitFeedback(selectedChapter)}>
            Submit Feedback
          </button>
        </div>
      </div>

      <JsonPromptTabs
        payload={selectedChapter as unknown as Record<string, unknown>}
        result={selectedChapter as unknown as Record<string, unknown>}
        promptData={extractPrompt({}, {
          hydration_output_text: selectedChapter.hydration_output_text ?? "",
          chunk_prompt_trace: selectedChapter.chunk_prompt_trace ?? [],
          prompt_trace_phase: selectedChapter.prompt_trace_phase ?? "",
          prompt_unavailable_reason: selectedChapter.prompt_unavailable_reason ?? "",
        })}
        scenesData={selectedChapter}
      />

      <div className="rounded border border-[#223247] bg-[#0f172a] p-2 text-xs">
        <StrategyFeedbackForm
          chapter={selectedChapter}
          draft={state.feedbackDraftByTask[selectedChapter.task_id] ?? createDefaultFeedbackDraft()}
          feedbackBusy={Boolean(state.feedbackBusyByTask[selectedChapter.task_id])}
          onUpdateFeedbackDraft={state.updateFeedbackDraft}
          onSubmitSplitFeedback={state.submitSplitFeedback}
          onReprocessChapter={state.reprocessSingleChapter}
          onApproveChapter={(chapterTaskId, chapterScenes) => state.runSplitAction("approve", chapterTaskId, chapterScenes)}
          splitActing={state.splitActing}
          isMature={state.splitDraft?.is_mature}
          tokenKeys={state.tokenKeys}
          taxonomyVersion={state.taxonomyVersion}
          rulePackVersion={state.rulePackVersion}
        />
      </div>
    </>
  );
}
