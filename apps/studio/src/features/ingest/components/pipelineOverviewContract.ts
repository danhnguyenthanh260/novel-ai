export type PipelineOverviewKpi = {
  total_jobs: number;
  running_jobs: number;
  failed_jobs: number;
  wait_review_jobs: number;
  done_jobs: number;
};

export type PipelineOverviewHealth = {
  ready_backlog: number;
  running_tasks: number;
  alert_count: number;
};

export type PipelineOverviewAlert = {
  job_id: number;
  node_key: string;
  alert_type: "RUNNING_TOO_LONG" | "READY_STALLED" | "RETRY_EXHAUSTED";
  message: string;
};

export type PipelineOverviewJob = {
  id: number;
  status: string;
  mode: string;
  total_tasks: number;
  completed_tasks: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PipelineOverviewResponse = {
  ok: boolean;
  contract_version?: string;
  generated_at?: string;
  kpi: PipelineOverviewKpi;
  health: PipelineOverviewHealth;
  alerts: PipelineOverviewAlert[];
  jobs: PipelineOverviewJob[];
};

export async function readOverviewJson(res: Response): Promise<PipelineOverviewResponse> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as { ok?: boolean })?.ok === false) {
    const err = (json as { error?: string })?.error || `HTTP_${res.status}`;
    throw new Error(err);
  }
  return json as PipelineOverviewResponse;
}

export function deriveKpiFromJobs(jobs: PipelineOverviewJob[]): PipelineOverviewKpi {
  const rows = Array.isArray(jobs) ? jobs : [];
  return {
    total_jobs: rows.length,
    running_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "RUNNING").length,
    failed_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "FAILED").length,
    wait_review_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "AWAIT_APPROVAL").length,
    done_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "DONE").length,
  };
}

export function findKpiMismatch(apiKpi: PipelineOverviewKpi | null, jobs: PipelineOverviewJob[]): string[] {
  if (!apiKpi) return ["KPI_MISSING"];
  const derived = deriveKpiFromJobs(jobs);
  const mismatches: string[] = [];
  if (apiKpi.total_jobs !== derived.total_jobs) mismatches.push(`total_jobs(api=${apiKpi.total_jobs},derived=${derived.total_jobs})`);
  if (apiKpi.running_jobs !== derived.running_jobs) mismatches.push(`running_jobs(api=${apiKpi.running_jobs},derived=${derived.running_jobs})`);
  if (apiKpi.failed_jobs !== derived.failed_jobs) mismatches.push(`failed_jobs(api=${apiKpi.failed_jobs},derived=${derived.failed_jobs})`);
  if (apiKpi.wait_review_jobs !== derived.wait_review_jobs) {
    mismatches.push(`wait_review_jobs(api=${apiKpi.wait_review_jobs},derived=${derived.wait_review_jobs})`);
  }
  if (apiKpi.done_jobs !== derived.done_jobs) mismatches.push(`done_jobs(api=${apiKpi.done_jobs},derived=${derived.done_jobs})`);
  return mismatches;
}
