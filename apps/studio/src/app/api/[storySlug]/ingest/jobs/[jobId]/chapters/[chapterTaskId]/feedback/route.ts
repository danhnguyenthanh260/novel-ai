import { NextRequest } from "next/server";
import { postIngestFeedbackResponse } from "@/features/ingest/server/ingestFeedbackService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; jobId: string; chapterTaskId: string }> }
) {
  const { storySlug, jobId, chapterTaskId } = await ctx.params;
  return postIngestFeedbackResponse(req, storySlug, jobId, chapterTaskId);
}
