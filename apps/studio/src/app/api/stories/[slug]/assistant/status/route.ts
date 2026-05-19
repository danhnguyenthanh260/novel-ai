import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { getWorkflowStatus, type WorkflowCommandScope } from "@/features/scenes/server/workflow/statusService";

export const runtime = "nodejs";

function parseScope(value: string | null): WorkflowCommandScope {
  return value === "story" ? "story" : "chapter";
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  const { slug } = await ctx.params;
  try {
    const item = await getWorkflowStatus(pool, {
      storySlug: slug,
      scope: parseScope(req.nextUrl.searchParams.get("scope")),
      chapterId: req.nextUrl.searchParams.get("chapter_id")?.trim() || null,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "WORKFLOW_STATUS_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
