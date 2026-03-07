import { NextRequest } from "next/server";
import { getStyleProfileResponse, putStyleProfileResponse } from "@/features/story/server/storyProfileService";

export const runtime = "nodejs";

export async function GET(_: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getStyleProfileResponse(storySlug);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return putStyleProfileResponse(req, storySlug);
}
