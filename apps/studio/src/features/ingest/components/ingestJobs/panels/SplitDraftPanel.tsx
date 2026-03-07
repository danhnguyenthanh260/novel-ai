"use client";

import type { ReactNode } from "react";
import type { IngestJob, SplitDraftData } from "@/features/ingest/components/ingestJobs/types";

type SplitDraftSceneCardProps = {
  scene: SplitDraftData["scenes"][number];
  expanded: boolean;
  onToggle: () => void;
};

type SplitDraftPanelProps = {
  selectedJobId: number | null;
  selectedJobStatus: IngestJob["status"] | null;
  splitLoading: boolean;
  splitActing: boolean;
  splitDraft: SplitDraftData | null;
  splitFlagSummary: { total: number; flagged: number; pct: number };
  splitHasManualReview: boolean;
  expandedSceneKeys: string[];
  onLoadSplitDraft: (jobId: number) => void;
  onRunSplitAction: (action: "approve" | "reject") => void;
  onApproveAllSplitChapters: () => void;
  onToggleExpandedScene: (sceneKey: string) => void;
  children: ReactNode;
};

function canApproveSplit(splitActing: boolean, splitDraft: SplitDraftData | null, selectedJobStatus: IngestJob["status"] | null, splitHasManualReview: boolean) {
  if (splitActing) return false;
  if (!splitDraft) return false;
  if (splitDraft.scenes.length === 0) return false;
  if (selectedJobStatus === "APPROVED") return false;
  if (splitHasManualReview) return false;
  return true;
}

function canApproveAll(splitActing: boolean, splitDraft: SplitDraftData | null, splitHasManualReview: boolean) {
  if (splitActing) return false;
  if (!splitDraft) return false;
  if (splitDraft.chapters.length === 0) return false;
  if (splitHasManualReview) return false;
  return true;
}

function canRejectSplit(splitActing: boolean, selectedJobId: number | null, selectedJobStatus: IngestJob["status"] | null) {
  if (splitActing) return false;
  if (!selectedJobId) return false;
  if (selectedJobStatus === "REJECTED") return false;
  return true;
}

function SplitDraftToolbar({
  selectedJobId,
  selectedJobStatus,
  splitLoading,
  splitActing,
  splitDraft,
  splitHasManualReview,
  onLoadSplitDraft,
  onRunSplitAction,
  onApproveAllSplitChapters,
}: Pick<
  SplitDraftPanelProps,
  | "selectedJobId"
  | "selectedJobStatus"
  | "splitLoading"
  | "splitActing"
  | "splitDraft"
  | "splitHasManualReview"
  | "onLoadSplitDraft"
  | "onRunSplitAction"
  | "onApproveAllSplitChapters"
>) {
  const approveEnabled = canApproveSplit(splitActing, splitDraft, selectedJobStatus, splitHasManualReview);
  const approveAllEnabled = canApproveAll(splitActing, splitDraft, splitHasManualReview);
  const rejectEnabled = canRejectSplit(splitActing, selectedJobId, selectedJobStatus);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="shell-link px-2 py-1 text-xs"
        onClick={() => selectedJobId && onLoadSplitDraft(selectedJobId)}
        disabled={splitLoading || !selectedJobId}
      >
        {splitLoading ? "Loading..." : "Refresh Split"}
      </button>
      <button
        type="button"
        className="shell-link px-2 py-1 text-xs"
        onClick={() => onRunSplitAction("approve")}
        disabled={!approveEnabled}
      >
        {splitActing ? "Working..." : "Approve Split"}
      </button>
      <button
        type="button"
        className="shell-link px-2 py-1 text-xs"
        onClick={onApproveAllSplitChapters}
        disabled={!approveAllEnabled}
      >
        {splitActing ? "Working..." : "Approve All"}
      </button>
      <button
        type="button"
        className="shell-link px-2 py-1 text-xs"
        onClick={() => onRunSplitAction("reject")}
        disabled={!rejectEnabled}
      >
        {splitActing ? "Working..." : "Reject Split"}
      </button>
    </div>
  );
}

function SplitQualityWarning({ splitFlagSummary }: Pick<SplitDraftPanelProps, "splitFlagSummary">) {
  if (!(splitFlagSummary.total > 0 && splitFlagSummary.pct >= 15)) return null;
  return (
    <div className="rounded border border-rose-500/40 bg-rose-950/20 px-2 py-1 text-xs text-rose-300">
      Split quality warning: {splitFlagSummary.flagged}/{splitFlagSummary.total} scenes flagged ({splitFlagSummary.pct}%).
      Consider reprocess before Approve All.
    </div>
  );
}

function ManualReviewWarning({ splitHasManualReview }: Pick<SplitDraftPanelProps, "splitHasManualReview">) {
  if (!splitHasManualReview) return null;
  return (
    <div className="rounded border border-amber-500/40 bg-amber-950/20 px-2 py-1 text-xs text-amber-300">
      Supervisor marked at least one chapter as manual review. Approve All is disabled.
    </div>
  );
}

function FeedbackCoverageNotice({ splitDraft }: Pick<SplitDraftPanelProps, "splitDraft">) {
  const health = splitDraft?.feedback_health;
  if (!health) return null;
  const coverage = Number(health.data_coverage_pct ?? 100);
  const mismatch = Number(health.mismatch_feedback ?? 0);
  const modeChanged = Number(health.mode_changed_feedback ?? 0);
  const total = Number(health.total_feedback ?? 0);
  const valid = Number(health.valid_feedback ?? 0);
  const lowCoverage = coverage < 95;
  return (
    <div className={lowCoverage ? "rounded border border-amber-500/40 bg-amber-950/20 px-2 py-1 text-xs text-amber-300" : "rounded border border-emerald-500/40 bg-emerald-950/20 px-2 py-1 text-xs text-emerald-300"}>
      Feedback data coverage: {coverage.toFixed(1)}% ({valid}/{total} valid)
      {mismatch > 0 ? ` | mismatch: ${mismatch}` : ""}
      {modeChanged > 0 ? ` | mode-changed: ${modeChanged}` : ""}
      {lowCoverage ? " | investigate VERSION_MISMATCH before trusting trend charts." : ""}
    </div>
  );
}

function EmptySplitDraftNotice({ splitDraft, splitLoading }: Pick<SplitDraftPanelProps, "splitDraft" | "splitLoading">) {
  if (splitDraft || splitLoading) return null;
  return <div className="muted text-sm">No split draft data.</div>;
}

function SplitDraftSummary({
  splitDraft,
  selectedJobStatus,
  splitLoading,
  splitFlagSummary,
  splitHasManualReview,
}: Pick<
  SplitDraftPanelProps,
  "splitDraft" | "selectedJobStatus" | "splitLoading" | "splitFlagSummary" | "splitHasManualReview"
>) {
  const firstChapter = splitDraft?.chapters?.[0] ?? null;
  return (
    <>
      <div className="muted text-xs">
        status: {splitDraft?.status ?? selectedJobStatus ?? "-"} | chapter chars: {splitDraft?.chapter_text_stats?.chars ?? "-"} | scenes:{" "}
        {splitDraft?.scenes.length ?? 0}
      </div>
      {firstChapter ? (
        <div className="muted text-xs">
          source_doc_id: {firstChapter.source_doc_id ?? "-"} | source_sha: {firstChapter.source_doc_sha256 ?? "-"} | source_type:{" "}
          {firstChapter.source_type ?? "-"} | source_role: {firstChapter.source_role ?? "-"} | strategy:{" "}
          {firstChapter.strategy_selected ?? "-"} | llm: {firstChapter.llm_calls_used ?? "-"} / {firstChapter.llm_calls_budget ?? "-"} | time: {firstChapter.split_runtime?.duration_sec ? `${firstChapter.split_runtime.duration_sec}s` : "-"}
        </div>
      ) : null}
      <SplitQualityWarning splitFlagSummary={splitFlagSummary} />
      <ManualReviewWarning splitHasManualReview={splitHasManualReview} />
      <FeedbackCoverageNotice splitDraft={splitDraft} />
      <EmptySplitDraftNotice splitDraft={splitDraft} splitLoading={splitLoading} />
    </>
  );
}

function SceneExcerpts({ scene }: { scene: SplitDraftData["scenes"][number] }) {
  return (
    <>
      {scene.head_excerpt && (
        <div className="mt-1 text-xs text-slate-300">
          <span className="muted">head:</span> {scene.head_excerpt}
        </div>
      )}
      {scene.tail_excerpt && (
        <div className="mt-1 text-xs text-slate-300">
          <span className="muted">tail:</span> {scene.tail_excerpt}
        </div>
      )}
      {scene.reason && <div className="mt-1 text-xs text-amber-300">reason: {scene.reason}</div>}
      {scene.flags && scene.flags.length > 0 && <div className="mt-1 text-xs text-rose-300">flags: {scene.flags.join(", ")}</div>}
    </>
  );
}

function SceneDebug({ scene }: { scene: SplitDraftData["scenes"][number] }) {
  if ((!scene.boundary_debug || Object.keys(scene.boundary_debug).length === 0) && !scene.scene_text_sha256) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs muted">Boundary debug (basis vs raw)</summary>
      {scene.scene_text_sha256 ? <div className="mt-1 text-xs text-slate-400">scene_sha256: {scene.scene_text_sha256}</div> : null}
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[#223247] bg-[#0b1526] p-2 text-xs text-slate-300">
        {JSON.stringify(scene.boundary_debug, null, 2)}
      </pre>
    </details>
  );
}

function SceneText({ scene, expanded, onToggle }: SplitDraftSceneCardProps) {
  if (!scene.scene_text) return null;
  return (
    <div className="mt-2">
      <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onToggle}>
        {expanded ? "Hide full scene text" : "Show full scene text"}
      </button>
      {expanded && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[#223247] bg-[#0b1526] p-2 text-xs text-slate-200">
          {scene.scene_text}
        </pre>
      )}
    </div>
  );
}

function SplitDraftSceneCard({ scene, expanded, onToggle }: SplitDraftSceneCardProps) {
  return (
    <div className="rounded-lg border border-[#223247] bg-[#0f172a] p-3 text-sm">
      <div className="font-medium">
        Scene {scene.idx} | chars {scene.start}-{scene.end} ({scene.end - scene.start})
      </div>
      <div className="muted text-xs">{scene.title ?? "Untitled scene"}</div>
      {scene.summary && <div className="mt-1 text-sm text-slate-200">{scene.summary}</div>}
      <SceneExcerpts scene={scene} />
      <SceneDebug scene={scene} />
      <SceneText scene={scene} expanded={expanded} onToggle={onToggle} />
    </div>
  );
}

function SplitDraftSceneList({
  splitDraft,
  expandedSceneKeys,
  onToggleExpandedScene,
}: Pick<SplitDraftPanelProps, "splitDraft" | "expandedSceneKeys" | "onToggleExpandedScene">) {
  if (!splitDraft) return null;
  return splitDraft.scenes.map((scene) => {
    const sceneKey = `${scene.idx}-${scene.start}-${scene.end}`;
    return (
      <SplitDraftSceneCard
        key={sceneKey}
        scene={scene}
        expanded={expandedSceneKeys.includes(sceneKey)}
        onToggle={() => onToggleExpandedScene(sceneKey)}
      />
    );
  });
}

export function SplitDraftPanel({
  selectedJobId,
  selectedJobStatus,
  splitLoading,
  splitActing,
  splitDraft,
  splitFlagSummary,
  splitHasManualReview,
  expandedSceneKeys,
  onLoadSplitDraft,
  onRunSplitAction,
  onApproveAllSplitChapters,
  onToggleExpandedScene,
  children,
}: SplitDraftPanelProps) {
  return (
    <section className="surface-card">
      <div className="flex items-center justify-between border-b border-[#223247] px-4 py-3 text-sm font-medium">
        <span>Split Draft Preview {selectedJobId ? `(job #${selectedJobId})` : ""}</span>
        <SplitDraftToolbar
          selectedJobId={selectedJobId}
          selectedJobStatus={selectedJobStatus}
          splitLoading={splitLoading}
          splitActing={splitActing}
          splitDraft={splitDraft}
          splitHasManualReview={splitHasManualReview}
          onLoadSplitDraft={onLoadSplitDraft}
          onRunSplitAction={onRunSplitAction}
          onApproveAllSplitChapters={onApproveAllSplitChapters}
        />
      </div>
      <div className="grid gap-2 p-4">
        <SplitDraftSummary
          splitDraft={splitDraft}
          selectedJobStatus={selectedJobStatus}
          splitLoading={splitLoading}
          splitFlagSummary={splitFlagSummary}
          splitHasManualReview={splitHasManualReview}
        />
        <SplitDraftSceneList
          splitDraft={splitDraft}
          expandedSceneKeys={expandedSceneKeys}
          onToggleExpandedScene={onToggleExpandedScene}
        />
        {children}
      </div>
    </section>
  );
}
