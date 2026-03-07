import { NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import { maxRetryAttempts, nodeTimeoutSeconds, readyStalledThresholdSeconds } from "./pipelineNodeConfig";

type JobRow = {
  id: number;
  status: string;
  mode: string;
  total_tasks: number;
  completed_tasks: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: number;
  job_id: number;
  task_type: string;
  status: string;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

type OverviewAlert = {
  job_id: number;
  node_key: string;
  alert_type: "RUNNING_TOO_LONG" | "READY_STALLED" | "RETRY_EXHAUSTED";
  message: string;
};

export async function getPipelineOverviewResponse(storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const jobsRes = await pool.query<JobRow>(
      `SELECT id, status, mode, total_tasks, completed_tasks, created_by, created_at::text, updated_at::text
       FROM public.ingest_job
       WHERE story_id = $1 AND created_by <> 'system_replay'
       ORDER BY created_at DESC
       LIMIT 100`,
      [storyId],
    );
    const jobs = jobsRes.rows;
    const jobIds = jobs.map((j) => j.id);
    const jobStatusById = new Map(jobs.map((j) => [j.id, String(j.status || "").toUpperCase()]));

    const tasksRes =
      jobIds.length > 0
        ? await pool.query<TaskRow>(
            `SELECT id, job_id, task_type, status, error, attempts, created_at::text, updated_at::text
             FROM public.ingest_task
             WHERE story_id = $1
               AND job_id = ANY($2::bigint[])
             ORDER BY id DESC
             LIMIT 4000`,
            [storyId, jobIds],
          )
        : { rows: [] as TaskRow[] };

    const nowMs = Date.now();
    const running = jobs.filter((j) => String(j.status || "").toUpperCase() === "RUNNING").length;
    const failed = jobs.filter((j) => String(j.status || "").toUpperCase() === "FAILED").length;
    const waitReview = jobs.filter((j) => String(j.status || "").toUpperCase() === "AWAIT_APPROVAL").length;
    const done = jobs.filter((j) => String(j.status || "").toUpperCase() === "DONE").length;

    const readyCount = tasksRes.rows.filter((t) => {
      const status = String(t.status || "").toUpperCase();
      const jobStatus = jobStatusById.get(t.job_id) || "";
      return status === "READY" && !["CANCELLED", "DONE", "FAILED", "REJECTED"].includes(jobStatus);
    }).length;
    const runningCount = tasksRes.rows.filter((t) => {
      const status = String(t.status || "").toUpperCase();
      const jobStatus = jobStatusById.get(t.job_id) || "";
      return status === "RUNNING" && !["CANCELLED", "DONE", "FAILED", "REJECTED"].includes(jobStatus);
    }).length;
    const retryLimit = maxRetryAttempts();
    const readyThreshold = readyStalledThresholdSeconds();

    const alertMap = new Map<string, OverviewAlert>();
    for (const task of tasksRes.rows) {
      const nodeKey = String(task.task_type || "");
      const status = String(task.status || "").toUpperCase();
      const jobStatus = jobStatusById.get(task.job_id) || "";
      if (["CANCELLED", "DONE", "FAILED", "REJECTED"].includes(jobStatus)) {
        continue;
      }
      const updatedMs = Date.parse(String(task.updated_at || task.created_at || ""));
      const ageSec = Number.isFinite(updatedMs) ? Math.max(0, Math.floor((nowMs - updatedMs) / 1000)) : 0;

      if (status === "RUNNING") {
        const threshold = nodeTimeoutSeconds(nodeKey);
        if (ageSec > threshold) {
          alertMap.set(`${task.job_id}:${nodeKey}:RUNNING_TOO_LONG`, {
            job_id: task.job_id,
            node_key: nodeKey,
            alert_type: "RUNNING_TOO_LONG",
            message: `${nodeKey} running ${ageSec}s (threshold ${threshold}s)`,
          });
        }
      }

      if (status === "READY" && ageSec > readyThreshold) {
        alertMap.set(`${task.job_id}:${nodeKey}:READY_STALLED`, {
          job_id: task.job_id,
          node_key: nodeKey,
          alert_type: "READY_STALLED",
          message: `${nodeKey} ready ${ageSec}s (threshold ${readyThreshold}s)`,
        });
      }

      if (status === "FAILED" && Number(task.attempts || 0) >= retryLimit) {
        alertMap.set(`${task.job_id}:${nodeKey}:RETRY_EXHAUSTED`, {
          job_id: task.job_id,
          node_key: nodeKey,
          alert_type: "RETRY_EXHAUSTED",
          message: `${nodeKey} attempts ${task.attempts} (limit ${retryLimit})`,
        });
      }
    }

    const alerts = Array.from(alertMap.values())
      .sort((a, b) => b.job_id - a.job_id)
      .slice(0, 200);

    return NextResponse.json({
      ok: true,
      contract_version: "pipeline_overview_v1",
      generated_at: new Date().toISOString(),
      story_id: storyId,
      kpi: {
        total_jobs: jobs.length,
        running_jobs: running,
        failed_jobs: failed,
        wait_review_jobs: waitReview,
        done_jobs: done,
      },
      health: {
        ready_backlog: readyCount,
        running_tasks: runningCount,
        alert_count: alerts.length,
      },
      alerts,
      jobs,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "PIPELINE_OVERVIEW_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
