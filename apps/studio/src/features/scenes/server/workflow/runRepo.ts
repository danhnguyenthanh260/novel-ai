import type { Pool } from "pg";
import type { LlmParams, PipelineRunInput, PipelineRunOutput, PipelineStep } from "./types";

export class RunRepo {
  constructor(private pool: Pool) {}

  async logRun(args: {
    storyId: number;
    sceneId: number | null;
    step: PipelineStep;
    inputJson?: PipelineRunInput;
    outputJson?: PipelineRunOutput;
    llmParams?: LlmParams;
    status?: "OK" | "ERROR";
    errorText?: string | null;
  }): Promise<number> {
    const { rows } = await this.pool.query<{ id: number }>(
      `INSERT INTO public.narrative_pipeline_run
        (story_id, scene_id, step, input_json, output_json, llm_params, status, error_text)
       VALUES
        ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
       RETURNING id`,
      [
        args.storyId,
        args.sceneId,
        args.step,
        JSON.stringify(args.inputJson ?? {}),
        JSON.stringify(args.outputJson ?? {}),
        JSON.stringify(args.llmParams ?? {}),
        args.status ?? "OK",
        args.errorText ?? null,
      ]
    );
    return Number(rows[0]!.id);
  }
}
