import { NextRequest } from "next/server";
import { postAutowriteRunResponse } from "@/features/autowrite/server/autowriteRunService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await ctx.params;
  return postAutowriteRunResponse(req, storySlug);
}
