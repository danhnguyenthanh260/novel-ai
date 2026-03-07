import { NextRequest } from "next/server";
import { getPipelineNodeInspectorLiteResponse } from "@/features/ingest/server/pipelineNodeLogsService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string; nodeKey: string }> },
) {
  const { storySlug, jobId, nodeKey } = await ctx.params;
  return getPipelineNodeInspectorLiteResponse(req, storySlug, jobId, nodeKey);
}
