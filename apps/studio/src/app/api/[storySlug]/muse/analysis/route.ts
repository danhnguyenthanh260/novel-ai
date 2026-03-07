import { NextRequest } from "next/server";
import { getMuseAnalysisResponse, postMuseAnalysisResponse } from "@/features/muse/server/museApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getMuseAnalysisResponse(req, storySlug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postMuseAnalysisResponse(req, storySlug);
}
