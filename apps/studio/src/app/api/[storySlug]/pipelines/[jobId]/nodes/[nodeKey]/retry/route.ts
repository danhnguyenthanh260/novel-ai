import { NextRequest } from "next/server";
import { postPipelineNodeRetryResponse } from "@/features/ingest/server/pipelineNodeService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string; nodeKey: string }> },
) {
  const { storySlug, jobId, nodeKey } = await ctx.params;
  return postPipelineNodeRetryResponse(req, storySlug, jobId, nodeKey);
}
