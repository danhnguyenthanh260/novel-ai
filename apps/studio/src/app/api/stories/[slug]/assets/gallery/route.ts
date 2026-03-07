import { NextRequest } from "next/server";
import { postGalleryAssetResponse } from "@/features/story/server/storyAssetsApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return postGalleryAssetResponse(req, slug);
}
