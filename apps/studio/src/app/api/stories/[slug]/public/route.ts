import { NextRequest } from "next/server";
import { getStoryPublicBySlugResponse } from "@/features/story/server/storyDetailApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getStoryPublicBySlugResponse(slug);
}
