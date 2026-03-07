import { NextRequest } from "next/server";
import { postScenesRewriteResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postScenesRewriteResponse(req, storySlug);
}
