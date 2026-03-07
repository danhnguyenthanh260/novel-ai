import { NextRequest, NextResponse } from "next/server";
import { listCoreMemoryItems } from "@/features/memory/server/coreMemoryService";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const data = await listCoreMemoryItems(slug, {
      status: req.nextUrl.searchParams.get("status") ?? "",
      source_kind: req.nextUrl.searchParams.get("source_kind") ?? "",
      entity_type: req.nextUrl.searchParams.get("entity_type") ?? "",
      classification: req.nextUrl.searchParams.get("classification") ?? "",
      chapter_id: req.nextUrl.searchParams.get("chapter_id") ?? "",
      q: req.nextUrl.searchParams.get("q") ?? "",
      limit: req.nextUrl.searchParams.get("limit") ?? "",
      cursor: req.nextUrl.searchParams.get("cursor") ?? "",
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "CORE_MEMORY_LIST_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
