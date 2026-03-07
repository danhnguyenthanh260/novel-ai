import { NextRequest } from "next/server";
import { approveIngestChapterResponse } from "@/features/ingest/server/ingestValidateService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string; chapterTaskId: string }> }
) {
  const { storySlug, jobId, chapterTaskId } = await ctx.params;
  return approveIngestChapterResponse(req, storySlug, jobId, chapterTaskId);
}
