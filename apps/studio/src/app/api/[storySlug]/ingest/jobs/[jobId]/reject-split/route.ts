import { NextRequest } from "next/server";
import { rejectSplitResponse } from "@/features/ingest/server/ingestAuxService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string; jobId: string }> }) {
  const { storySlug, jobId } = await ctx.params;
  return rejectSplitResponse(req, storySlug, jobId);
}
