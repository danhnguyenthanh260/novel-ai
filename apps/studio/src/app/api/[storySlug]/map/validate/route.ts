import { NextRequest } from "next/server";
import { validateMapResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return validateMapResponse(storySlug);
}
