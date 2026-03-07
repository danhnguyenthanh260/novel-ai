import { pool } from "@/server/db/pool";
import { NarrativeOrchestrator } from "@/features/scenes/server/workflow/steps/chapterWriting";
import { advanceWritingPipeline } from "./writingPipelineService";
import { buildStoryContextPack } from "@/features/guard/server/storyContextBuilder";

export async function processNarrativeTask(taskId: number) {
    const client = await pool.connect();
    let jobId: number | undefined;

    try {
        const taskRes = await client.query(
            `SELECT t.id, t.job_id, t.story_id, t.task_type, t.payload_json, j.config_json
             FROM public.ingest_task t
             JOIN public.ingest_job j ON j.id = t.job_id
             WHERE t.id = $1`,
            [taskId]
        );
        if ((taskRes.rowCount ?? 0) === 0) return;

        const task = taskRes.rows[0];
        jobId = task.job_id;
        const storyId = task.story_id;
        const payload = task.payload_json;
        const config = task.config_json;
        const plan = config.plan;

        // 1. Mark as RUNNING
        await client.query(`UPDATE public.ingest_task SET status = 'RUNNING' WHERE id = $1`, [taskId]);

        const orchestrator = new NarrativeOrchestrator(pool);

        // 2. Load context
        const context = await buildStoryContextPack(pool, {
            storyId,
            keywords: plan.summary,
        });

        let resultJson: any = {};

        // 3. Dispatch by task_type
        if (task.task_type === 'NARRATIVE_START') {
            resultJson = { status: 'READY_TO_START' };
        }
        else if (task.task_type === 'NARRATIVE_STYLIST') {
            const beat = plan.beats[payload.beat_idx];
            const prose = await orchestrator.processStylistStep(beat, context);
            resultJson = { prose };
        }
        else if (task.task_type === 'NARRATIVE_CRITIC') {
            const beat = plan.beats[payload.beat_idx];
            const criticResult = await orchestrator.processCriticStep(beat, context, payload.draft_prose);
            resultJson = { critic_result: criticResult };
        }
        else if (task.task_type === 'NARRATIVE_REFINE') {
            const prose = await orchestrator.processRefineStep(payload.draft_prose, payload.critic_result);
            resultJson = { prose };
        }
        else if (task.task_type === 'NARRATIVE_FINALIZE') {
            const finalProse = payload.accumulated_prose.join("\n\n---\n\n");

            await client.query(
                `INSERT INTO public.narrative_chapter_staging (story_id, chapter_id, llm_prose, plan_json)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (story_id, chapter_id) DO UPDATE SET llm_prose = $3, updated_at = NOW()`,
                [storyId, payload.plan.chapter_id || config.chapter_id, finalProse, JSON.stringify(payload.plan)]
            );

            resultJson = { ok: true, chapter_saved: true };
            await client.query(`UPDATE public.ingest_job SET status = 'DONE' WHERE id = $1`, [jobId]);
        }

        // 4. Persistence
        await client.query(
            `UPDATE public.ingest_task 
             SET status = 'DONE', result_json = $1, finished_at = NOW() 
             WHERE id = $2`,
            [JSON.stringify(resultJson), taskId]
        );

        // 5. Trigger Advancement
        if (jobId) {
            await advanceWritingPipeline(jobId, storyId);
        }

    } catch (err: any) {
        console.error(`NarrativeTaskExecutor Error (Task ${taskId}):`, err);
        await client.query(
            `UPDATE public.ingest_task SET status = 'FAILED', result_json = $1 WHERE id = $2`,
            [JSON.stringify({ error: err.message }), taskId]
        );
        if (jobId) {
            await client.query(`UPDATE public.ingest_job SET status = 'FAILED' WHERE id = $1`, [jobId]);
        }
    } finally {
        client.release();
    }
}
