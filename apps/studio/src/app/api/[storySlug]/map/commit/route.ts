import { NextRequest } from "next/server";
import { commitMapResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return commitMapResponse(req, storySlug);
}
