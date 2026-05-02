/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { pool } from "@/server/db/pool";
import type { PoolClient } from "pg";
import { ensureIngestWorkerRunning } from "@/features/ingest/server/workerControl";
import { randomUUID } from "crypto";
import { buildStoryContextPack } from "@/features/guard/server/storyContextBuilder";
import { renderAutowriteContextBlock } from "@/features/prompts/server/autowritePromptBuilder";
import {
    buildPreChapterProfileV1,
    resolvePackBudgetPolicy,
} from "@/features/analysis/server/truthPackGovernance";
import { buildWorkingSet } from "./chapterContextService";

export interface WritingPipelineConfig {
    storyId: number;
    instructions: string;
    chapterNo?: number;
    targetWordCount?: number;
}

type ActiveCleanSnapshotRow = {
    id: number;
    chapter_id: string | null;
    fact_status: string;
    ready_for_writing: boolean;
    degraded_mode: boolean;
    snapshot_json: any;
};

async function loadActiveCleanSnapshot(
    client: PoolClient,
    storyId: number,
    chapterId: string | null | undefined
): Promise<ActiveCleanSnapshotRow | null> {
    const chapter = String(chapterId || "").trim();
    const preferred = chapter
        ? await client.query<ActiveCleanSnapshotRow>(
            `SELECT s.id, s.chapter_id, s.fact_status, s.ready_for_writing, s.degraded_mode, s.snapshot_json
             FROM public.story_active_analysis_snapshot a
             JOIN public.writing_snapshot_v3 s ON s.id = a.snapshot_id
             WHERE a.story_id = $1
               AND a.chapter_id = $2
               AND s.ready_for_writing = true
               AND s.fact_status = 'CLEAN'
               AND s.degraded_mode = false
             ORDER BY a.updated_at DESC, a.id DESC
             LIMIT 1`,
            [storyId, chapter]
        )
        : { rowCount: 0, rows: [] as ActiveCleanSnapshotRow[] };
    if ((preferred.rowCount ?? 0) > 0) return preferred.rows[0];

    if (!chapter) return null;
    const fallback = await client.query<ActiveCleanSnapshotRow>(
        `SELECT s.id, s.chapter_id, s.fact_status, s.ready_for_writing, s.degraded_mode, s.snapshot_json
         FROM public.writing_snapshot_v3 s
         WHERE s.story_id = $1
           AND s.chapter_id = $2
           AND s.ready_for_writing = true
           AND s.fact_status = 'CLEAN'
           AND s.degraded_mode = false
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT 1`,
        [storyId, chapter]
    );
    if ((fallback.rowCount ?? 0) > 0) return fallback.rows[0];
    return null;
}

export async function createWritingAnalysisTask(config: WritingPipelineConfig) {
    const client = await pool.connect();
    try {
        // 0. Check for V3 feature flag
        const storyRes = await client.query<{ settings_json: any }>(
            `SELECT settings_json FROM public.story_series WHERE id = $1`,
            [config.storyId]
        );
        const settings = storyRes.rows[0]?.settings_json || {};
        const useV3 = settings.use_v3_core === true && process.env.V3_CORE_DISABLED !== 'true';

        if (useV3) {
            // If V3 is enabled, redirect to the New Chapter-First Workflow
            console.log(`[WRITING_PIPELINE] Routing to V3 Core for storyId=${config.storyId} chapterNo=${config.chapterNo}`);
            client.release();
            return await enqueueChapterWriteV3(config);
        }

        await client.query("BEGIN");

        const chapterId = Number.isFinite(Number(config.chapterNo)) && Number(config.chapterNo) > 0
            ? `ch${String(Math.floor(Number(config.chapterNo))).padStart(2, "0")}`
            : null;
        const packBudgetPolicy = await resolvePackBudgetPolicy(client, config.storyId);
        const preChapterProfile = buildPreChapterProfileV1({
            chapterId: chapterId || "draft",
            targetWordCount: config.targetWordCount || 3000,
            instruction: config.instructions,
            allowedCharacters: [],
        });

        // 1. Create a specialized ingest_job for the writing pipeline
        const jobRes = await client.query<{ id: number }>(
            `INSERT INTO public.ingest_job
        (story_id, status, mode, config_json, total_tasks)
       VALUES ($1, 'RUNNING', 'AUTO_LOCK', $2, 1)
       RETURNING id`,
            [
                config.storyId,
                JSON.stringify({
                    pipeline_type: "AUTO_CHAPTER",
                    instructions: config.instructions,
                    target_word_count: config.targetWordCount || 3000,
                    chapter_no: config.chapterNo,
                    chapter_id: chapterId,
                    pack_budget_policy_v1: packBudgetPolicy,
                    pre_chapter_profile_v1: preChapterProfile,
                }),
            ]
        );
        const jobId = jobRes.rows[0].id;

        if (chapterId) {
            await client.query(
                `INSERT INTO public.pre_chapter_profile_v1
                  (story_id, chapter_id, job_id, chapter_mode, pov_mode, timeline_mode, reveal_sensitivity, cast_pressure, thread_pressure, profile_json, created_by)
                 VALUES
                  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'writing_pipeline')
                 ON CONFLICT DO NOTHING`,
                [
                    config.storyId,
                    chapterId,
                    jobId,
                    preChapterProfile.chapter_mode,
                    preChapterProfile.pov_mode,
                    preChapterProfile.timeline_mode,
                    preChapterProfile.reveal_sensitivity,
                    preChapterProfile.cast_pressure,
                    preChapterProfile.thread_pressure,
                    JSON.stringify(preChapterProfile),
                ]
            ).catch(() => undefined);
        }

        // 2. Enqueue WRITING_ANALYSIS task
        const ingestRunId = randomUUID();
        const taskRes = await client.query<{ id: number }>(
            `INSERT INTO public.ingest_task
        (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
       VALUES ($1, $2, 'WRITING_ANALYSIS', 'chapter', 'READY', $3, 1)
       RETURNING id`,
            [
                jobId,
                config.storyId,
                JSON.stringify({
                    instructions: config.instructions,
                    chapter_no: config.chapterNo,
                    chapter_id: chapterId,
                    ingest_run_id: ingestRunId,
                    pack_budget_policy_v1: packBudgetPolicy,
                    pre_chapter_profile_v1: preChapterProfile,
                }),
            ]
        );

        await client.query("COMMIT");
        await ensureIngestWorkerRunning();

        return {
            jobId,
            taskId: taskRes.rows[0].id,
        };
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Triggered after Analysis Agent is done.
 * This will create the planning task which is interactive.
 */
export async function createWritingPlanningTask(jobId: number, storyId: number, analysisResult: any) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO public.ingest_task
          (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
         VALUES ($1, $2, 'WRITING_PLANNING', 'chapter', 'READY', $3, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
            [
                jobId,
                storyId,
                JSON.stringify({
                    analysis_result: analysisResult,
                }),
            ]
        );
        await ensureIngestWorkerRunning();
    } finally {
        client.release();
    }
}

/**
 * Triggered after user approves the Beat Map.
 * Enqueues the first scene's WRITING_PROSE task.
 */
export async function executeWritingPhase(jobId: number, storyId: number, approvedPlan: any) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Update job with the approved plan
        await client.query(
            `UPDATE public.ingest_job SET config_json = config_json || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ approved_plan: approvedPlan }), jobId]
        );

        // 2. Enqueue the FIRST scene's prose task
        const firstScene = approvedPlan.scenes[0];
        const chapterId = String(approvedPlan.chapter_id || "").trim() || null;
        await client.query(
            `INSERT INTO public.ingest_task
              (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
             VALUES ($1, $2, 'WRITING_PROSE', 'scene', 'READY', $3, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
            [
                jobId,
                storyId,
                JSON.stringify({
                    scene_index: 0,
                    beat: firstScene.beats[0], // Simplified: 1st beat for now
                    scene_title: firstScene.title,
                    chapter_id: chapterId,
                    continuity_retry_count: 0,
                    truth_context_pack_v1: approvedPlan.truth_context_pack_v1 || {},
                }),
            ]
        );

        await client.query("COMMIT");
        await ensureIngestWorkerRunning();
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Polling or hook-based logic to advance the pipeline:
 * WRITING_PROSE (Done) -> WRITING_CONTINUITY (Ready)
 * WRITING_CONTINUITY (Done) -> WRITING_PROSE (Next Scene) or WRITING_SUPERVISOR
 */
export async function advanceWritingPipeline(jobId: number, story_id: number) {
    const client = await pool.connect();
    try {
        const jobRes = await client.query<{ config_json: any, mode: string, cool_off_seconds: number }>(
            `SELECT config_json, mode, cool_off_seconds FROM public.ingest_job WHERE id = $1`, [jobId]
        );
        if ((jobRes.rowCount ?? 0) === 0) return;
        const job = jobRes.rows[0];

        if (job.config_json?.pipeline_type === 'DEEP_NARRATIVE_V2') {
            return await advanceDeepNarrativePipeline(client, jobId, story_id, job);
        }

        if (job.config_json?.pipeline_type === 'CHAPTER_WRITE_V3') {
            return await advanceChapterWriteV3Pipeline(client, jobId);
        }

        // Standard legacy/auto-chapter logic
        const tasks = await client.query<{ id: number, task_type: string, status: string, result_json: any, payload_json: any }>(
            `SELECT id, task_type, status, result_json, payload_json
             FROM public.ingest_task
             WHERE job_id = $1
             ORDER BY seq_no DESC, id DESC`,
            [jobId]
        );

        const lastTask = tasks.rows[0];
        if (!lastTask || lastTask.status !== 'DONE') return;

        if (lastTask.task_type === 'WRITING_ANALYSIS') {
            const chapterId = String(lastTask.payload_json?.chapter_id || job.config_json?.chapter_id || "").trim() || null;
            const cleanSnapshot = await loadActiveCleanSnapshot(client, story_id, chapterId);
            if (!cleanSnapshot) {
                await client.query(
                    `UPDATE public.ingest_job
                     SET status = 'AWAIT_APPROVAL',
                         config_json = config_json || $2::jsonb,
                         updated_at = now()
                     WHERE id = $1`,
                    [
                        jobId,
                        JSON.stringify({
                            analysis_gate: {
                                blocked: true,
                                reason: "NO_ACTIVE_CLEAN_ANALYSIS",
                                chapter_id: chapterId,
                            },
                        }),
                    ]
                );
                return;
            }
            const analysisResult = {
                ...(lastTask.result_json || {}),
                active_clean_snapshot_id: cleanSnapshot.id,
                active_clean_snapshot_json: cleanSnapshot.snapshot_json || {},
                analysis_gate: {
                    blocked: false,
                    chapter_id: chapterId,
                },
            };
            await createWritingPlanningTask(jobId, story_id, analysisResult);
        } else if (lastTask.task_type === 'WRITING_PROSE') {
            const prose = String(lastTask.result_json?.prose || "").trim();
            if (!prose) return;
            await client.query(
                `INSERT INTO public.ingest_task
                  (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
                 VALUES ($1, $2, 'WRITING_CONTINUITY', 'writing_continuity', 'READY', $3, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
                [
                    jobId,
                    story_id,
                    JSON.stringify({
                        chapter_id: String(lastTask.payload_json?.chapter_id || job.config_json?.chapter_id || "").trim() || null,
                        scene_id: Number(lastTask.payload_json?.scene_id || 0),
                        scene_version_id: Number(lastTask.payload_json?.scene_version_id || 0),
                        scene_index: Number(lastTask.payload_json?.scene_index || 0),
                        prose,
                        continuity_retry_count: Number(lastTask.payload_json?.continuity_retry_count || 0),
                    }),
                ]
            );
            await ensureIngestWorkerRunning();
        } else if (lastTask.task_type === 'WRITING_CONTINUITY') {
            const approvedPlan = job.config_json?.approved_plan;
            if (!approvedPlan) return;
            const currentIdx = Number(lastTask.payload_json?.scene_index ?? 0);
            const continuitySeverity = String(lastTask.result_json?.continuity_severity || "normal").toLowerCase();
            const retryCount = Number(lastTask.result_json?.continuity_retry_count ?? lastTask.payload_json?.continuity_retry_count ?? 0);
            const chapterId = String(lastTask.payload_json?.chapter_id || job.config_json?.chapter_id || "").trim() || null;
            if (continuitySeverity === "high") {
                if (retryCount < 1) {
                    const sameScene = approvedPlan.scenes[currentIdx];
                    await client.query(
                        `INSERT INTO public.ingest_task
                          (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
                         VALUES ($1, $2, 'WRITING_PROSE', 'scene', 'READY', $3, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
                        [
                            jobId,
                            story_id,
                            JSON.stringify({
                                chapter_id: chapterId,
                                scene_index: currentIdx,
                                beat: sameScene?.beats?.[0] || {},
                                scene_title: sameScene?.title || null,
                                continuity_retry_count: retryCount + 1,
                                continuity_feedback: lastTask.result_json?.logic_flags || [],
                            }),
                        ]
                    );
                    await ensureIngestWorkerRunning();
                    return;
                }
                await client.query(
                    `UPDATE public.ingest_job
                     SET status = 'AWAIT_APPROVAL',
                         config_json = config_json || $2::jsonb,
                         updated_at = now()
                     WHERE id = $1`,
                    [
                        jobId,
                        JSON.stringify({
                            continuity_gate: {
                                blocked: true,
                                reason: "CONTINUITY_RETRY_EXHAUSTED",
                                scene_index: currentIdx,
                            },
                        }),
                    ]
                );
                return;
            }
            const nextIdx = currentIdx + 1;

            if (nextIdx < approvedPlan.scenes.length) {
                const nextScene = approvedPlan.scenes[nextIdx];
                await client.query(
                    `INSERT INTO public.ingest_task
                      (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
                     VALUES ($1, $2, 'WRITING_PROSE', 'scene', 'READY', $3, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
                    [
                        jobId,
                        story_id,
                        JSON.stringify({
                            chapter_id: chapterId,
                            scene_index: nextIdx,
                            beat: nextScene.beats[0],
                            scene_title: nextScene.title,
                            continuity_retry_count: 0,
                        }),
                    ]
                );
                await ensureIngestWorkerRunning();
            } else {
                // Done with all scenes
                await client.query(
                    `UPDATE public.ingest_job SET status = 'DONE', updated_at = now() WHERE id = $1`,
                    [jobId]
                );
            }
        }
    } finally {
        client.release();
    }
}

async function advanceDeepNarrativePipeline(client: PoolClient, jobId: number, storyId: number, job: any) {
    const tasks = await client.query<{ id: number, task_type: string, status: string, result_json: any, payload_json: any }>(
        `SELECT id, task_type, status, result_json, payload_json
         FROM public.ingest_task
         WHERE job_id = $1
         ORDER BY id DESC`,
        [jobId]
    );

    const lastTask = tasks.rows[0];
    if (!lastTask || lastTask.status !== 'DONE') return;

    const plan = job.config_json.plan;
    const coolOff = job.cool_off_seconds || 60;
    const nextAvailableAt = `NOW() + interval '${coolOff} seconds'`;

    if (lastTask.task_type === 'NARRATIVE_START') {
        // Enqueue Stylist for Beat 0
        await enqueueNarrativeTask(client, jobId, storyId, 'NARRATIVE_STYLIST', {
            beat_idx: 0,
            accumulated_prose: []
        }, 'NOW()'); // First one starts immediately
    }
    else if (lastTask.task_type === 'NARRATIVE_STYLIST') {
        // Enqueue Critic for the same beat
        const payload = lastTask.payload_json;
        await enqueueNarrativeTask(client, jobId, storyId, 'NARRATIVE_CRITIC', {
            ...payload,
            draft_prose: lastTask.result_json.prose
        }, nextAvailableAt);
    }
    else if (lastTask.task_type === 'NARRATIVE_CRITIC') {
        const payload = lastTask.payload_json;
        const criticResult = lastTask.result_json.critic_result;

        if (criticResult.patches && criticResult.patches.length > 0 && (payload.refine_count || 0) < 1) {
            // Enqueue Refinement
            await enqueueNarrativeTask(client, jobId, storyId, 'NARRATIVE_REFINE', {
                ...payload,
                critic_result: criticResult,
                refine_count: (payload.refine_count || 0) + 1
            }, nextAvailableAt);
        } else {
            // Move to Finalize beat or Next Beat
            await finalizeOrNextBeat(client, jobId, storyId, payload, lastTask.result_json.prose || payload.draft_prose, plan, nextAvailableAt);
        }
    }
    else if (lastTask.task_type === 'NARRATIVE_REFINE') {
        const payload = lastTask.payload_json;
        // After refinement, just move on (Arbiter rule: max 2 turns)
        await finalizeOrNextBeat(client, jobId, storyId, payload, lastTask.result_json.prose, plan, nextAvailableAt);
    }
}

async function finalizeOrNextBeat(client: PoolClient, jobId: number, storyId: number, payload: any, beatProse: string, plan: any, nextAvailableAt: string) {
    const nextIdx = payload.beat_idx + 1;
    const updatedAccumulated = [...(payload.accumulated_prose || []), beatProse];

    if (nextIdx < plan.beats.length) {
        await enqueueNarrativeTask(client, jobId, storyId, 'NARRATIVE_STYLIST', {
            beat_idx: nextIdx,
            accumulated_prose: updatedAccumulated
        }, nextAvailableAt);
    } else {
        // All beats done -> Finalize Chapter
        await enqueueNarrativeTask(client, jobId, storyId, 'NARRATIVE_FINALIZE', {
            accumulated_prose: updatedAccumulated,
            plan: plan
        }, nextAvailableAt);
    }
}

async function enqueueNarrativeTask(client: PoolClient, jobId: number, storyId: number, type: string, payload: any, availableAt: string) {
    // Build context right before enqueuing to ensure it's fresh
    const pack = await buildStoryContextPack(client, {
        storyId,
        chapterId: String(payload.chapter_id || payload.job_config?.chapter_id || "").trim() || undefined,
        keywords: payload.beat?.description || payload.chapter_id || "Narrative generation"
    });
    const contextBlock = renderAutowriteContextBlock({
        canon: pack.canonLines.slice(0, 20),
        timeline: pack.timelineLines.slice(0, 10),
        style: pack.styleLines.slice(0, 12),
        historianGuidance: pack.historianGuidance.slice(0, 8),
    });

    const jobRes = await client.query<{ config_json: any }>(
        `SELECT config_json FROM public.ingest_job WHERE id = $1`, [jobId]
    );

    const fullPayload = {
        ...payload,
        context_block: contextBlock,
        job_config: jobRes.rows[0]?.config_json || {}
    };

    await client.query(
        `INSERT INTO public.ingest_task
         (job_id, story_id, task_type, unit_type, status, payload_json, available_at, seq_no)
         VALUES ($1, $2, $3, 'chapter', 'READY', $4, ${availableAt}, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
        [jobId, storyId, type, JSON.stringify(fullPayload)]
    );
    await ensureIngestWorkerRunning();
}

export async function enqueueChapterWriteV3(config: WritingPipelineConfig) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const chapterId = Number.isFinite(Number(config.chapterNo)) && Number(config.chapterNo) > 0
            ? `ch${String(Math.floor(Number(config.chapterNo))).padStart(2, "0")}`
            : "draft";

        // 1. Build WorkingSet
        const workingSet = await buildWorkingSet(client, config.storyId, chapterId);

        // 2. Create Ingest Job
        const jobRes = await client.query<{ id: number }>(
            `INSERT INTO public.ingest_job
        (story_id, status, mode, config_json, total_tasks)
       VALUES ($1, 'RUNNING', 'AUTO_CHAPTER_V3', $2, 1)
       RETURNING id`,
            [
                config.storyId,
                JSON.stringify({
                    pipeline_type: "CHAPTER_WRITE_V3",
                    chapter_id: chapterId,
                    instructions: config.instructions,
                }),
            ]
        );
        const jobId = jobRes.rows[0].id;

        // 3. Create Task
        await client.query(
            `INSERT INTO public.ingest_task
        (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
       VALUES ($1, $2, 'CHAPTER_WRITE_V3', 'chapter', 'READY', $3, 1)`,
            [
                jobId,
                config.storyId,
                JSON.stringify({
                    chapter_id: chapterId,
                    chapter_goal: config.instructions,
                    working_set: workingSet,
                    style_options: {
                      target_word_count: config.targetWordCount || 2500
                    }
                }),
            ]
        );

        await client.query("COMMIT");
        await ensureIngestWorkerRunning();

        return { jobId, chapterId };
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

export async function advanceChapterWriteV3Pipeline(client: PoolClient, jobId: number) {
    console.log(`[WRITING_PIPELINE] Advancing V3 Pipeline for jobId=${jobId}`);
    const tasks = await client.query<{ status: string, story_id: number, payload_json: any }>(
        `SELECT status, story_id, payload_json FROM public.ingest_task WHERE job_id = $1 AND task_type = 'CHAPTER_WRITE_V3'`,
        [jobId]
    );
    const writeTask = tasks.rows[0];
    if (writeTask && writeTask.status === 'DONE') {
        const ledgerTasks = await client.query<{ status: string }>(
            `SELECT status FROM public.ingest_task WHERE job_id = $1 AND task_type = 'CHAPTER_LEDGER_EXTRACT'`,
            [jobId]
        );

        if ((ledgerTasks.rowCount ?? 0) === 0) {
            await client.query(
                `INSERT INTO public.ingest_task
                (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
                VALUES ($1, $2, 'CHAPTER_LEDGER_EXTRACT', 'chapter', 'READY', $3, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
                [
                    jobId,
                    writeTask.story_id,
                    JSON.stringify(writeTask.payload_json)
                ]
            );
            await ensureIngestWorkerRunning();
        } else if (ledgerTasks.rows[0].status === 'DONE') {
            const rollupTasks = await client.query<{ status: string }>(
                `SELECT status FROM public.ingest_task WHERE job_id = $1 AND task_type = 'MEMORY_ROLLUP_V3'`,
                [jobId]
            );

            if ((rollupTasks.rowCount ?? 0) === 0) {
                await client.query(
                    `INSERT INTO public.ingest_task
                    (job_id, story_id, task_type, unit_type, status, payload_json, seq_no)
                    VALUES ($1, $2, 'MEMORY_ROLLUP_V3', 'chapter', 'READY', $3, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM public.ingest_task WHERE job_id = $1))`,
                    [
                        jobId,
                        writeTask.story_id,
                        JSON.stringify(writeTask.payload_json)
                    ]
                );
                await ensureIngestWorkerRunning();
            } else if (rollupTasks.rows[0].status === 'DONE') {
                await client.query(
                    `UPDATE public.ingest_job SET status = 'DONE', updated_at = now() WHERE id = $1`,
                    [jobId]
                );
            }
        }
    }
}

export async function invalidateDownstream(client: PoolClient, storyId: number, chapterId: string) {
    const chapterNo = parseInt(chapterId.replace(/\D/g, "") || "0");
    if (chapterNo === 0) return;

    console.log(`[RETCON] Invalidating downstream of storyId=${storyId} chapterNo=${chapterNo}`);

    // 1. Mark ledgers as stale for chapters AFTER this one
    await client.query(
        `UPDATE public.chapter_ledger
         SET is_stale = true, stale_reason = $1, updated_at = now()
         WHERE story_id = $2 AND NULLIF(regexp_replace(chapter_id, '[^0-9]', '', 'g'), '')::int > $3`,
        [`RETCON_FROM_${chapterId}`, storyId, chapterNo]
    );

    // 2. Mark milestones as stale for chapters FROM this one onwards
    await client.query(
        `UPDATE public.story_milestone
         SET is_stale = true, stale_reason = $1, updated_at = now()
         WHERE story_id = $2 AND NULLIF(regexp_replace(chapter_to, '[^0-9]', '', 'g'), '')::int >= $3`,
        [`RETCON_FROM_${chapterId}`, storyId, chapterNo]
    );
}
