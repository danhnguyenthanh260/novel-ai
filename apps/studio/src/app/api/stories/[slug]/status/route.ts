import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { getStoryBySlug } from "@/features/scenes/server/workflow/repoStory";
import { computeStoryStatus } from "@/features/story-status/storyStatusService";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await ctx.params;

  const story = await getStoryBySlug(pool, slug);
  if (!story) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const status = await computeStoryStatus(pool, Number(story.id), slug);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "STATUS_COMPUTE_FAILED";
    console.error("[GET /api/stories/:slug/status]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
