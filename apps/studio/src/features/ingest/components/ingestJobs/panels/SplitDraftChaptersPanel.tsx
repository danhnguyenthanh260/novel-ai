"use client";

import { createDefaultFeedbackDraft } from "@/features/ingest/components/ingestJobs/mappers";
import type { FeedbackDraft, IngestJob, SplitDraftData, SplitDraftScene, WorkerStatus } from "@/features/ingest/components/ingestJobs/types";
import { StrategyFeedbackForm } from "@/features/ingest/components/ingestJobs/panels/splitDraftChapters/StrategyFeedbackForm";

type ChapterProgress = Record<
  number,
  {
    total: number;
    ready: number;
    running: number;
    done: number;
    failed: number;
  }
>;

type SplitDraftChapter = SplitDraftData["chapters"][number];

type SplitDraftChaptersPanelProps = {
  splitDraft: SplitDraftData | null;
  splitActing: boolean;
  selectedJobStatus: IngestJob["status"] | null;
  sceneProgressByChapterTask: ChapterProgress;
  workerStatus: WorkerStatus | null;
  feedbackBusyByTask: Record<number, boolean>;
  feedbackDraftByTask: Record<number, FeedbackDraft>;
  onApproveChapter: (chapterTaskId: number, chapterScenes: SplitDraftScene[]) => void;
  onUpdateFeedbackDraft: (taskId: number, patch: Partial<FeedbackDraft>) => void;
  onSubmitSplitFeedback: (chapter: SplitDraftChapter) => void;
  onReprocessChapter: (chapter: SplitDraftChapter) => void;
  tokenKeys: string[];
  taxonomyVersion: string;
  rulePackVersion: string;
};

function workerChecklistItem(workerStatus: WorkerStatus | null) {
  const monolithicRunning = Boolean(workerStatus?.running);
  const splitRunning = Boolean(workerStatus?.lanes?.find((l) => l.lane === "split" || l.lane === "all")?.running);
  const workerRunning = monolithicRunning || splitRunning;
  return { ok: workerRunning, text: workerRunning ? "Worker is running" : "Worker is not running" };
}

function sourceDocChecklistItem(chapter: SplitDraftChapter) {
  const hasSourceDoc = Boolean(chapter.source_doc_id && chapter.source_doc_id.trim().length > 0);
  return { ok: hasSourceDoc, text: hasSourceDoc ? "Source document linked" : "Missing source_doc link" };
}

function llmChecklistItem(chapter: SplitDraftChapter) {
  const llmUsed = Number(chapter.llm_calls_used ?? 0);
  const chapterDone = chapter.status === "DONE";
  const text = chapterDone ? (llmUsed > 0 ? `LLM used (${llmUsed} calls)` : "LLM calls are zero") : "LLM check pending (task not DONE)";
  return { ok: !chapterDone || llmUsed > 0, text };
}

function densityChecklistItem(chapter: SplitDraftChapter) {
  const chars = Number(chapter.chapter_text_stats?.chars ?? 0);
  const scenes = chapter.scenes.length;
  const nonDegenerate = !(chapter.split_mode === "auto" && chars >= 5000 && scenes <= 1);
  return { ok: nonDegenerate, text: nonDegenerate ? "Scene density looks valid" : "Long chapter collapsed to 1 scene (degenerate split)" };
}

function buildChecklist(chapter: SplitDraftChapter, workerStatus: WorkerStatus | null) {
  return [
    workerChecklistItem(workerStatus),
    sourceDocChecklistItem(chapter),
    llmChecklistItem(chapter),
    densityChecklistItem(chapter),
  ];
}

function PreApproveChecklist({
  chapter,
  workerStatus,
}: {
  chapter: SplitDraftChapter;
  workerStatus: WorkerStatus | null;
}) {
  const checklist = buildChecklist(chapter, workerStatus);

  return (
    <div className="mt-1 rounded border border-[#223247] bg-[#0b1526] p-2 text-xs">
      <div className="font-medium text-slate-200">Pre-Approve Checklist</div>
      <div className="mt-1 grid gap-1">
        {checklist.map((item, idx) => (
          <div key={`${chapter.task_id}-check-${idx}`} className={item.ok ? "text-emerald-300" : "text-rose-300"}>
            {item.ok ? "PASS" : "FAIL"} | {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChapterHeader({
  chapter,
  splitActing,
  selectedJobStatus,
  chapterProgress,
  onApproveChapter,
}: {
  chapter: SplitDraftChapter;
  splitActing: boolean;
  selectedJobStatus: IngestJob["status"] | null;
  chapterProgress: ChapterProgress[number] | undefined;
  onApproveChapter: (chapterTaskId: number, chapterScenes: SplitDraftScene[]) => void;
}) {
  const alreadyApproved = Boolean(chapterProgress && chapterProgress.total > 0);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 font-medium">
        chapter task #{chapter.task_id} | seq {chapter.seq_no} | {chapter.status}
        {chapter.is_stable && (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
            STABLE v{chapter.version}
          </span>
        )}
      </div>
      <button
        type="button"
        className="shell-link px-2 py-1 text-xs"
        onClick={() => onApproveChapter(chapter.task_id, chapter.scenes)}
        disabled={
          splitActing ||
          chapter.scenes.length === 0 ||
          chapter.supervisor_decision === "manual_review" ||
          alreadyApproved ||
          selectedJobStatus === "CANCELLED" ||
          selectedJobStatus === "DONE"
        }
      >
        {alreadyApproved ? "Approved" : "Approve Chapter"}
      </button>
    </div>
  );
}

function ChapterMeta({ chapter }: { chapter: SplitDraftChapter }) {
  return (
    <>
      <div className="muted text-xs">
        {chapter.chapter_title ? `title: ${chapter.chapter_title} | ` : ""}
        mode: {chapter.split_mode} | basis: {chapter.text_basis ?? "unknown"} | chars: {chapter.chapter_text_stats?.chars ?? "-"} | scenes: {chapter.scenes.length}
        {chapter.source_path ? ` | source: ${chapter.source_path}` : ""}
      </div>
      <div className="muted text-xs">
        source_doc_id: {chapter.source_doc_id ?? "-"} | source_sha: {chapter.source_doc_sha256 ?? "-"} | source_type: {chapter.source_type ?? "-"} |
        source_role: {chapter.source_role ?? "-"} | strategy: {chapter.strategy_selected ?? "-"} | llm: {chapter.llm_calls_used ?? "-"} / {chapter.llm_calls_budget ?? "-"}
      </div>
      {chapter.split_controls && Object.keys(chapter.split_controls).length > 0 && (
        <div className="muted text-xs">
          controls: self_healing={String(chapter.split_controls.self_healing_enabled ?? true)} | auto_retry=
          {String(chapter.split_controls.auto_retry_enabled ?? true)} | max_llm_calls={String(chapter.split_controls.max_llm_calls ?? "-")}
        </div>
      )}
    </>
  );
}

function ChapterQualityReport({ chapter }: { chapter: SplitDraftChapter }) {
  if (!chapter.quality_report) return null;
  return (
    <div className="muted text-xs">
      quality: flagged {String(chapter.quality_report.scene_flagged ?? "-")} / {String(chapter.quality_report.scene_total ?? "-")} (
      {String(chapter.quality_report.flagged_pct ?? "-")}%)
      {` | frag_score=${String(chapter.quality_report.fragmentation_score ?? "-")}`}
      {` | short_ratio=${String(chapter.quality_report.short_scene_ratio ?? "-")}`}
      {chapter.autofix_report
        ? ` | autofix moved=${String(chapter.autofix_report.moved ?? 0)} merged=${String(chapter.autofix_report.merged ?? 0)}`
        : ""}
    </div>
  );
}

function ChapterQualityDelta({ chapter }: { chapter: SplitDraftChapter }) {
  if (!(chapter.quality_delta && Object.keys(chapter.quality_delta).length > 0)) return null;
  return (
    <div className="muted text-xs">
      delta: flagged_pct={String(chapter.quality_delta.flagged_pct ?? 0)} | mid_word_cut={String(chapter.quality_delta.mid_word_cut_count ?? 0)} |
      abbrev/name={String(chapter.quality_delta.abbrev_or_name_cut_count ?? 0)} | frag={String(chapter.quality_delta.fragmentation_score ?? 0)}
    </div>
  );
}

function ChapterQuality({ chapter }: { chapter: SplitDraftChapter }) {
  return (
    <>
      <ChapterQualityReport chapter={chapter} />
      <ChapterQualityDelta chapter={chapter} />
    </>
  );
}

function ChapterStatusBadges({ chapter }: { chapter: SplitDraftChapter }) {
  const reasonCodes = Array.isArray(chapter.decision_reason_codes) ? chapter.decision_reason_codes : [];
  return (
    <>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span
          className={
            chapter.safe_to_approve
              ? "rounded border border-emerald-500/40 bg-emerald-950/20 px-2 py-0.5 text-emerald-300"
              : "rounded border border-amber-500/40 bg-amber-950/20 px-2 py-0.5 text-amber-300"
          }
        >
          {chapter.safe_to_approve ? "Safe to Approve" : "Needs Reprocess"}
        </span>
        <span
          className={
            chapter.hard_fail
              ? "rounded border border-rose-500/40 bg-rose-950/20 px-2 py-0.5 text-rose-300"
              : "rounded border border-slate-500/40 bg-slate-900/20 px-2 py-0.5 text-slate-300"
          }
        >
          {chapter.hard_fail ? "Hard-fail" : "Soft-score"}
        </span>
        {reasonCodes.length > 0 ? <span className="muted">reason_codes: {reasonCodes.join(", ")}</span> : null}
        {!reasonCodes.length && chapter.rerun_reason ? <span className="muted">reason: {chapter.rerun_reason}</span> : null}
      </div>
      <div className="muted text-xs">
        supervisor: {chapter.supervisor_decision ?? "auto_pass"}
        {chapter.supervisor_retry_used ? " | retry used: yes" : ""}
      </div>
    </>
  );
}

function ChapterEvidenceChain({ chapter }: { chapter: SplitDraftChapter }) {
  const chunkTraceCount = Array.isArray(chapter.chunk_prompt_trace) ? chapter.chunk_prompt_trace.length : 0;
  const boundaryEvidenceCount = Array.isArray(chapter.boundary_evidence) ? chapter.boundary_evidence.length : 0;
  const contextWindow = chapter.context_window && typeof chapter.context_window === "object" ? chapter.context_window : {};
  const approvedIds = Array.isArray(contextWindow.approved_context_ids) ? contextWindow.approved_context_ids : [];
  const goldenIds = Array.isArray(contextWindow.golden_chapter_ids) ? contextWindow.golden_chapter_ids : [];
  const pacingMetadata =
    contextWindow.pacing_metadata && typeof contextWindow.pacing_metadata === "object" ? contextWindow.pacing_metadata : {};
  const decisionEvidence = chapter.decision_evidence && typeof chapter.decision_evidence === "object" ? chapter.decision_evidence : {};
  const decisionReasonCodes = Array.isArray(decisionEvidence.reason_codes)
    ? decisionEvidence.reason_codes.map((x) => String(x)).filter((x) => x.trim().length > 0)
    : Array.isArray(chapter.decision_reason_codes)
      ? chapter.decision_reason_codes
      : [];

  return (
    <details className="mt-1 rounded border border-[#223247] bg-[#0b1526] p-2 text-xs">
      <summary className="cursor-pointer font-medium text-slate-200">
        evidence chain | prompt v{chapter.prompt_version_id ?? "-"} | trace {chunkTraceCount} | boundaries {boundaryEvidenceCount}
      </summary>
      <div className="mt-1 muted text-xs">
        hydration hash: {chapter.hydration_output_hash ?? "-"} | approved_ctx: {approvedIds.length} | golden_ctx: {goldenIds.length} | pacing keys:{" "}
        {Object.keys(pacingMetadata).length}
      </div>
      <div className="mt-1 muted text-xs">
        context hash: {chapter.context_hash ?? String(decisionEvidence.context_hash ?? "-")} | ctx_pack:{" "}
        {chapter.context_pack_version ?? String(decisionEvidence.context_pack_version ?? "-")} | pref_rule:{" "}
        {chapter.preference_rule_version ?? String(decisionEvidence.preference_rule_version ?? "-")}
      </div>
      <div className="mt-1 muted text-xs">
        decision: strategy={String(decisionEvidence.strategy_selected ?? chapter.strategy_selected ?? "-")} | safe=
        {String(decisionEvidence.safe_to_approve ?? chapter.safe_to_approve ?? false)} | hard_fail=
        {String(decisionEvidence.hard_fail ?? chapter.hard_fail ?? false)} | supervisor=
        {String(decisionEvidence.supervisor_decision ?? chapter.supervisor_decision ?? "-")}
      </div>
      <div className="mt-1 muted text-xs">reason_codes: {decisionReasonCodes.length > 0 ? decisionReasonCodes.join(", ") : "-"}</div>
      {chapter.hydration_output_text ? (
        <details className="mt-1">
          <summary className="cursor-pointer muted text-xs">hydration output text</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[#223247] bg-[#0a1220] p-2 text-[11px] text-slate-300">
            {chapter.hydration_output_text}
          </pre>
        </details>
      ) : null}
      <details className="mt-1">
        <summary className="cursor-pointer muted text-xs">context vetting snapshot</summary>
        <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded border border-[#223247] bg-[#0a1220] p-2 text-[11px] text-slate-300">
          {JSON.stringify(chapter.context_window ?? {}, null, 2)}
        </pre>
      </details>
      <details className="mt-1">
        <summary className="cursor-pointer muted text-xs">boundary evidence</summary>
        <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded border border-[#223247] bg-[#0a1220] p-2 text-[11px] text-slate-300">
          {JSON.stringify(chapter.boundary_evidence ?? [], null, 2)}
        </pre>
      </details>
    </details>
  );
}

function ChapterCard({
  chapter,
  splitActing,
  selectedJobStatus,
  sceneProgressByChapterTask,
  workerStatus,
  feedbackBusyByTask,
  feedbackDraftByTask,
  onApproveChapter,
  onUpdateFeedbackDraft,
  onSubmitSplitFeedback,
  onReprocessChapter,
  tokenKeys,
  taxonomyVersion,
  rulePackVersion,
  isMature,
}: {
  chapter: SplitDraftChapter;
  splitActing: boolean;
  selectedJobStatus: IngestJob["status"] | null;
  sceneProgressByChapterTask: ChapterProgress;
  workerStatus: WorkerStatus | null;
  feedbackBusyByTask: Record<number, boolean>;
  feedbackDraftByTask: Record<number, FeedbackDraft>;
  onApproveChapter: (chapterTaskId: number, chapterScenes: SplitDraftScene[]) => void;
  onUpdateFeedbackDraft: (taskId: number, patch: Partial<FeedbackDraft>) => void;
  onSubmitSplitFeedback: (chapter: SplitDraftChapter) => void;
  onReprocessChapter: (chapter: SplitDraftChapter) => void;
  tokenKeys: string[];
  taxonomyVersion: string;
  rulePackVersion: string;
  isMature?: boolean;
}) {
  const chapterProgress = sceneProgressByChapterTask[chapter.task_id];
  const showStrategyPanel = Boolean(chapter.strategy_selected || (chapter.strategy_attempts && chapter.strategy_attempts.length > 0));
  const draft = feedbackDraftByTask[chapter.task_id] ?? createDefaultFeedbackDraft();

  return (
    <div className="rounded-lg border border-[#223247] bg-[#0f172a] p-3 text-sm">
      <ChapterHeader
        chapter={chapter}
        splitActing={splitActing}
        selectedJobStatus={selectedJobStatus}
        chapterProgress={chapterProgress}
        onApproveChapter={onApproveChapter}
      />
      <ChapterMeta chapter={chapter} />
      <PreApproveChecklist chapter={chapter} workerStatus={workerStatus} />
      <ChapterQuality chapter={chapter} />
      <ChapterStatusBadges chapter={chapter} />
      <ChapterEvidenceChain chapter={chapter} />
      {showStrategyPanel && (
        <div className="mt-1 rounded border border-[#223247] bg-[#0b1526] p-2 text-xs">
          <div className="font-medium text-slate-200">strategy selected: {chapter.strategy_selected ?? "unknown"}</div>
          <StrategyFeedbackForm
            chapter={chapter}
            draft={draft}
            feedbackBusy={Boolean(feedbackBusyByTask[chapter.task_id])}
            onUpdateFeedbackDraft={onUpdateFeedbackDraft}
            onSubmitSplitFeedback={onSubmitSplitFeedback}
            onReprocessChapter={onReprocessChapter}
            onApproveChapter={onApproveChapter}
            splitActing={splitActing}
            isMature={isMature}
            tokenKeys={tokenKeys}
            taxonomyVersion={taxonomyVersion}
            rulePackVersion={rulePackVersion}
          />
        </div>
      )}
      <div className="muted mt-1 text-xs">
        scene tasks: {chapterProgress ? `${chapterProgress.done}/${chapterProgress.total} done` : "not enqueued"}
        {chapterProgress ? ` | running: ${chapterProgress.running} | queued: ${chapterProgress.ready} | failed: ${chapterProgress.failed}` : ""}
      </div>
    </div>
  );
}

export function SplitDraftChaptersPanel({
  splitDraft,
  splitActing,
  selectedJobStatus,
  sceneProgressByChapterTask,
  workerStatus,
  feedbackBusyByTask,
  feedbackDraftByTask,
  onApproveChapter,
  onUpdateFeedbackDraft,
  onSubmitSplitFeedback,
  onReprocessChapter,
  tokenKeys,
  taxonomyVersion,
  rulePackVersion,
}: SplitDraftChaptersPanelProps) {
  if (!splitDraft?.chapters.length) return null;

  return (
    <div className="grid gap-2 pt-2">
      <div className="text-sm font-medium">By Chapter Task</div>
      {splitDraft.chapters.map((chapter) => (
        <ChapterCard
          key={chapter.task_id}
          chapter={chapter}
          splitActing={splitActing}
          selectedJobStatus={selectedJobStatus}
          sceneProgressByChapterTask={sceneProgressByChapterTask}
          workerStatus={workerStatus}
          feedbackBusyByTask={feedbackBusyByTask}
          feedbackDraftByTask={feedbackDraftByTask}
          onApproveChapter={onApproveChapter}
          onUpdateFeedbackDraft={onUpdateFeedbackDraft}
          onSubmitSplitFeedback={onSubmitSplitFeedback}
          onReprocessChapter={onReprocessChapter}
          tokenKeys={tokenKeys}
          taxonomyVersion={taxonomyVersion}
          rulePackVersion={rulePackVersion}
          isMature={splitDraft.is_mature}
        />
      ))}
    </div>
  );
}
