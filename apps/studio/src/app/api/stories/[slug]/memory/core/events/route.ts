import { NextRequest, NextResponse } from "next/server";
import { listCoreMemoryEvents } from "@/features/memory/server/coreMemoryService";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const data = await listCoreMemoryEvents(slug, {
      source_kind: req.nextUrl.searchParams.get("source_kind") ?? "",
      source_id: req.nextUrl.searchParams.get("source_id") ?? "",
      limit: req.nextUrl.searchParams.get("limit") ?? "",
      cursor: req.nextUrl.searchParams.get("cursor") ?? "",
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "CORE_MEMORY_EVENTS_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
