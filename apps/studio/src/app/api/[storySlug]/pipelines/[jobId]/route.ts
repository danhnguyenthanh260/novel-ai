import { NextRequest } from "next/server";
import { getPipelineJobSummaryResponse } from "@/features/ingest/server/pipelineNodeService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string }> },
) {
  const { storySlug, jobId } = await ctx.params;
  return getPipelineJobSummaryResponse(req, storySlug, jobId);
}
