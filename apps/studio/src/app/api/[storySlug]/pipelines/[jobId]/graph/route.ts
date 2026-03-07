import { NextRequest } from "next/server";
import { getPipelineGraphResponse } from "@/features/ingest/server/pipelineGraphService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string }> },
) {
  const { storySlug, jobId } = await ctx.params;
  return getPipelineGraphResponse(req, storySlug, jobId);
}
