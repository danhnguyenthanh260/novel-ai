import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/server/db/pool";
import { resolveStoryId, resolveStoryIdForWrite } from "@/features/scenes/server/workflow/routeUtils";

function asPositiveId(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) throw new Error("SOURCE_DOC_ID_REQUIRED");
  return v;
}

export async function getIngestSourceDocsResponse(storySlug: string): Promise<NextResponse> {
  try {
    const storyId = await resolveStoryId(pool, storySlug);
    const res = await pool.query<{
      source_doc_id: string;
      chapter_id: string | null;
      chapter_no: number | null;
      source_path: string | null;
      source_type: string | null;
      source_role: string | null;
      char_len: number;
      is_stable: boolean;
      version: number;
      created_at: string;
    }>(
      `SELECT
         sd.id::text AS source_doc_id,
         COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')) AS chapter_id,
         COALESCE(
           NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_no',''), '\\D', '', 'g'), '')::int,
           NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')), '\\D', '', 'g'), '')::int
         ) AS chapter_no,
         sd.origin->>'source_path' AS source_path,
         sd.origin->>'source_type' AS source_type,
         sd.origin->>'source_role' AS source_role,
         sd.char_len,
         sd.is_stable,
         sd.version,
         sd.created_at::text AS created_at
       FROM public.source_doc sd
       WHERE sd.story_id = $1
         AND sd.doc_type = 'ingest_chapter'
       ORDER BY chapter_no NULLS LAST, chapter_id ASC, sd.created_at DESC`,
      [storyId]
    );
    return NextResponse.json({ ok: true, story_id: storyId, items: res.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "SOURCE_DOCS_LIST_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function postIngestSourceDocsResponse(req: NextRequest, storySlug: string): Promise<NextResponse> {
  const client = await pool.connect();
  try {
    const storyId = await resolveStoryIdForWrite(pool, storySlug);
    const body = (await req.json()) as { source_doc_id?: unknown };
    const sourceDocId = asPositiveId(body.source_doc_id);

    await client.query("BEGIN");
    const targetRes = await client.query<{
      source_doc_id: string;
      chapter_id: string | null;
      chapter_no: number | null;
    }>(
      `SELECT
         sd.id::text AS source_doc_id,
         COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')) AS chapter_id,
         COALESCE(
           NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_no',''), '\\D', '', 'g'), '')::int,
           NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')), '\\D', '', 'g'), '')::int
         ) AS chapter_no
       FROM public.source_doc sd
       WHERE sd.story_id = $1
         AND sd.doc_type = 'ingest_chapter'
         AND sd.id::text = $2
       LIMIT 1`,
      [storyId, sourceDocId]
    );
    if ((targetRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "SOURCE_DOC_NOT_FOUND" }, { status: 404 });
    }
    const target = targetRes.rows[0];
    const chapterId = typeof target.chapter_id === "string" ? target.chapter_id : "";
    const chapterNo = Number.isFinite(Number(target.chapter_no)) ? Number(target.chapter_no) : null;

    await client.query(
      `UPDATE public.source_doc sd
       SET origin = sd.origin || jsonb_build_object('source_role', 'historical_source'),
           is_stable = false
       WHERE sd.story_id = $1
         AND sd.doc_type = 'ingest_chapter'
         AND sd.id::text <> $2
         AND (
           (NULLIF($3::text, '') IS NOT NULL AND COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')) = $3::text)
           OR (
             $4::int IS NOT NULL
             AND COALESCE(
               NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_no',''), '[^0-9]', '', 'g'), '')::int,
               NULLIF(regexp_replace(COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')), '[^0-9]', '', 'g'), '')::int
             ) = $4::int
           )
         )`,
      [storyId, sourceDocId, chapterId || null, chapterNo]
    );

    await client.query(
      `UPDATE public.source_doc sd
       SET origin = sd.origin
           || jsonb_build_object('source_role', 'canonical_truth')
           || CASE
                WHEN COALESCE(sd.origin->>'source_type','') = ''
                THEN jsonb_build_object('source_type', 'canonical_chapter')
                ELSE '{}'::jsonb
              END,
           is_stable = true,
           version = sd.version + 1
       WHERE sd.story_id = $1
         AND sd.doc_type = 'ingest_chapter'
         AND sd.id::text = $2`,
      [storyId, sourceDocId]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      story_id: storyId,
      source_doc_id: sourceDocId,
      chapter_id: chapterId || null,
      chapter_no: chapterNo,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = error instanceof Error ? error.message : "SOURCE_DOC_SET_CANONICAL_FAILED";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  } finally {
    client.release();
  }
}
