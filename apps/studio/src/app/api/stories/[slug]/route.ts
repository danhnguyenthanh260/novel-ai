import { NextRequest } from "next/server";
import { getStoryBySlugResponse, patchStoryBySlugResponse } from "@/features/story/server/storyDetailApiService";
import { deleteShelfStoryResponse } from "@/features/story/server/shelfApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getStoryBySlugResponse(slug);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return patchStoryBySlugResponse(req, slug);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return deleteShelfStoryResponse(req, slug);
}
