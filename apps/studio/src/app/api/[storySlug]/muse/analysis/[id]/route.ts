import { NextRequest } from "next/server";
import { deleteMuseAnalysisResponse } from "@/features/muse/server/museApiService";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ storySlug: string; id: string }> }
) {
  const { storySlug, id } = await ctx.params;
  return deleteMuseAnalysisResponse(storySlug, id);
}
