import { NextRequest } from "next/server";
import { getSceneVersionsResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ storySlug: string; sceneId: string }> }) {
  const { storySlug, sceneId } = await ctx.params;
  return getSceneVersionsResponse(storySlug, sceneId, true);
}
