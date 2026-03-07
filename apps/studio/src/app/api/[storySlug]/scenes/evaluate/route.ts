import { NextRequest } from "next/server";
import { postScenesEvaluateResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postScenesEvaluateResponse(req, storySlug);
}
