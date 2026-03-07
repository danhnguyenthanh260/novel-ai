import { pool } from "@/server/db/pool";
import { processNarrativeTask } from "./narrativeTaskExecutor";

let isPolling = false;

/**
 * Polls for READY narrative tasks that are available to run.
 */
export async function pollNarrativeQueue() {
    if (isPolling) return;
    isPolling = true;

    try {
        // Find one task at a time to ensure sequential execution (throttling)
        const taskRes = await pool.query<{ id: number }>(
            `SELECT id FROM public.ingest_task 
             WHERE status = 'READY' 
               AND task_type LIKE 'NARRATIVE_%'
               AND available_at <= NOW()
             ORDER BY available_at ASC, id ASC
             LIMIT 1`
        );

        if ((taskRes.rowCount ?? 0) > 0) {
            const taskId = taskRes.rows[0].id;
            console.log(`[NarrativeWorker] Executing task ${taskId}...`);
            await processNarrativeTask(taskId);
        }
    } catch (err) {
        console.error("[NarrativeWorker] Error in poll loop:", err);
    } finally {
        isPolling = false;
    }
}
