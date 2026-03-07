import { NextRequest } from "next/server";
import { postChapterAutoWriteResponse, getChapterWritingStatusResponse, postChapterAutoWriteRetryResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string; chapterId: string }> }) {
  const { slug, chapterId } = await ctx.params;
  const mode = String((req.nextUrl.searchParams.get("mode") || "")).trim().toLowerCase();
  if (mode === "retry") {
    return postChapterAutoWriteRetryResponse(req, slug, chapterId);
  }
  return postChapterAutoWriteResponse(req, slug, chapterId);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; chapterId: string }> }) {
  const { slug, chapterId } = await ctx.params;
  return getChapterWritingStatusResponse(req, slug, chapterId);
}

