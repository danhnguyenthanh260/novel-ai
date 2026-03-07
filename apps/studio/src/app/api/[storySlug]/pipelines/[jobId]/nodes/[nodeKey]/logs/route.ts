import { NextRequest } from "next/server";
import { getPipelineNodeLogsResponse } from "@/features/ingest/server/pipelineNodeService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string; nodeKey: string }> },
) {
  const { storySlug, jobId, nodeKey } = await ctx.params;
  return getPipelineNodeLogsResponse(req, storySlug, jobId, nodeKey);
}
