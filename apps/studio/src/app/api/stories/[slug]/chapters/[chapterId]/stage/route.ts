import { NextRequest } from "next/server";
import { postChapterStageResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string; chapterId: string }> }) {
    const { slug, chapterId } = await ctx.params;
    return postChapterStageResponse(req, slug, chapterId);
}
