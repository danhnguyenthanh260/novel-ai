import { NextRequest } from "next/server";
import { getReviewsResponse, postReviewsResponse } from "@/features/reviews/server/reviewApiService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return getReviewsResponse(req, storySlug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postReviewsResponse(req, storySlug);
}
