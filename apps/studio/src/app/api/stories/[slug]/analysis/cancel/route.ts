import { NextRequest, NextResponse } from "next/server";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { cancelHistorianSnapshot } from "@/features/analysis/server/historianAnalysisService";
import { pool } from "@/server/db/pool";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const storyId = await resolveStoryIdForWrite(pool, slug);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const snapshotId = Number(body.snapshot_id || 0);
    const chapterId = typeof body.chapter_id === "string" ? body.chapter_id : "";
    const scopeType = typeof body.scope_type === "string" ? body.scope_type : "chapter";
    const scopeKey = typeof body.scope_key === "string" ? body.scope_key : "";
    const result = await cancelHistorianSnapshot(storyId, {
      snapshot_id: snapshotId,
      chapter_id: chapterId,
      scope_type: scopeType,
      scope_key: scopeKey,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "ANALYSIS_CANCEL_FAILED";
    const status = msg.includes("NOT_FOUND") ? 404 : msg.includes("INVALID") || msg.includes("MISSING") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
