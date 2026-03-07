import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { Pool } from "pg";

async function debug() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        console.log("Checking public.ingest_task human_outcome values...");
        const resTask = await client.query("SELECT human_outcome, count(*) FROM public.ingest_task GROUP BY 1");
        console.table(resTask.rows);

        console.log("\nChecking public.supervisor_memory human_outcome values...");
        const resMem = await client.query("SELECT human_outcome, count(*) FROM public.supervisor_memory GROUP BY 1");
        console.table(resMem.rows);

        console.log("\nSample supervisor_memory records:");
        const resSample = await client.query("SELECT * FROM public.supervisor_memory LIMIT 5");
        console.log(JSON.stringify(resSample.rows, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
debug();
