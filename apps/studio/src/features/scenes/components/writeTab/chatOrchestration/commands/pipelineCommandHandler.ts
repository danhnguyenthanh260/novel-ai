import { type CommandResult, workspaceHref } from "@/features/scenes/components/writeTab/chatOrchestration/commandSurfaceContracts";
import type { PipelineSnapshot, TimelineBlock, WorkflowProgressBlock, WorkflowStepStatus } from "@/features/scenes/components/writeTab/types";
import type { WorkflowCommandHandlerArgs } from "@/features/scenes/components/writeTab/chatOrchestration/commands/statusCommandHandler";

type PipelineOverviewJob = {
  id: number;
  status: string;
  mode: string;
  total_tasks: number;
  completed_tasks: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type PipelineOverviewResponse = {
  ok?: boolean;
  health?: { ready_backlog?: number; running_tasks?: number; alert_count?: number };
  alerts?: Array<{ job_id: number; node_key: string; alert_type: string; message: string }>;
  jobs?: PipelineOverviewJob[];
  error?: string;
};

export type PipelineCommandHandlerResult = {
  block: TimelineBlock;
  result: CommandResult;
  snapshot: PipelineSnapshot | null;
};

function commandUrl(args: WorkflowCommandHandlerArgs): string {
  return new URL(`/api/${encodeURIComponent(args.storySlug)}/pipelines/overview`, window.location.origin).toString();
}

async function fetchOverview(args: WorkflowCommandHandlerArgs): Promise<PipelineOverviewResponse> {
  const res = await fetch(commandUrl(args), { cache: "no-store" });
  const json = await res.json().catch(() => ({})) as PipelineOverviewResponse;
  if (!res.ok || !json.ok) throw new Error(json.error ?? "PIPELINE_COMMAND_FAILED");
  return json;
}

function normalizeStatus(status: string): WorkflowProgressBlock["status"] {
  const value = status.trim().toUpperCase();
  if (value === "DONE" || value === "AWAIT_APPROVAL") return "complete";
  if (value === "FAILED") return "failed";
  if (value === "CANCELLED" || value === "CANCELED" || value === "REJECTED") return "cancelled";
  return "running";
}

function stepStatus(index: number, completed: number, status: WorkflowProgressBlock["status"]): WorkflowStepStatus {
  if (status === "failed" && index === completed + 1) return "failed";
  if (index <= completed) return "complete";
  if (status === "running" && index === completed + 1) return "active";
  return "pending";
}

function selectedJob(jobs: PipelineOverviewJob[]): PipelineOverviewJob | null {
  return jobs.find((job) => String(job.status).toUpperCase() === "RUNNING")
    ?? jobs.find((job) => String(job.status).toUpperCase() === "AWAIT_APPROVAL")
    ?? jobs.find((job) => String(job.status).toUpperCase() === "FAILED")
    ?? jobs[0]
    ?? null;
}

function progressBlock(args: WorkflowCommandHandlerArgs, job: PipelineOverviewJob): WorkflowProgressBlock & { id: string } {
  const status = normalizeStatus(job.status);
  const total = Math.max(1, Number(job.total_tasks || 0));
  const completed = Math.max(0, Math.min(total, Number(job.completed_tasks || 0)));
  const current = status === "complete" ? total : Math.min(total, completed + 1);
  const steps = Array.from({ length: total }, (_, index) => ({
    label: `${job.mode || "Pipeline"} task ${index + 1}`,
    status: stepStatus(index + 1, completed, status),
  }));
  return {
    id: `pipeline-${job.id}`,
    type: "workflow_progress",
    source: "backend",
    event_id: `pipeline-${job.id}`,
    chapter_id: args.chapterId || null,
    job_id: job.id,
    workflow_name: "Pipeline Progress",
    status,
    current_step: current,
    total_steps: total,
    current_step_label: status === "complete" ? "Pipeline complete" : status === "failed" ? "Pipeline failed" : `Running ${job.mode}`,
    steps,
    action_links: [{ label: "Open full pipelines workspace", href: workspaceHref(args.storySlug, "pipelines") }],
  };
}

function snapshotFromJob(args: WorkflowCommandHandlerArgs, job: PipelineOverviewJob, overview: PipelineOverviewResponse): PipelineSnapshot {
  const block = progressBlock(args, job);
  const jobAlerts = (overview.alerts ?? []).filter((alert) => alert.job_id === job.id);
  return {
    title: `${job.mode || "Pipeline"} #${job.id}`,
    jobId: job.id,
    status: block.status,
    mode: job.mode,
    updatedAt: job.updated_at,
    timing: [
      `Created: ${job.created_at}`,
      `Updated: ${job.updated_at}`,
      `Completed tasks: ${job.completed_tasks}/${job.total_tasks}`,
    ],
    logs: [
      ...(jobAlerts.length ? jobAlerts.map((alert) => `${alert.node_key}: ${alert.message}`) : ["No active pipeline alerts."]),
      `Ready backlog: ${overview.health?.ready_backlog ?? 0}`,
      `Running tasks: ${overview.health?.running_tasks ?? 0}`,
    ],
    block,
  };
}

function emptyResult(args: WorkflowCommandHandlerArgs): PipelineCommandHandlerResult {
  const block: TimelineBlock = {
    id: `pipeline-empty-${Date.now()}`,
    type: "workflow_progress",
    source: "assistant",
    event_id: "pipeline-empty",
    chapter_id: args.chapterId || null,
    job_id: null,
    workflow_name: "Pipeline Progress",
    status: "complete",
    current_step: 1,
    total_steps: 1,
    current_step_label: "No pipeline jobs found",
    steps: [{ label: "No pipeline jobs found", status: "complete" }],
    action_links: [{ label: "Open full pipelines workspace", href: workspaceHref(args.storySlug, "pipelines") }],
  };
  return { block, snapshot: null, result: { tone: "ready", title: "No pipeline jobs found", detail: "There is no current pipeline run for this story." } };
}

export async function runPipelineCommand(args: WorkflowCommandHandlerArgs): Promise<PipelineCommandHandlerResult> {
  try {
    const overview = await fetchOverview(args);
    const job = selectedJob(overview.jobs ?? []);
    if (!job) return emptyResult(args);
    const snapshot = snapshotFromJob(args, job, overview);
    return {
      block: snapshot.block,
      snapshot,
      result: {
        tone: snapshot.status === "failed" ? "blocked" : "ready",
        title: snapshot.title,
        detail: snapshot.block.current_step_label,
      },
    };
  } catch {
    return emptyResult(args);
  }
}
