import { NextRequest, NextResponse } from "next/server";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { executeWritingPhase } from "@/features/autowrite/server/writingPipelineService";
import { pool } from "@/server/db/pool";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ storySlug: string }> }
) {
    try {
        const { storySlug } = await params;
        const body = await req.json().catch(() => ({}));
        const jobId = Number(body.job_id);
        const approvedPlan = body.plan;

        if (!jobId || !approvedPlan) {
            return NextResponse.json({ ok: false, error: "INVALID_JOB_OR_PLAN" }, { status: 400 });
        }

        const storyId = await resolveStoryIdForWrite(pool, storySlug);

        await executeWritingPhase(jobId, storyId, approvedPlan);

        return NextResponse.json({
            ok: true,
            job_id: jobId,
        });
    } catch (error: any) {
        console.error("[pipeline/execute] error:", error);
        return NextResponse.json(
            { ok: false, error: error.message || "INTERNAL_SERVER_ERROR" },
            { status: 500 }
        );
    }
}
