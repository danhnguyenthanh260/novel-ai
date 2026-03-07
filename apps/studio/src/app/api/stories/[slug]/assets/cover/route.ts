import { NextRequest } from "next/server";
import { postCoverAssetResponse } from "@/features/story/server/storyAssetsApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return postCoverAssetResponse(req, slug);
}
