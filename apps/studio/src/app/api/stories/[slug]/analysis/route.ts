import { NextRequest, NextResponse } from "next/server";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { listHistorianSnapshots, runHistorianAnalysis } from "@/features/analysis/server/historianAnalysisService";
import { pool } from "@/server/db/pool";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const storyId = await resolveStoryId(pool, slug);
    const chapterId = String(req.nextUrl.searchParams.get("chapter_id") || "").trim() || undefined;
    const scopeTypeRaw = String(req.nextUrl.searchParams.get("scope_type") || "all").trim().toLowerCase();
    const scopeType = (["chapter", "arc", "story", "batch", "all"].includes(scopeTypeRaw)
      ? scopeTypeRaw
      : "all") as "chapter" | "arc" | "story" | "batch" | "all";
    const result = await listHistorianSnapshots(storyId, chapterId, scopeType);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "ANALYSIS_LIST_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const storyId = await resolveStoryIdForWrite(pool, slug);
    const result = await runHistorianAnalysis(storyId, {
      chapter_id: typeof body.chapter_id === "string" ? body.chapter_id : "",
      instructions: typeof body.instructions === "string" ? body.instructions : "",
      scope: (typeof body.scope === "string" ? body.scope : "chapter") as "story" | "chapter" | "chapter_range" | "arc",
      chapter_from: typeof body.chapter_from === "string" ? body.chapter_from : "",
      chapter_to: typeof body.chapter_to === "string" ? body.chapter_to : "",
      arc_id: typeof body.arc_id === "number" || typeof body.arc_id === "string" ? body.arc_id : undefined,
    });
    return NextResponse.json({
      ok: true,
      job_id: result.jobId,
      task_ids: result.taskIds,
      task_id: result.taskId,
      ...result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "ANALYSIS_RUN_FAILED";
    const preflightErrors = new Set([
      "LLAMA_SERVER_OFFLINE",
      "LLAMA_SERVER_NOT_READY",
      "ANALYSIS_LANE_OFFLINE",
      "ANALYSIS_INPUT_OPERATIONAL_STATE_NOT_READY",
    ]);
    const status = preflightErrors.has(msg) ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
