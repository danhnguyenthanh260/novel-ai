import type { Pool, PoolClient } from "pg";
import { logRunError } from "../runLogger";
import type { LlmParams, PipelineStep } from "../types";

export async function rollbackQuiet(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {}
}

export async function logStepErrorQuiet(
  pool: Pool,
  args: {
    storyId: number;
    sceneId: number | null;
    step: PipelineStep;
    input: Record<string, unknown>;
    llmParams: LlmParams;
    error: unknown;
  }
): Promise<void> {
  try {
    await logRunError(pool, {
      storyId: args.storyId,
      sceneId: args.sceneId,
      step: args.step,
      input: args.input,
      llmParams: args.llmParams,
      output: { ok: false },
      error: args.error,
    });
  } catch {}
}
