import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { pool } from "@/server/db/pool";
import { getStoryIdBySlug, setStoryCoverImagePath } from "@/features/story/server/libraryRepo";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
    const { slug } = await ctx.params;
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ ok: false, error: "NO_FILE" }, { status: 400 });
        }

        // Validation: 2MB limit
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ ok: false, error: "FILE_TOO_LARGE" }, { status: 400 });
        }

        const storyId = await getStoryIdBySlug(pool, slug);
        if (!storyId) {
            return NextResponse.json({ ok: false, error: "STORY_NOT_FOUND" }, { status: 404 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = path.extname(file.name) || ".jpg";
        // Sanitize extension to common ones
        const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext.toLowerCase()) ? ext : ".jpg";
        const filename = `${slug}_${Date.now()}${safeExt}`;

        // In Next.js App Router, process.cwd() is usually the project root (apps/studio)
        const publicDir = path.join(process.cwd(), "public", "covers");
        const fullPath = path.join(publicDir, filename);

        await writeFile(fullPath, buffer);

        const relativePath = `/covers/${filename}`;
        await setStoryCoverImagePath(pool, storyId, relativePath);

        return NextResponse.json({ ok: true, path: relativePath });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "UPLOAD_FAILED";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
