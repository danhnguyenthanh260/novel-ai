import { NextRequest } from "next/server";
import { withDefaultScenesAliasDeprecation } from "@/features/scenes/server/scenesApi/defaultAliasDeprecation";
import { postSceneCommitDraftResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await ctx.params;
  const response = await postSceneCommitDraftResponse(req, "default", sceneId);
  return withDefaultScenesAliasDeprecation(response);
}
