import { NextRequest } from "next/server";
import { assignChapterToArcResponse } from "@/features/story/server/storyApiService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
    const { slug } = await ctx.params;
    return assignChapterToArcResponse(req, slug);
}
