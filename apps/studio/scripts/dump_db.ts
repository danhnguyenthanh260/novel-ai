import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { Pool } from "pg";

async function dump() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        console.log("=== INGEST_TASK (Last 20) ===");
        const tasks = await client.query("SELECT id, task_type, status, human_outcome, created_at FROM public.ingest_task ORDER BY created_at DESC LIMIT 20");
        console.table(tasks.rows);

        console.log("\n=== INGEST_JOB with Reprocess Notes (Last 10) ===");
        const jobs = await client.query("SELECT id, config_json->>'reprocess_note' as note, config_json->>'source_job_id' as source_job, created_at FROM public.ingest_job WHERE config_json->>'reprocess_note' IS NOT NULL ORDER BY created_at DESC LIMIT 10");
        console.table(jobs.rows);

        console.log("\n=== SUPERVISOR_MEMORY (Last 20) ===");
        const mems = await client.query("SELECT id, label, human_outcome, created_at FROM public.supervisor_memory ORDER BY created_at DESC LIMIT 20");
        console.table(mems.rows);

        console.log("\nDistinct human_outcome in ingest_task:");
        const distTasks = await client.query("SELECT human_outcome, count(*) FROM public.ingest_task GROUP BY 1");
        console.table(distTasks.rows);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
dump();
