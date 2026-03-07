import { NextRequest } from "next/server";
import { getMapOverviewResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getMapOverviewResponse(req, storySlug);
}
