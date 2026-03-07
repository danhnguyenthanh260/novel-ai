import { NextResponse } from "next/server";
import { getSagaMemory } from "@/features/memory/server/memoryScopeService";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const result = await getSagaMemory(slug);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MEMORY_SAGA_LOAD_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

