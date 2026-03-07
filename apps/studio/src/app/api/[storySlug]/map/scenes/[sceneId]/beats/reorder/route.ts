import { NextRequest } from "next/server";
import { reorderBeatsResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string; sceneId: string }> }) {
  const { storySlug, sceneId } = await ctx.params;
  return reorderBeatsResponse(req, storySlug, sceneId);
}
