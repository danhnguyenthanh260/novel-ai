import { NextRequest } from "next/server";
import { withDefaultScenesAliasDeprecation } from "@/features/scenes/server/scenesApi/defaultAliasDeprecation";
import { getSceneVersionsResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await ctx.params;
  const response = await getSceneVersionsResponse("default", sceneId, false);
  return withDefaultScenesAliasDeprecation(response);
}
