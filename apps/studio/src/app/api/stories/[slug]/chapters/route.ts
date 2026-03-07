import { NextRequest } from "next/server";
import { getStoryChaptersResponse } from "@/features/story/server/storyApiService";
import { postNewChapterResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getStoryChaptersResponse(slug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return postNewChapterResponse(req, slug);
}
