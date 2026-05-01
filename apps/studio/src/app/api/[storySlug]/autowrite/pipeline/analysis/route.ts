import { NextRequest, NextResponse } from "next/server";
import { resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";
import { createWritingAnalysisTask } from "@/features/autowrite/server/writingPipelineService";
import { pool } from "@/server/db/pool";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ storySlug: string }> }
) {
    try {
        const { storySlug } = await params;
        const body = await req.json().catch(() => ({}));
        const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
        const chapterNo = Number(body.chapter_no) || undefined;

        const storyId = await resolveStoryIdForWrite(pool, storySlug);

        const result = await createWritingAnalysisTask({
            storyId,
            instructions: instructions || "Analyze context for a new chapter.",
            chapterNo,
        });

        return NextResponse.json({
            ok: true,
            job_id: result.jobId,
            task_id: "taskId" in result ? result.taskId : null,
            chapter_id: "chapterId" in result ? result.chapterId : null,
        });
    } catch (error: any) {
        console.error("[pipeline/analysis] error:", error);
        return NextResponse.json(
            { ok: false, error: error.message || "INTERNAL_SERVER_ERROR" },
            { status: 500 }
        );
    }
}
