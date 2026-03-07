import { NextRequest } from "next/server";
import { deleteBeatResponse, patchBeatResponse } from "@/features/map/server/mapApiService";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ storySlug: string; beatId: string }> }) {
  const { storySlug, beatId } = await ctx.params;
  return patchBeatResponse(req, storySlug, beatId);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ storySlug: string; beatId: string }> }) {
  const { storySlug, beatId } = await ctx.params;
  return deleteBeatResponse(storySlug, beatId);
}
