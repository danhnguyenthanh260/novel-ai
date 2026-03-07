import { NextRequest } from "next/server";
import { approveJobSplitResponse } from "@/features/ingest/server/ingestApproveSplitService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string; jobId: string }> }) {
  const { storySlug, jobId } = await ctx.params;
  return approveJobSplitResponse(req, storySlug, jobId);
}
