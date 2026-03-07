import { NextRequest, NextResponse } from "next/server";
import { applyCoreMemoryReviewActions } from "@/features/memory/server/coreMemoryService";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await applyCoreMemoryReviewActions(slug, {
      actions: body.actions,
      actor: body.actor,
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "CORE_MEMORY_REVIEW_FAILED";
    const status = msg.includes("STORY_ARCHIVED") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
