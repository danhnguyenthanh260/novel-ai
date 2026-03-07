import type { PoolClient } from "pg";

export const TERMINAL_JOB_STATUSES = new Set(["CANCELLED", "FAILED", "DONE", "REJECTED"]);

export async function reconcileTerminalJobTasks(
  client: PoolClient,
  storyId: number,
  jobId: number,
  reason: string,
): Promise<number> {
  const res = await client.query<{ id: number }>(
    `UPDATE public.ingest_task
     SET status = 'FAILED',
         error = COALESCE(error, $3),
         updated_at = now()
     WHERE story_id = $1
       AND job_id = $2
       AND status IN ('PENDING', 'READY', 'WAIT_REVIEW', 'RUNNING')
     RETURNING id`,
    [storyId, jobId, reason],
  );
  return Number(res.rowCount || 0);
}
