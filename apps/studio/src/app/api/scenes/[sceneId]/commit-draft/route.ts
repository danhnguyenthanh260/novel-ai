import { NextRequest } from "next/server";
import { postSceneCommitDraftResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await ctx.params;
  return postSceneCommitDraftResponse(req, "default", sceneId);
}
