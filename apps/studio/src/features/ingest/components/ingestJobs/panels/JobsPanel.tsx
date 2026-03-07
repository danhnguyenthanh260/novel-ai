"use client";

import type { IngestJob } from "@/features/ingest/components/ingestJobs/types";

type JobsPanelProps = {
  jobs: IngestJob[];
  jobsTotal: number;
  jobsPage: number;
  jobsPageCount: number;
  jobsHasPrev: boolean;
  jobsHasNext: boolean;
  selectedJobId: number | null;
  selectedJobStatus: IngestJob["status"] | null;
  loading: boolean;
  acting: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onRetryFailed: () => void;
  onCancelJob: () => void;
  onSelectJob: (jobId: number) => void;
};

export function JobsPanel({
  jobs,
  jobsTotal,
  jobsPage,
  jobsPageCount,
  jobsHasPrev,
  jobsHasNext,
  selectedJobId,
  selectedJobStatus,
  loading,
  acting,
  onPrevPage,
  onNextPage,
  onRetryFailed,
  onCancelJob,
  onSelectJob,
}: JobsPanelProps) {
  return (
    <section className="surface-card">
      <div className="flex items-center justify-between border-b border-[#223247] px-4 py-3 text-sm font-medium">
        <span>Jobs</span>
        <div className="flex items-center gap-2">
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onPrevPage} disabled={loading || !jobsHasPrev}>
            Prev
          </button>
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onNextPage} disabled={loading || !jobsHasNext}>
            Next
          </button>
          <button type="button" className="shell-link px-2 py-1 text-xs" onClick={onRetryFailed} disabled={!selectedJobId || acting}>
            Retry Failed
          </button>
          <button
            type="button"
            className="shell-link px-2 py-1 text-xs"
            onClick={onCancelJob}
            disabled={!selectedJobId || acting || selectedJobStatus === "CANCELLED" || selectedJobStatus === "DONE"}
          >
            Cancel Job
          </button>
        </div>
      </div>
      <div className="muted px-4 py-2 text-xs">
        showing {jobs.length} / total {jobsTotal} | page {jobsPage}/{jobsPageCount}
      </div>
      <div className="divide-y">
        {jobs.map((job) => {
          const selected = selectedJobId === job.id;
          const progress = job.total_tasks > 0 ? `${job.completed_tasks}/${job.total_tasks}` : "0/0";
          return (
            <button
              key={job.id}
              type="button"
              className={`w-full px-4 py-3 text-left text-sm ${selected ? "bg-[#152232]" : ""}`}
              onClick={() => onSelectJob(job.id)}
            >
              <div className="font-medium">
                Job #{job.id} | {job.mode} | {job.status}
              </div>
              <div className="muted">
                progress: {progress} | by: {job.created_by ?? "-"} | updated: {new Date(job.updated_at).toLocaleString()}
              </div>
            </button>
          );
        })}
        {jobs.length === 0 && <div className="muted px-4 py-4 text-sm">No ingest jobs.</div>}
      </div>
    </section>
  );
}
