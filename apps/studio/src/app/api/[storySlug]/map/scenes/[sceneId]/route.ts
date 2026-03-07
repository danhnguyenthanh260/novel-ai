import { NextRequest } from "next/server";
import { getSceneMapDetailResponse, patchSceneMapMetaResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ storySlug: string; sceneId: string }> }) {
  const { storySlug, sceneId } = await ctx.params;
  return getSceneMapDetailResponse(storySlug, sceneId);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ storySlug: string; sceneId: string }> }) {
  const { storySlug, sceneId } = await ctx.params;
  return patchSceneMapMetaResponse(req, storySlug, sceneId);
}
