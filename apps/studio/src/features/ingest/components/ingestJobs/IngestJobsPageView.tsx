"use client";

import Link from "next/link";
import { CanonicalSourcePanel } from "@/features/ingest/components/ingestJobs/panels/CanonicalSourcePanel";
import { ReprocessChaptersPanel } from "@/features/ingest/components/ingestJobs/panels/ReprocessChaptersPanel";
import { SplitterCompactPanel } from "@/features/ingest/components/ingestJobs/panels/SplitterCompactPanel";
import { UploadSourcePanel } from "@/features/ingest/components/ingestJobs/panels/UploadSourcePanel";
import { ValidateDataPanel } from "@/features/ingest/components/ingestJobs/panels/ValidateDataPanel";
import { WorkerLogViewer } from "@/features/ingest/components/ingestJobs/panels/WorkerLogViewer";
import type { IngestJobsControllerState } from "@/features/ingest/hooks/useIngestJobsController";

function workerStatusText(state: IngestJobsControllerState) {
  if (!state.workerStatus) return "unknown";
  if (state.workerStatus.running) {
    return `running${state.workerStatus.pid ? ` (pid ${state.workerStatus.pid})` : ""}`;
  }
  return state.workerStatus.enabled ? "stopped" : "disabled";
}

function splitLaneStatus(state: IngestJobsControllerState) {
  return state.workerStatus?.lanes?.find((lane) => lane.lane === "split")?.running ? "running" : "off";
}

function llmStatusText(detail: string | undefined) {
  const normalized = detail?.toLowerCase() ?? "";
  if (normalized.includes("ready")) return "ready";
  if (normalized.includes("offline")) return "offline";
  return "unknown";
}

function workerTone(workerState: string) {
  if (workerState.includes("running")) return "ok";
  if (workerState === "disabled") return "warn";
  return "muted";
}

function llmTone(llmState: string) {
  if (llmState === "ready") return "ok";
  if (llmState === "offline") return "bad";
  return "muted";
}

type IngestJobsPageViewProps = {
  storySlug: string;
  state: IngestJobsControllerState;
};

type HeaderProps = {
  storySlug: string;
  state: IngestJobsControllerState;
  lastUpdatedAt: string;
};

function statusChip(label: string, value: string, tone: "ok" | "warn" | "bad" | "muted" = "muted") {
  const toneClass =
    tone === "ok"
      ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200"
      : tone === "warn"
        ? "border-amber-700/50 bg-amber-950/30 text-amber-200"
        : tone === "bad"
          ? "border-rose-700/50 bg-rose-950/30 text-rose-200"
          : "border-slate-700/50 bg-slate-900/40 text-slate-300";
  return (
    <div className={`inline-flex min-w-[160px] items-center justify-between rounded border px-2 py-1 text-xs ${toneClass}`}>
      <span className="opacity-80">{label}</span>
      <span className="ml-2 font-medium">{value}</span>
    </div>
  );
}

function HeaderActions({ storySlug, state }: Pick<HeaderProps, "storySlug" | "state">) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <button type="button" className="shell-link min-w-[110px] px-3 py-2 text-sm" onClick={state.loadJobs} disabled={state.loading}>
        {state.loading ? "Refreshing" : "Refresh"}
      </button>
      {state.selectedJobId ? (
        <Link href={`/stories/${encodeURIComponent(storySlug)}/pipelines/${state.selectedJobId}`} className="shell-link min-w-[110px] px-3 py-2 text-center text-sm">
          Pipeline View
        </Link>
      ) : null}
      <Link href={`/stories/${encodeURIComponent(storySlug)}/ingest/maturity`} className="shell-link min-w-[110px] px-3 py-2 text-center text-sm">
        Maturity
      </Link>
    </div>
  );
}

function IngestJobsHeader({ storySlug, state, lastUpdatedAt }: HeaderProps) {
  const workerState = workerStatusText(state);
  const splitLaneState = splitLaneStatus(state);
  const llmState = llmStatusText(state.workerStatus?.detail);

  return (
    <div className="surface-card sticky top-0 z-20 p-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Splitter Console</h1>
            <div className="muted text-xs">
              story: {storySlug}
              {state.selectedJobId ? ` | job #${state.selectedJobId}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusChip("worker", workerState, workerTone(workerState))}
            {statusChip("split lane", splitLaneState, splitLaneState === "running" ? "ok" : "warn")}
            {statusChip("llm", llmState, llmTone(llmState))}
            {statusChip("last updated", lastUpdatedAt, "muted")}
          </div>
          {state.workerStatus?.detail ? <div className="muted text-xs">{state.workerStatus.detail}</div> : null}
        </div>
        <HeaderActions storySlug={storySlug} state={state} />
      </div>
    </div>
  );
}

type StatusMessageProps = {
  error: string | null;
  uploadInfo: string | null;
};

function IngestJobsStatusMessages({ error, uploadInfo }: StatusMessageProps) {
  return (
    <>
      {error && <div className="text-sm text-[#ff8f8f]">{error}</div>}
      {uploadInfo && <div className="text-sm text-emerald-300">{uploadInfo}</div>}
    </>
  );
}

type ValidateSectionProps = {
  state: IngestJobsControllerState;
};

function IngestJobsValidateSection({ state }: ValidateSectionProps) {
  const status = String(state.selectedJob?.status || "");
  const hasChapterIngestTask = state.tasks.some((t) => String(t.task_type || "") === "CHAPTER_INGEST");
  const showValidatePanel =
    status === "AWAITING_DATA_APPROVAL" ||
    ((status === "RUNNING" || status === "SPLIT_DRAFT") && hasChapterIngestTask);
  if (!showValidatePanel) return null;
  return (
    <ValidateDataPanel
      jobId={state.selectedJobId}
      validateReports={state.validateReports}
      customRules={state.customRules}
      validateLoading={state.validateLoading}
      validateActing={state.validateActing}
      onApproveData={state.approveChapterData}
      onApproveChapter={state.approveIngestChapter}
      onRejectData={state.rejectChapterData}
      onAddRule={state.addValidateRule}
    />
  );
}

function IngestJobsOperatorSection({ storySlug, state }: IngestJobsPageViewProps) {
  return (
    <details className="surface-card p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-200">Operator controls</summary>
      <div className="mt-3 grid gap-3">
        <section className="rounded border border-[#223247] bg-[#0b1526] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-slate-200">Runtime controls</div>
              <div className="muted mt-1 text-xs">Use these only when worker or local model runtime needs intervention.</div>
            </div>
            <Link href={`/stories/${encodeURIComponent(storySlug)}/ingest/maturity`} className="shell-link px-3 py-2 text-center text-xs">
              Open Maturity
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => state.runWorkerAction("start")} disabled={state.workerBusy}>
              Start Worker
            </button>
            <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => state.runWorkerAction("restart")} disabled={state.workerBusy}>
              Restart Worker
            </button>
            <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => state.runWorkerAction("stop")} disabled={state.workerBusy}>
              Stop Worker
            </button>
            <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => state.runWorkerAction("start_llama")} disabled={state.workerBusy}>
              Start Llama
            </button>
            <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => state.runWorkerAction("kill")} disabled={state.workerBusy}>
              Kill Worker
            </button>
            <button type="button" className="shell-link px-3 py-2 text-xs" onClick={state.rebuildGlobalProfile} disabled={state.rebuildGlobalBusy}>
              {state.rebuildGlobalBusy ? "Rebuilding..." : "Rebuild Global Profile"}
            </button>
          </div>
        </section>
        <ReprocessChaptersPanel
          existingChapters={state.existingChapters}
          selectedChapterIds={state.selectedChapterIds}
          reprocessReasonCode={state.reprocessReasonCode}
          onSetReprocessReasonCode={state.setReprocessReasonCode}
          reprocessNote={state.reprocessNote}
          onSetReprocessNote={state.setReprocessNote}
          forcedStrategy={state.forcedStrategy}
          onSetForcedStrategy={state.setForcedStrategy}
          onSelectAll={state.selectAllChapters}
          onClear={state.clearSelectedChapters}
          onRefreshChapters={state.loadExistingChapters}
          onToggleChapter={state.toggleChapterSelection}
          onRunReprocess={state.runReprocessSelectedChapters}
          reprocessRunning={state.reprocessRunning}
        />
        <CanonicalSourcePanel
          sourceDocs={state.sourceDocs}
          sourceDocsLoading={state.sourceDocsLoading}
          canonicalBusyId={state.canonicalBusyId}
          onRefreshSources={state.loadSourceDocs}
          onSetCanonicalSourceDoc={state.setCanonicalSourceDoc}
        />
        <WorkerLogViewer baseUrl={state.baseUrl} />
      </div>
    </details>
  );
}

export function IngestJobsPageView({ storySlug, state }: IngestJobsPageViewProps) {
  const lastUpdatedAt = new Date().toLocaleTimeString();

  return (
    <main className="space-y-4 p-2 md:p-4">
      <IngestJobsHeader storySlug={storySlug} state={state} lastUpdatedAt={lastUpdatedAt} />
      <IngestJobsStatusMessages error={state.error} uploadInfo={state.uploadInfo} />
      <UploadSourcePanel
        uploadMode={state.uploadMode}
        setUploadMode={state.setUploadMode}
        splitMode={state.splitMode}
        setSplitMode={state.setSplitMode}
        reviewMode={state.reviewMode}
        setReviewMode={state.setReviewMode}
        selfHealingEnabled={state.selfHealingEnabled}
        setSelfHealingEnabled={state.setSelfHealingEnabled}
        autoRetryEnabled={state.autoRetryEnabled}
        setAutoRetryEnabled={state.setAutoRetryEnabled}
        validateBeforeSplit={state.validateBeforeSplit}
        setValidateBeforeSplit={state.setValidateBeforeSplit}
        maxLlmCalls={state.maxLlmCalls}
        setMaxLlmCalls={state.setMaxLlmCalls}
        createdBy={state.createdBy}
        setCreatedBy={state.setCreatedBy}
        setZipFile={state.setZipFile}
        setMegaFile={state.setMegaFile}
        pastedName={state.pastedName}
        setPastedName={state.setPastedName}
        pastedChapterNo={state.pastedChapterNo}
        setPastedChapterNo={state.setPastedChapterNo}
        pastedText={state.pastedText}
        setPastedText={state.setPastedText}
        uploading={state.uploading}
        onValidateUpload={state.validateUpload}
        onCreateIngestJob={state.createJobFromUpload}
      />
      <IngestJobsOperatorSection storySlug={storySlug} state={state} />

      <SplitterCompactPanel state={state} />

      <IngestJobsValidateSection state={state} />
      <section className="surface-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-slate-200">Job Paging</div>
          <div className="muted text-xs">
            page {state.jobsPage}/{state.jobsPageCount} | showing {state.jobs.length} / total {state.jobsTotal}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={state.prevJobsPage} disabled={state.loading || !state.jobsHasPrev}>
            Prev
          </button>
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={state.nextJobsPage} disabled={state.loading || !state.jobsHasNext}>
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
