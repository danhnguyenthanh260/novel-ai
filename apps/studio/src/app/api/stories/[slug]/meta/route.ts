import { NextRequest } from "next/server";
import { getStoryMetaBySlugResponse, patchStoryMetaBySlugResponse } from "@/features/story/server/storyDetailApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getStoryMetaBySlugResponse(slug);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return patchStoryMetaBySlugResponse(req, slug);
}
