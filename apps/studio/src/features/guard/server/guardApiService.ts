import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";
import { buildCanonGuard } from "@/features/guard/server/canonGuard";

type GuardPreflightBody = {
  scene_id?: unknown;
  workunit_id?: unknown;
  keywords?: unknown;
  max_context_tokens?: unknown;
};

function parseSceneId(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parsePreflightBody(body: GuardPreflightBody) {
  return {
    sceneId: parseSceneId(body.scene_id),
    workunitId: typeof body.workunit_id === "string" ? body.workunit_id.trim() : undefined,
    keywords: typeof body.keywords === "string" ? body.keywords : undefined,
    maxContextTokens:
      typeof body.max_context_tokens === "number" && Number.isFinite(body.max_context_tokens)
        ? body.max_context_tokens
        : undefined,
  };
}

export async function preflightGuardResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const body = (await req.json()) as GuardPreflightBody;
    const storyId = await resolveStoryId(pool, storySlug);
    const parsed = parsePreflightBody(body);

    const guard = await buildCanonGuard(pool, {
      storyId,
      sceneId: parsed.sceneId,
      workunitId: parsed.workunitId,
      keywords: parsed.keywords,
      maxContextTokens: parsed.maxContextTokens,
    });

    return NextResponse.json({
      ok: true,
      story_id: storyId,
      guard,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "GUARD_PREFLIGHT_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
