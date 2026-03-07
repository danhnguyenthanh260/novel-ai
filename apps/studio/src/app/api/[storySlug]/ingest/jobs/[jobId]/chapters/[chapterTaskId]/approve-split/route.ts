import { NextRequest } from "next/server";
import { approveChapterSplitResponse } from "@/features/ingest/server/ingestApproveSplitService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string; chapterTaskId: string }> }
) {
  const { storySlug, jobId, chapterTaskId } = await ctx.params;
  return approveChapterSplitResponse(req, storySlug, jobId, chapterTaskId);
}
