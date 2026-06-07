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

function dbStatusText(state: IngestJobsControllerState) {
  const readiness = state.workerStatus?.readiness;
  if (!readiness) return "unknown";
  return readiness.ok ? "ready" : `missing ${readiness.missing_tables.length}`;
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

function dbTone(dbState: string) {
  if (dbState === "ready") return "ok";
  if (dbState.startsWith("missing")) return "bad";
  return "muted";
}

type IngestJobsPageViewProps = {
  storySlug: string;
  state: IngestJobsControllerState;
};

type AuthorNextAction = {
  label: string;
  body: string;
  href: string;
  tone: "ready" | "active" | "blocked";
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
  const dbState = dbStatusText(state);
  const missingTables = state.workerStatus?.readiness?.missing_tables ?? [];
  const migrationHint = state.workerStatus?.readiness?.hint;
  const dbError = state.workerStatus?.readiness?.error;

  return (
    <div className="surface-card sticky top-0 z-20 p-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Source Setup</h1>
            <div className="muted text-xs">
              Add source material for {storySlug}
              {state.selectedJobId ? ` | job #${state.selectedJobId}` : ""}
            </div>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-secondary)]">Runtime status</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {statusChip("worker", workerState, workerTone(workerState))}
              {statusChip("split lane", splitLaneState, splitLaneState === "running" ? "ok" : "warn")}
              {statusChip("db", dbState, dbTone(dbState))}
              {statusChip("llm", llmState, llmTone(llmState))}
              {statusChip("last updated", lastUpdatedAt, "muted")}
            </div>
            {state.workerStatus?.detail ? <div className="muted mt-2 text-xs">{state.workerStatus.detail}</div> : null}
            {missingTables.length > 0 ? (
              <div className="mt-2 rounded border border-rose-700/40 bg-rose-950/20 p-2 text-xs leading-5 text-rose-100">
                DB migration incomplete. Missing: {missingTables.join(", ")}.
                {migrationHint ? <span className="ml-1">{migrationHint}</span> : null}
                {dbError ? <div className="mt-1 text-rose-100/80">{dbError}</div> : null}
              </div>
            ) : null}
          </details>
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

function selectedJobLabel(state: IngestJobsControllerState): string {
  return `Job #${state.selectedJobId ?? "-"}`;
}

function selectedJobPipelineHref(storySlug: string, state: IngestJobsControllerState): string {
  if (!state.selectedJobId) return "#ingest-diagnostics";
  return `/stories/${encodeURIComponent(storySlug)}/pipelines/${state.selectedJobId}`;
}

function actionForAttentionState(state: IngestJobsControllerState): AuthorNextAction | null {
  if (state.error) {
    return {
      label: "Review ingest issue",
      body: "The current ingest run needs attention. Check the selected job and open diagnostics only if recovery details are needed.",
      href: "#ingest-work",
      tone: "blocked",
    };
  }
  if (state.jobsTotal === 0) {
    return {
      label: "Add source material",
      body: "Upload, paste, or import source text so Studio can validate and split chapters before analysis.",
      href: "#source-material",
      tone: "ready",
    };
  }
  return null;
}

function actionForJobStatus(storySlug: string, status: string, state: IngestJobsControllerState): AuthorNextAction | null {
  const jobLabel = selectedJobLabel(state);
  const pipelineHref = selectedJobPipelineHref(storySlug, state);
  const dbBlocked = state.workerStatus?.readiness && !state.workerStatus.readiness.ok;
  const workerBlocked = state.workerStatus && !state.workerStatus.running;
  const progressBody = dbBlocked
    ? `${jobLabel} cannot advance because DB migrations are incomplete. Open diagnostics and run the migration command.`
    : workerBlocked
      ? `${jobLabel} is queued, but the worker is not running. Open diagnostics to start the worker or inspect runtime details.`
      : `${jobLabel} is processing. Open Pipeline View to inspect task-level progress.`;
  const progressHref = workerBlocked || dbBlocked ? "#ingest-diagnostics" : pipelineHref;
  const byStatus: Partial<Record<string, AuthorNextAction>> = {
    AWAITING_DATA_APPROVAL: {
      label: "Review source validation",
      body: `${jobLabel} is waiting for chapter data approval before split work continues.`,
      href: "#validation-review",
      tone: "active",
    },
    SPLIT_DRAFT: {
      label: "Review split output",
      body: `${jobLabel} has split draft material ready for author review and approval.`,
      href: "#split-review",
      tone: "active",
    },
    AWAIT_APPROVAL: {
      label: "Review split output",
      body: `${jobLabel} has split draft material ready for author review and approval.`,
      href: "#split-review",
      tone: "active",
    },
    RUNNING: {
      label: "Monitor progress",
      body: progressBody,
      href: progressHref,
      tone: "active",
    },
    PENDING: {
      label: "Monitor progress",
      body: progressBody,
      href: progressHref,
      tone: "active",
    },
    FAILED: {
      label: "Inspect failed job",
      body: `${jobLabel} failed. Use the selected job details first, then diagnostics if retry context is needed.`,
      href: "#ingest-diagnostics",
      tone: "blocked",
    },
  };
  return byStatus[status] ?? null;
}

function buildAuthorNextAction(storySlug: string, state: IngestJobsControllerState): AuthorNextAction {
  const status = String(state.selectedJob?.status || "").toUpperCase();
  const attentionAction = actionForAttentionState(state);
  if (attentionAction) return attentionAction;
  const statusAction = actionForJobStatus(storySlug, status, state);
  if (statusAction) return statusAction;
  return {
    label: "Continue to analysis",
    body: "Ingest has recent output. Continue with analysis when the approved source material is ready.",
    href: `/stories/${encodeURIComponent(storySlug)}/analysis`,
    tone: "ready",
  };
}

function actionToneClass(tone: AuthorNextAction["tone"]) {
  if (tone === "blocked") return "border-rose-700/50 bg-rose-950/30 text-rose-100";
  if (tone === "active") return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  return "border-[#2f5b58] bg-[#123331] text-[#c9fff1]";
}

function IngestAuthorNextAction({ storySlug, state }: IngestJobsPageViewProps) {
  const action = buildAuthorNextAction(storySlug, state);

  return (
    <section className="surface-card grid gap-3 p-3 lg:grid-cols-[1fr_auto]" id="ingest-work">
      <div>
        <div className="muted text-xs font-semibold uppercase tracking-[0.16em]">Next Action</div>
        <div className="mt-1 text-base font-semibold text-slate-100">{action.label}</div>
        <div className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{action.body}</div>
      </div>
      <div className="flex items-start justify-end">
        <a href={action.href} className={`rounded border px-4 py-2 text-sm font-semibold ${actionToneClass(action.tone)}`}>
          {action.label}
        </a>
      </div>
    </section>
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
    <div id="validation-review">
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
    </div>
  );
}

function IngestJobsOperatorSection({ storySlug, state }: IngestJobsPageViewProps) {
  return (
    <section className="grid gap-3">
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
    </section>
  );
}

export function IngestJobsPageView({ storySlug, state }: IngestJobsPageViewProps) {
  const lastUpdatedAt = new Date().toLocaleTimeString();

  return (
    <main className="space-y-4 p-2 md:p-4">
      <IngestJobsHeader storySlug={storySlug} state={state} lastUpdatedAt={lastUpdatedAt} />
      <IngestJobsStatusMessages error={state.error} uploadInfo={state.uploadInfo} />
      <IngestAuthorNextAction storySlug={storySlug} state={state} />
      <div id="source-material">
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
      </div>
      <IngestJobsValidateSection state={state} />
      <div id="split-review">
        <SplitterCompactPanel state={state} />
      </div>
      <details className="rounded border border-dashed border-[#223247] p-3" id="ingest-diagnostics">
        <summary className="cursor-pointer text-sm font-medium text-slate-200">Diagnostics and recovery</summary>
        <div className="mt-3 grid gap-3">
          <section className="rounded border border-[#223247] bg-[#0b1526] p-3">
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
          <IngestJobsOperatorSection storySlug={storySlug} state={state} />
        </div>
      </details>
    </main>
  );
}
