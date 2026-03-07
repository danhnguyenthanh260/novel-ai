import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { Pool } from "pg";
import { randomUUID } from "crypto";

async function runReplay() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    let client;

    console.log("Starting Retroactive Feedback Replay (TOTAL SCAN)...");

    try {
        client = await pool.connect();

        // 1. Broad search for ANY feedback note across all storage locations
        const feedbackEventsRes = await client.query(`
          WITH feedback_sources AS (
            -- Source A: Ingest Job Config (Direct reprocess trigger)
            SELECT 
              story_id,
              config_json->>'reprocess_note' as note,
              jsonb_array_elements_text(COALESCE(config_json->'chapter_ids', '[]'::jsonb)) as chapter_id,
              created_at as event_at
            FROM public.ingest_job
            WHERE config_json->>'reprocess_note' IS NOT NULL

            UNION ALL

            -- Source B: Ingest Task (Reject outcome or reprocess payload)
            SELECT 
              story_id,
              COALESCE(result_json->>'reprocess_note', payload_json->>'reprocess_note') as note,
              payload_json->>'chapter_id' as chapter_id,
              created_at as event_at
            FROM public.ingest_task
            WHERE (result_json->>'reprocess_note' IS NOT NULL AND result_json->>'reprocess_note' <> '')
               OR (payload_json->>'reprocess_note' IS NOT NULL AND payload_json->>'reprocess_note' <> '')

            UNION ALL

            -- Source C: Dedicated Feedback Table
            SELECT 
              story_id,
              note,
              chapter_id,
              created_at as event_at
            FROM public.split_feedback
            WHERE note IS NOT NULL AND note <> ''
          )
          -- No DISTINCT ON(note) - we want FULL history!
          -- But we still DISTINCT ON the triplet + event time to avoid exact duplicate rows from different sources for the same event
          SELECT DISTINCT ON (story_id, chapter_id, note, event_at)
            story_id, chapter_id, note, event_at
          FROM feedback_sources
          ORDER BY story_id, chapter_id, note, event_at ASC
        `);

        console.log(`Found ${feedbackEventsRes.rows.length} feedback events across all records.`);

        let count = 0;
        for (const event of feedbackEventsRes.rows) {
            const { story_id, chapter_id, note, event_at } = event;

            // 2. Find the task that was rejected (the one created just before this feedback)
            const rejectedTaskRes = await client.query(`
              SELECT 
                it.id as old_task_id,
                it.story_id,
                it.payload_json as old_payload,
                it.result_json as old_result
              FROM public.ingest_task it
              WHERE it.story_id = $1 
                AND (it.payload_json->>'chapter_id' = $2 OR it.source_path LIKE $3)
                AND it.task_type = 'CHAPTER_SPLIT_LLM'
                AND it.created_at < $4
              ORDER BY it.created_at DESC
              LIMIT 1
            `, [story_id, chapter_id, `%${chapter_id}%`, event_at]);

            const row = rejectedTaskRes.rows[0];
            if (!row) {
                console.log(`   -> Skipping Chapter ${chapter_id} at ${event_at}: No previous task found.`);
                continue;
            }

            count++;
            console.log(`[${count}] Replaying Chapter ${chapter_id} (Story ${story_id}). Note: "${note}"`);

            const oldPayload = row.old_payload || {};
            const oldResult = row.old_result || {};

            // Reconstruct previous_split_contexts
            let chapterText = oldPayload.chapter_text || "";
            if (!chapterText && oldPayload.source_doc_id) {
                const docRes = await client.query(`SELECT raw_text FROM public.source_doc WHERE id = $1`, [oldPayload.source_doc_id]);
                chapterText = docRes.rows[0]?.raw_text || "";
            }

            const contexts: string[] = [];
            if (chapterText && Array.isArray(oldResult.scenes)) {
                for (const s of oldResult.scenes) {
                    if (s && typeof s === "object" && typeof s.end === "number") {
                        const at = s.end;
                        if (at > 10 && at < chapterText.length - 10) {
                            const left = Math.max(0, at - 45);
                            const right = Math.min(chapterText.length, at + 45);
                            let snippet = chapterText.slice(left, right);
                            snippet = snippet.replace(/\n\s*/g, " ");
                            contexts.push(snippet);
                        }
                    }
                }
            }

            // Create new Job
            await client.query("BEGIN");
            const ingestRunId = randomUUID();
            const createJobRes = await client.query<{ id: number }>(
                `INSERT INTO public.ingest_job
                  (story_id, created_by, mode, status, ingest_run_id, config_json, total_tasks, completed_tasks)
                 VALUES
                  ($1::bigint, 'system_replay', 'AUTO_LOCK', 'SPLIT_DRAFT', $2::uuid, $3::jsonb, 1, 0)
                 RETURNING id`,
                [
                    story_id,
                    ingestRunId,
                    JSON.stringify({
                        input_mode: "REPROCESS_SCENES",
                        total_chapters: 1,
                        auto_split_v1: true,
                        split_mode: 'auto',
                        source: "replay_migration",
                        reprocess_note: note,
                    })
                ]
            );
            const newJobId = createJobRes.rows[0].id;

            await client.query(
                `INSERT INTO public.ingest_task
                  (job_id, story_id, task_type, unit_type, source_path, seq_no, status, attempts, idempotency_key, payload_json)
                 VALUES
                  ($1, $2, 'CHAPTER_SPLIT_LLM', 'split_draft', $3, 1, 'READY', 0, $4, $5::jsonb)`,
                [
                    newJobId,
                    story_id,
                    oldPayload.source_path || `chapter:${chapter_id}`,
                    `replay_split:${story_id}:${chapter_id}:${ingestRunId}:${count}`,
                    JSON.stringify({
                        ...oldPayload,
                        ingest_run_id: ingestRunId,
                        split_mode: 'auto',
                        reprocess_reason_code: "OTHER",
                        reprocess_note: note,
                        previous_split_contexts: contexts,
                    })
                ]
            );
            await client.query("COMMIT");
            console.log(`   -> Created Replay Job ${newJobId} with ${contexts.length} contexts.`);

            // Sleep to prevent GPU/LLM overheating
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log("\nReplay migration fully dispatched to Queue!");

    } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => { });
        console.error("Replay script failed:", err);
    } finally {
        if (client) client.release();
        await pool.end();
        process.exit(0);
    }
}

runReplay();
