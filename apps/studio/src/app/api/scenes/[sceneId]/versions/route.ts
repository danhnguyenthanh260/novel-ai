import { NextRequest } from "next/server";
import { getSceneVersionsResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await ctx.params;
  return getSceneVersionsResponse("default", sceneId, false);
}
