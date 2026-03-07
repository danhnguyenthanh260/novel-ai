import { NextRequest } from "next/server";
import { deleteStoryImageAssetResponse } from "@/features/story/server/storyAssetsApiService";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; imageId: string }> }
) {
  const { slug, imageId } = await ctx.params;
  return deleteStoryImageAssetResponse(slug, imageId);
}
