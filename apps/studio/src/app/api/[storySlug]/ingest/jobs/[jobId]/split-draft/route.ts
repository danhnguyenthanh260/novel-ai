import { getIngestSplitDraftResponse } from "@/features/ingest/server/ingestSplitDraftService";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ storySlug: string; jobId: string }> }) {
  const { storySlug, jobId } = await ctx.params;
  return getIngestSplitDraftResponse(storySlug, jobId);
}
