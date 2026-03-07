import { NextRequest } from "next/server";
import { restoreMapVersionResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string; versionNo: string }> }) {
  const { storySlug, versionNo } = await ctx.params;
  return restoreMapVersionResponse(req, storySlug, versionNo);
}
