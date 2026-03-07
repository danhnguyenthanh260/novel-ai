import { pool } from "@/server/db/pool";
import { resolveStoryId } from "@/features/scenes/server/workflow/routeUtils";

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getArcMemory(storySlug: string, opts?: { arc_id?: string | number }) {
  const storyId = await resolveStoryId(pool, storySlug);
  const arcIdRaw = Number(opts?.arc_id ?? 0);
  const useArcFilter = Number.isFinite(arcIdRaw) && arcIdRaw > 0;
  const params: Array<number> = [storyId];
  const arcFilter = useArcFilter ? "AND arc_id = $2" : "";
  if (useArcFilter) params.push(arcIdRaw);
  const res = await pool.query<{
    id: number;
    arc_id: number | null;
    chapter_from: string | null;
    chapter_to: string | null;
    quality_score: string | number | null;
    summary_json: unknown;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, arc_id, chapter_from, chapter_to, quality_score::text, summary_json, created_at::text, updated_at::text
       FROM public.story_milestone
      WHERE story_id = $1
        ${arcFilter}
        AND COALESCE(is_stale, false) = false
      ORDER BY updated_at DESC, created_at DESC, id DESC
      LIMIT 1`,
    params
  );
  if ((res.rowCount ?? 0) <= 0) {
    return {
      story_id: storyId,
      found: false,
      arc_memory: null,
    };
  }
  const row = res.rows[0];
  const summary = asObj(row.summary_json);
  const overlap = asObj(summary.overlap_report);
  const quality = asObj(summary.quality);
  const validationFlags = Array.isArray(quality.validation_flags)
    ? quality.validation_flags.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  return {
    story_id: storyId,
    found: true,
    arc_memory: {
      milestone_id: Number(row.id || 0),
      arc_id: row.arc_id == null ? null : Number(row.arc_id),
      chapter_from: row.chapter_from ? String(row.chapter_from) : null,
      chapter_to: row.chapter_to ? String(row.chapter_to) : null,
      quality_score: Number(row.quality_score || 0),
      overlap_report: {
        dedup_ratio: Number(overlap.dedup_ratio || 0),
        dropped_items: Number(overlap.dropped_items || 0),
        retained_delta_items: Number(overlap.retained_delta_items || 0),
      },
      quality: {
        validation_flags: validationFlags,
      },
      carry_forward_hooks: Array.isArray(summary.carry_forward_hooks) ? summary.carry_forward_hooks : [],
      constraints: Array.isArray(summary.constraints) ? summary.constraints : [],
      pacing_state: asObj(summary.pacing_state),
      created_at: String(row.created_at || ""),
      updated_at: String(row.updated_at || ""),
      snapshot_json: summary,
    },
  };
}

export async function getSagaMemory(storySlug: string) {
  const storyId = await resolveStoryId(pool, storySlug);
  const res = await pool.query<{
    id: number;
    fact_status: string;
    ready_for_writing: boolean;
    narrative_score: string | number | null;
    snapshot_json: unknown;
    created_at: string;
    updated_at: string;
    approval_status: string;
  }>(
    `SELECT id, fact_status, ready_for_writing, narrative_score::text, snapshot_json, created_at::text, updated_at::text, approval_status
       FROM public.writing_scope_snapshot_v1
      WHERE story_id = $1
        AND scope_type = 'story'
        AND COALESCE(is_stale, false) = false
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [storyId]
  );
  if ((res.rowCount ?? 0) <= 0) {
    return {
      story_id: storyId,
      found: false,
      saga_memory: null,
    };
  }
  const row = res.rows[0];
  const snapshot = asObj(row.snapshot_json);
  const unresolvedLoreDebt = Array.isArray(snapshot.unresolved_lore_debt)
    ? snapshot.unresolved_lore_debt
    : [];
  const loreDebtSummary = asObj(snapshot.lore_debt_summary);
  return {
    story_id: storyId,
    found: true,
    saga_memory: {
      snapshot_id: Number(row.id || 0),
      fact_status: String(row.fact_status || "UNVETTED"),
      ready_for_writing: Boolean(row.ready_for_writing),
      narrative_score: Number(row.narrative_score || 0),
      approval_status: String(row.approval_status || "DRAFT"),
      rebuild_reason: String(snapshot.rebuild_reason || "").trim() || null,
      unresolved_lore_debt: unresolvedLoreDebt,
      lore_debt_summary: {
        open_count: Number(loreDebtSummary.open_count || unresolvedLoreDebt.length || 0),
        high_urgency_count: Number(loreDebtSummary.high_urgency_count || 0),
        oldest_debt_chapter: loreDebtSummary.oldest_debt_chapter ? String(loreDebtSummary.oldest_debt_chapter) : null,
      },
      guardrails: Array.isArray(snapshot.next_chapter_guardrails) ? snapshot.next_chapter_guardrails : [],
      canon_risks: Array.isArray(snapshot.canon_risks) ? snapshot.canon_risks : [],
      created_at: String(row.created_at || ""),
      updated_at: String(row.updated_at || ""),
      snapshot_json: snapshot,
    },
  };
}

