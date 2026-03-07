import { NextRequest } from "next/server";
import { getFullChapterResponse } from "@/features/scenes/server/scenesApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; chapterId: string }> }) {
    const { slug, chapterId } = await ctx.params;
    return getFullChapterResponse(slug, chapterId);
}
