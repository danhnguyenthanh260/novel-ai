import type { Pool } from "pg";
import { buildStoryContextPack } from "@/features/guard/server/storyContextBuilder";
import { insertVersion, updateScene } from "../repoScene";
import { SubtextEngine, PacingController, ThematicAnchor, Arbiter, ReadOnlySandbox } from "../../narrative/NarrativeEngine";
import { callChatCompletionJson } from "@/app/api/muse/_shared";
import { buildStylistPrompt, buildEditorialCriticPrompt } from "@/features/prompts/server/narrativePromptBuilder";
import { ensureIngestWorkerRunning } from "@/features/ingest/server/workerControl";

export type ChapterWritingArgs = {
    storyId: number;
    chapterId: string;
    plan: any; // The approved Beat Map
    llmParams?: any;
};

export type ChapterWritingResult = {
    ok: boolean;
    job_id?: number;
    status: string;
};

/**
 * PHASE 8.1: NarrativeOrchestrator (Task-Oriented)
 * Coordinates AI agents via the persistent Job/Task system.
 */
export class NarrativeOrchestrator {
    constructor(private pool: Pool) { }

    /**
     * Bootstraps a new Chapter Writing Job.
     */
    async setupJob(args: ChapterWritingArgs): Promise<number> {
        const startedAt = Date.now();
        const coolOffSeconds = Math.max(0, Number(process.env.WRITING_COOL_OFF_SECONDS ?? "2") || 2);
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");

            // 1. Create Job
            const jobRes = await client.query<{ id: number }>(
                `INSERT INTO public.ingest_job 
                 (story_id, status, mode, config_json, total_tasks, cool_off_seconds)
                 VALUES ($1, 'RUNNING', 'AUTO_CHAPTER', $2, $3, $4)
                 RETURNING id`,
                [
                    args.storyId,
                    JSON.stringify({
                        pipeline_type: "DEEP_NARRATIVE_V2",
                        chapter_id: args.chapterId,
                        plan: args.plan,
                        cool_off_seconds: coolOffSeconds,
                    }),
                    args.plan.beats.length * 3,
                    coolOffSeconds,
                ]
            );
            const jobId = jobRes.rows[0].id;
            const idempotencyKey = `narrative:${jobId}:${args.chapterId}:NARRATIVE_START:b0:r0:a0`;

            // 2. Enqueue First Task: NARRATIVE_START
            await client.query(
                `INSERT INTO public.ingest_task
                 (job_id, story_id, task_type, unit_type, status, payload_json, available_at, seq_no, idempotency_key)
                 SELECT $1, $2, 'NARRATIVE_START', 'chapter', 'READY', $3, NOW(), 1, $4
                 WHERE NOT EXISTS (
                   SELECT 1
                   FROM public.ingest_task t
                   WHERE t.story_id = $2
                     AND t.task_type = 'NARRATIVE_START'
                     AND t.idempotency_key = $4
                 )`,
                [
                    jobId,
                    args.storyId,
                    JSON.stringify({
                        chapter_id: args.chapterId,
                        job_config: {
                            chapter_id: args.chapterId,
                            plan: args.plan,
                            cool_off_seconds: coolOffSeconds,
                        }
                    }),
                    idempotencyKey
                ]
            );

            await client.query("COMMIT");
            await ensureIngestWorkerRunning();
            console.info(
                "[writing.execute.job_created]",
                JSON.stringify({
                    story_id: args.storyId,
                    chapter_id: args.chapterId,
                    job_id: jobId,
                    task_type: "NARRATIVE_START",
                    latency_ms: Date.now() - startedAt,
                    llm_tokens: null,
                })
            );
            return jobId;
        } catch (err) {
            await client.query("ROLLBACK");
            console.error(
                "[writing.execute.job_failed]",
                JSON.stringify({
                    story_id: args.storyId,
                    chapter_id: args.chapterId,
                    task_type: "NARRATIVE_START",
                    latency_ms: Date.now() - startedAt,
                    error: err instanceof Error ? err.message : "JOB_SETUP_FAILED",
                })
            );
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Executes a single Stylist Turn.
     */
    async processStylistStep(beat: any, context: any): Promise<string> {
        const safeContext = ReadOnlySandbox.protect(context);
        const contextBlock = JSON.stringify(safeContext, null, 2);

        const emotionalState = beat.emotional_state || "Anxiety";
        const behavioralInstr = SubtextEngine.translate(emotionalState, beat.characters[0] || "Someone");
        const conflictScore = beat.conflict_level || 0.5;
        const pacingRules = PacingController.regulate(conflictScore);
        const thematicRules = ThematicAnchor.anchor("Noir");

        const stylistPrompt = buildStylistPrompt({
            beat,
            contextBlock,
            writingLanguage: "en",
            behavioralInstructions: behavioralInstr,
            pacingRules,
            theme: thematicRules
        });

        const stylistResponse = await callChatCompletionJson({
            messages: [{ role: "user", content: stylistPrompt }],
            temperature: 0.8,
            maxTokens: 1200,
            timeoutMs: 45000,
        });

        return stylistResponse.content;
    }

    /**
     * Executes a single Critic Turn.
     */
    async processCriticStep(beat: any, context: any, prose: string): Promise<any> {
        const safeContext = ReadOnlySandbox.protect(context);
        const contextBlock = JSON.stringify(safeContext, null, 2);

        const criticPrompt = buildEditorialCriticPrompt({
            beat,
            contextBlock,
            writingLanguage: "en",
            draftProse: prose
        });

        const criticResponse = await callChatCompletionJson({
            messages: [{ role: "user", content: criticPrompt }],
            temperature: 0.4,
            maxTokens: 800,
            timeoutMs: 35000,
        });

        const rawContent = criticResponse.content;
        const jsonContent = rawContent.includes("```json")
            ? rawContent.split("```json")[1].split("```")[0].trim()
            : rawContent.startsWith("```")
                ? rawContent.split("```")[1].split("```")[0].trim()
                : rawContent.trim();
        return JSON.parse(jsonContent);
    }

    /**
     * Executes a Refinement Turn based on Critic feedback.
     */
    async processRefineStep(prose: string, criticResult: any): Promise<string> {
        const refinePrompt = `
You are the STYLIST AGENT. Revise the following prose based on the EDITORIAL CRITIC's feedback.

DRAFT:
${prose}

FEEDBACK:
${criticResult.summary}
PATCHES:
${JSON.stringify(criticResult.patches)}

Output ONLY the revised prose. CẤM thêm phân tích hay chào hỏi.
`.trim();

        const refinementResponse = await callChatCompletionJson({
            messages: [{ role: "user", content: refinePrompt }],
            temperature: 0.6,
            maxTokens: 1200,
            timeoutMs: 45000,
        });

        return refinementResponse.content;
    }

    runCopyEditor(prose: string): string {
        return prose.trim().replace(/\s\s+/g, ' ');
    }
}

export async function runChapterWriting(
    pool: Pool,
    args: ChapterWritingArgs
): Promise<ChapterWritingResult> {
    const orchestrator = new NarrativeOrchestrator(pool);
    const jobId = await orchestrator.setupJob(args);
    return {
        ok: true,
        job_id: jobId,
        status: "RUNNING"
    };
}
