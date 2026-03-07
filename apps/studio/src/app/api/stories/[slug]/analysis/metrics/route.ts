import { NextRequest, NextResponse } from "next/server";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import { getHistorianGoNoGoMetrics } from "@/features/analysis/server/historianAnalysisService";
import { pool } from "@/server/db/pool";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const storyId = await resolveStoryId(pool, slug);
    const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 7);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(60, daysRaw)) : 7;
    const result = await getHistorianGoNoGoMetrics(storyId, days);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "ANALYSIS_METRICS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

