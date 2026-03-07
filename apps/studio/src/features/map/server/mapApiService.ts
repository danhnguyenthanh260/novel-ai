import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import {
  appendBeat,
  checkoutMapDraft,
  commitMapWorking,
  deleteBeat,
  exportLatestMapState,
  getMapMetrics,
  getMapOverview,
  getSceneDrawerDetail,
  importMapState,
  mapInput,
  patchBeat,
  patchSceneMapMeta,
  reorderBeats,
  resolveStoryForMapRead,
  resolveStoryForMapWrite,
  restoreMapVersion,
  validateMapStructure,
} from "@/features/map/server/mapService";

function parseSceneId(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_SCENE_ID");
  return Math.floor(n);
}

function parseBeatId(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_BEAT_ID");
  return Math.floor(n);
}

function parseVersionNo(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("INVALID_VERSION_NO");
  return Math.floor(n);
}

export async function getMapOverviewResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const { storyId, config } = await resolveStoryForMapRead(pool, storySlug);
    const includeMeta = (req.nextUrl.searchParams.get("include_meta") ?? "").trim() === "1";
    const payload = await getMapOverview(pool, {
      storyId,
      includeMeta,
      createdBy: "api",
    });
    return NextResponse.json({
      ok: true,
      ...payload,
      map_locked: config.map_locked,
      thread_orphan_n: config.thread_orphan_n,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_GET_FAILED";
    const status = msg.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function checkoutMapResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json().catch(() => ({}))) as { created_by?: string; note?: string };
    const result = await checkoutMapDraft(pool, {
      storyId,
      createdBy: mapInput.sanitizeText(body.created_by) || "api",
      note: mapInput.sanitizeText(body.note) || "checkout",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_CHECKOUT_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function commitMapResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json().catch(() => ({}))) as { created_by?: string; note?: string };
    const result = await commitMapWorking(pool, {
      storyId,
      createdBy: mapInput.sanitizeText(body.created_by) || "api",
      note: mapInput.sanitizeText(body.note) || "commit",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_COMMIT_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function exportMapResponse(storySlug: string): Promise<NextResponse> {
  try {
    const { storyId, config } = await resolveStoryForMapRead(pool, storySlug);
    const result = await exportLatestMapState(pool, {
      storyId,
      createdBy: "api",
    });
    return NextResponse.json({
      ...result,
      map_locked: config.map_locked,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_EXPORT_FAILED";
    const status = msg.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function importMapResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  try {
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json()) as {
      payload?: unknown;
      created_by?: unknown;
    };
    if (!body?.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
    }
    const result = await importMapState(pool, {
      storyId,
      payload: body.payload as Record<string, unknown>,
      createdBy: mapInput.sanitizeText(body.created_by) || "api",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_IMPORT_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function getMapMetricsResponse(storySlug: string): Promise<NextResponse> {
  try {
    const { storyId, config } = await resolveStoryForMapRead(pool, storySlug);
    const result = await getMapMetrics(pool, {
      storyId,
      createdBy: "api",
    });
    return NextResponse.json({
      ...result,
      map_locked: config.map_locked,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_METRICS_FAILED";
    const status = msg.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function restoreMapVersionResponse(
  req: NextRequest,
  storySlug: string,
  rawVersionNo: string
): Promise<NextResponse> {
  try {
    const versionNo = parseVersionNo(rawVersionNo);
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json().catch(() => ({}))) as { created_by?: string };
    const result = await restoreMapVersion(pool, {
      storyId,
      versionNo,
      createdBy: mapInput.sanitizeText(body.created_by) || "api",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_RESTORE_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function validateMapResponse(storySlug: string): Promise<NextResponse> {
  try {
    const { storyId, config } = await resolveStoryForMapRead(pool, storySlug);
    const result = await validateMapStructure(pool, {
      storyId,
      createdBy: "api",
    });
    return NextResponse.json({
      ...result,
      map_locked: config.map_locked,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_VALIDATE_FAILED";
    const status = msg.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function patchBeatResponse(
  req: NextRequest,
  storySlug: string,
  rawBeatId: string
): Promise<NextResponse> {
  try {
    const beatId = parseBeatId(rawBeatId);
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json()) as {
      goal?: string;
      conflict?: string;
      outcome?: string;
      pov?: string;
      thread_ids?: unknown;
      arc_id?: number | string | null;
      notes_json?: unknown;
    };
    const result = await patchBeat(pool, {
      storyId,
      beatId,
      goal: body.goal !== undefined ? mapInput.sanitizeText(body.goal) : undefined,
      conflict: body.conflict !== undefined ? mapInput.sanitizeText(body.conflict) : undefined,
      outcome: body.outcome !== undefined ? mapInput.sanitizeText(body.outcome) : undefined,
      pov: body.pov !== undefined ? mapInput.sanitizeText(body.pov) : undefined,
      threadIds: body.thread_ids !== undefined ? mapInput.parseThreadIds(body.thread_ids) : undefined,
      arcId: body.arc_id === undefined ? undefined : body.arc_id === null ? null : Math.floor(Number(body.arc_id)),
      notesJson: body.notes_json !== undefined ? mapInput.parseNotes(body.notes_json) : undefined,
      createdBy: "api",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_BEAT_PATCH_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function deleteBeatResponse(storySlug: string, rawBeatId: string): Promise<NextResponse> {
  try {
    const beatId = parseBeatId(rawBeatId);
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const result = await deleteBeat(pool, {
      storyId,
      beatId,
      createdBy: "api",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_BEAT_DELETE_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function getSceneMapDetailResponse(storySlug: string, rawSceneId: string): Promise<NextResponse> {
  try {
    const sceneId = parseSceneId(rawSceneId);
    const { storyId, config } = await resolveStoryForMapRead(pool, storySlug);
    const payload = await getSceneDrawerDetail(pool, {
      storyId,
      sceneId,
      createdBy: "api",
    });
    return NextResponse.json({
      ok: true,
      ...payload,
      map_locked: config.map_locked,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_SCENE_GET_FAILED";
    const status = msg.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function patchSceneMapMetaResponse(
  req: NextRequest,
  storySlug: string,
  rawSceneId: string
): Promise<NextResponse> {
  try {
    const sceneId = parseSceneId(rawSceneId);
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json()) as {
      chapter_id?: string;
      sequence_no?: number | string;
      act_label?: string | null;
      arc_id?: number | string | null;
    };
    const sequenceNoRaw = body.sequence_no;
    const arcRaw = body.arc_id;
    const result = await patchSceneMapMeta(pool, {
      storyId,
      sceneId,
      chapterId: body.chapter_id !== undefined ? mapInput.sanitizeText(body.chapter_id) : undefined,
      sequenceNo: sequenceNoRaw !== undefined ? Math.max(0, mapInput.parseSmallInt(sequenceNoRaw, 0)) : undefined,
      actLabel: body.act_label !== undefined ? (body.act_label === null ? null : mapInput.sanitizeText(body.act_label)) : undefined,
      arcId: arcRaw !== undefined ? (arcRaw === null ? null : Math.floor(Number(arcRaw))) : undefined,
      createdBy: "api",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_SCENE_PATCH_FAILED";
    const status = msg.includes("MAP_LOCKED")
      ? 403
      : msg.includes("NOT_FOUND")
        ? 404
        : msg.includes("STORY_ARCHIVED")
          ? 409
          : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function appendBeatResponse(
  req: NextRequest,
  storySlug: string,
  rawSceneId: string
): Promise<NextResponse> {
  try {
    const sceneId = parseSceneId(rawSceneId);
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json()) as {
      goal?: string;
      conflict?: string;
      outcome?: string;
      pov?: string;
      thread_ids?: unknown;
      arc_id?: number | string | null;
      notes_json?: unknown;
    };

    const result = await appendBeat(pool, {
      storyId,
      sceneId,
      goal: mapInput.sanitizeText(body.goal),
      conflict: mapInput.sanitizeText(body.conflict),
      outcome: mapInput.sanitizeText(body.outcome),
      pov: mapInput.sanitizeText(body.pov),
      threadIds: mapInput.parseThreadIds(body.thread_ids),
      arcId: body.arc_id === undefined ? undefined : body.arc_id === null ? null : Math.floor(Number(body.arc_id)),
      notesJson: mapInput.parseNotes(body.notes_json),
      createdBy: "api",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_BEAT_CREATE_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function reorderBeatsResponse(
  req: NextRequest,
  storySlug: string,
  rawSceneId: string
): Promise<NextResponse> {
  try {
    const sceneId = parseSceneId(rawSceneId);
    const { storyId } = await resolveStoryForMapWrite(pool, storySlug);
    const body = (await req.json()) as {
      beat_ids?: unknown;
    };
    const beatIds = mapInput.parseThreadIds(body.beat_ids);
    const result = await reorderBeats(pool, {
      storyId,
      sceneId,
      beatIds,
      createdBy: "api",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "MAP_BEAT_REORDER_FAILED";
    const status = msg.includes("MAP_LOCKED") ? 403 : msg.includes("NOT_FOUND") ? 404 : msg.includes("STORY_ARCHIVED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
