import { NextRequest } from "next/server";
import { preflightGuardResponse } from "@/features/guard/server/guardApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return preflightGuardResponse(req, storySlug);
}
