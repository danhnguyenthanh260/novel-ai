import { NextRequest, NextResponse } from "next/server";
import { listStoryArcsResponse, postStoryArcResponse, deleteStoryArcResponse } from "@/features/story/server/storyApiService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
    const { slug } = await ctx.params;
    return listStoryArcsResponse(slug);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
    const { slug } = await ctx.params;
    return postStoryArcResponse(req, slug);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
    const { slug } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const arcId = Number(searchParams.get("id"));
    if (!arcId) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
    return deleteStoryArcResponse(slug, arcId);
}
