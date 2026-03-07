import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { listShelfStories, deleteStoryBySlug } from "@/features/story/server/libraryRepo";

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function getShelfStoriesResponse(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const tags = parseCsv(searchParams.get("tags"));
  const cautions = parseCsv(searchParams.get("cautions"));
  const limit = Number(searchParams.get("limit") ?? 100);
  const scope = searchParams.get("scope") === "published" ? "published" : "all";

  const items = await listShelfStories(pool, { q, tags, cautions, limit, scope });
  return NextResponse.json({ ok: true, items });
}

export async function deleteShelfStoryResponse(req: NextRequest, slug: string): Promise<NextResponse> {
  try {
    const success = await deleteStoryBySlug(pool, slug);
    if (!success) {
      return NextResponse.json({ ok: false, error: "STORY_NOT_FOUND_OR_PROTECTED" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, slug });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "DELETE_STORY_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
