import { NextRequest } from "next/server";
import { getStoryChapterReadResponse } from "@/features/story/server/storyApiService";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; chapterId: string }> }
) {
  const { slug, chapterId } = await ctx.params;
  return getStoryChapterReadResponse(slug, chapterId);
}
