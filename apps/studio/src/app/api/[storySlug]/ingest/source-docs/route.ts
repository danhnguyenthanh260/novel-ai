import { NextRequest } from "next/server";
import { getIngestSourceDocsResponse, postIngestSourceDocsResponse } from "@/features/ingest/server/ingestSourceDocsService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getIngestSourceDocsResponse(storySlug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postIngestSourceDocsResponse(req, storySlug);
}
