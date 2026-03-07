import { NextRequest } from "next/server";
import { appendBeatResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string; sceneId: string }> }) {
  const { storySlug, sceneId } = await ctx.params;
  return appendBeatResponse(req, storySlug, sceneId);
}
