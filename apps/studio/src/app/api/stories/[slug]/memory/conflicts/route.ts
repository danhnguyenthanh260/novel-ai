import { NextRequest, NextResponse } from "next/server";
import { listEntityConflicts } from "@/features/memory/server/entityConflictService";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const data = await listEntityConflicts(slug, {
      status: req.nextUrl.searchParams.get("status") ?? "",
      severity: req.nextUrl.searchParams.get("severity") ?? "",
      limit: req.nextUrl.searchParams.get("limit") ?? "",
      cursor: req.nextUrl.searchParams.get("cursor") ?? "",
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "ENTITY_CONFLICT_LIST_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

