import { NextRequest, NextResponse } from "next/server";
import { getArcMemory } from "@/features/memory/server/memoryScopeService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const arcId = String(req.nextUrl.searchParams.get("arc_id") || "").trim();
    const result = await getArcMemory(slug, { arc_id: arcId || undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MEMORY_ARC_LOAD_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

