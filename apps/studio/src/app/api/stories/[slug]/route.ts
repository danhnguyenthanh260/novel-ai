import { NextRequest, NextResponse } from "next/server";
import { getStoryBySlugResponse, patchStoryBySlugResponse } from "@/features/story/server/storyDetailApiService";
import { deleteStoryBySlug } from "@/features/story/server/libraryRepo";
import { pool } from "@/server/db/pool";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return getStoryBySlugResponse(slug);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return patchStoryBySlugResponse(req, slug);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const success = await deleteStoryBySlug(pool, slug);
    if (!success) {
      return NextResponse.json({ ok: false, error: "STORY_NOT_FOUND_OR_PROTECTED" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, slug });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "DELETE_STORY_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
