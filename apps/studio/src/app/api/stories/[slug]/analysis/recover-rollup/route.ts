import { NextRequest, NextResponse } from "next/server";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { recoverHistorianRollupTask } from "@/features/analysis/server/historianAnalysisService";
import { pool } from "@/server/db/pool";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const storyId = await resolveStoryIdForWrite(pool, slug);
    const scopeTypeRaw = String(body.scope_type || "").trim().toLowerCase();
    const scopeType = (scopeTypeRaw === "arc" || scopeTypeRaw === "story" || scopeTypeRaw === "batch"
      ? scopeTypeRaw
      : "") as "arc" | "story" | "batch";
    const scopeKey = String(body.scope_key || "").trim();
    const modeRaw = String(body.mode || "requeue").trim().toLowerCase();
    const mode = (modeRaw === "fail" ? "fail" : "requeue") as "requeue" | "fail";
    if (!scopeType || !scopeKey) {
      return NextResponse.json({ ok: false, error: "INVALID_SCOPE_FOR_RECOVERY" }, { status: 400 });
    }
    const result = await recoverHistorianRollupTask(storyId, {
      scope_type: scopeType,
      scope_key: scopeKey,
      mode,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "ANALYSIS_RECOVER_ROLLUP_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
