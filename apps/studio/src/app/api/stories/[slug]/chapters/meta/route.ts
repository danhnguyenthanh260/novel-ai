import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await ctx.params;
        const body = await req.json();
        const chapterId = typeof body.chapter_id === "string" ? body.chapter_id.trim() : "";
        const title = typeof body.title === "string" ? body.title.trim() : "";

        if (!chapterId) {
            return NextResponse.json({ error: "INVALID_CHAPTER_ID" }, { status: 400 });
        }

        const storyId = await resolveStoryId(pool, slug);

        await pool.query(
            `INSERT INTO public.story_chapter (story_id, chapter_id, title, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (story_id, chapter_id) DO UPDATE SET
         title = EXCLUDED.title,
         updated_at = now()`,
            [storyId, chapterId, title || null]
        );

        return NextResponse.json({ ok: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "SAVE_CHAPTER_META_FAILED";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
