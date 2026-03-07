import { NextRequest } from "next/server";
import { getPipelineOverviewResponse } from "@/features/ingest/server/pipelineOverviewService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string }> },
) {
  const { storySlug } = await ctx.params;
  return getPipelineOverviewResponse(storySlug);
}
