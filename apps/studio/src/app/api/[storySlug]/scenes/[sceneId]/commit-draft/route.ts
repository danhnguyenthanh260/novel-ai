import { NextRequest } from "next/server";
import { postSceneCommitDraftResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; sceneId: string }> }
) {
  const { storySlug, sceneId } = await ctx.params;
  return postSceneCommitDraftResponse(req, storySlug, sceneId);
}
