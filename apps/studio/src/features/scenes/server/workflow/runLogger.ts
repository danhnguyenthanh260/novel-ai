import type { Pool, PoolClient, QueryResult } from "pg";
import type { LlmParams, PipelineRunInput, PipelineRunOutput, PipelineStep } from "./types";

type Queryable = Pool | PoolClient;

type LogRunBase = {
  storyId: number;
  sceneId: number | null;
  step: PipelineStep;
  input?: PipelineRunInput;
  llmParams?: LlmParams;
};

export async function logRunOk(
  db: Queryable,
  args: LogRunBase & {
    output?: PipelineRunOutput;
  }
): Promise<number> {
  const res: QueryResult<{ id: number }> = await db.query(
    `INSERT INTO public.narrative_pipeline_run
      (story_id, scene_id, step, input_json, output_json, llm_params, status, error_text)
     VALUES
      ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, 'OK', NULL)
     RETURNING id`,
    [
      args.storyId,
      args.sceneId,
      args.step,
      JSON.stringify(args.input ?? {}),
      JSON.stringify(args.output ?? {}),
      JSON.stringify(args.llmParams ?? {}),
    ]
  );
  return Number(res.rows[0]?.id ?? 0);
}

export async function logRunError(
  db: Queryable,
  args: LogRunBase & {
    error: unknown;
    output?: PipelineRunOutput;
  }
): Promise<number> {
  const res: QueryResult<{ id: number }> = await db.query(
    `INSERT INTO public.narrative_pipeline_run
      (story_id, scene_id, step, input_json, output_json, llm_params, status, error_text)
     VALUES
      ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, 'ERROR', $7)
     RETURNING id`,
    [
      args.storyId,
      args.sceneId,
      args.step,
      JSON.stringify(args.input ?? {}),
      JSON.stringify(args.output ?? {}),
      JSON.stringify(args.llmParams ?? {}),
      String(args.error instanceof Error ? args.error.message : args.error ?? "UNKNOWN_ERROR"),
    ]
  );
  return Number(res.rows[0]?.id ?? 0);
}
