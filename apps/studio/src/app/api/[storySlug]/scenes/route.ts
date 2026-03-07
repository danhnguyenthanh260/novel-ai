import { NextRequest } from "next/server";
import { getScenesListResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getScenesListResponse(req, storySlug, {
    includeWorkunitSearch: true,
    includeStoryColumns: true,
  });
}
