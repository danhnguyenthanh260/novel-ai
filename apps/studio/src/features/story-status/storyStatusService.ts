import type { Pool } from "pg";
import type {
  ChapterStatusSummary,
  ChapterWorkflowStatus,
  NextActionDescriptor,
  StoryActive,
  StoryCounts,
  StoryHealth,
  StoryNextAction,
  StoryStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Priority table — higher = more urgent
// ---------------------------------------------------------------------------

const PRIORITY: Record<StoryNextAction, number> = {
  RESOLVE_CONFLICTS:       12,
  RETRY_MEMORY_ENRICH:     11,
  REVIEW_IMPORT_SPLIT:     10,
  RESOLVE_IMPORT_FAILURE:   9,
  APPLY_REVIEWS:            8,
  REVIEW_SCENES:            7,
  ACTIVATE_ANALYSIS:        6,
  WRITE_NEXT_CHAPTER:       5,
  PUBLISH_READY_CHAPTER:    4,
  WAIT_SYSTEM:              3,
  IMPORT_SOURCE:            2,
  IDLE:                     1,
};

// ---------------------------------------------------------------------------
// Raw DB row shapes
// ---------------------------------------------------------------------------

interface IngestRow {
  pending_approval: string;
  failed: string;
  processing: string;
}

interface SceneReviewRow {
  chapter_id: string;
  scenes_total: string;
  scenes_approved: string;
  scenes_need_review: string;
  reviews_open: string;
  reviews_submitted_not_applied: string;
  draft_in_progress: string;
  all_locked: string;
}

interface MemoryFailRow {
  failed_count: string;
}

interface ConflictRow {
  open_conflicts: string;
}

interface SnapshotRow {
  chapter_id: string;
  snapshot_ready: boolean;
  degraded_mode: boolean | null;
}

interface ChapterMetaRow {
  chapter_id: string;
  title: string | null;
  is_stable: boolean;
}

// ---------------------------------------------------------------------------
// Parallel DB queries
// ---------------------------------------------------------------------------

async function queryIngest(pool: Pool, storyId: number): Promise<IngestRow> {
  const res = await pool.query<IngestRow>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('SPLIT_DRAFT','AWAIT_APPROVAL','AWAITING_DATA_APPROVAL'))::text AS pending_approval,
       COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed,
       COUNT(*) FILTER (WHERE status IN ('PENDING','RUNNING'))::text AS processing
     FROM public.ingest_job
     WHERE story_id = $1`,
    [storyId]
  );
  return res.rows[0] ?? { pending_approval: "0", failed: "0", processing: "0" };
}

async function querySceneReviews(pool: Pool, storyId: number): Promise<SceneReviewRow[]> {
  const res = await pool.query<SceneReviewRow>(
    `SELECT
       ns.chapter_id::text AS chapter_id,
       COUNT(ns.id)::text AS scenes_total,
       COUNT(ns.id) FILTER (WHERE ns.status = 'LOCKED')::text AS scenes_approved,
       COUNT(ns.id) FILTER (WHERE ns.status = 'EVALUATED')::text AS scenes_need_review,
       COUNT(rr.id) FILTER (WHERE rr.status = 'OPEN')::text AS reviews_open,
       COUNT(rr.id) FILTER (WHERE rr.status = 'SUBMITTED')::text AS reviews_submitted_not_applied,
       COUNT(ns.id) FILTER (WHERE ns.status IN ('DRAFTING','DRAFTED'))::text AS draft_in_progress,
       (BOOL_AND(ns.status = 'LOCKED') AND COUNT(ns.id) > 0)::text AS all_locked
     FROM public.narrative_scene ns
     LEFT JOIN public.review_request rr ON rr.scene_id = ns.id
     WHERE ns.story_id = $1
       AND ns.status <> 'ARCHIVED'
     GROUP BY ns.chapter_id`,
    [storyId]
  );
  return res.rows;
}

async function queryMemoryFail(pool: Pool, storyId: number): Promise<number> {
  const res = await pool.query<MemoryFailRow>(
    `SELECT COUNT(*)::text AS failed_count
     FROM public.memory_enrich_task
     WHERE story_id = $1 AND status = 'FAILED'`,
    [storyId]
  );
  return Number(res.rows[0]?.failed_count ?? 0);
}

async function queryConflicts(pool: Pool, storyId: number): Promise<number> {
  try {
    const res = await pool.query<ConflictRow>(
      `SELECT COUNT(*)::text AS open_conflicts
       FROM public.entity_conflict_review
       WHERE story_id = $1 AND status = 'REQUIRES_HUMAN_REVIEW'`,
      [storyId]
    );
    return Number(res.rows[0]?.open_conflicts ?? 0);
  } catch {
    // Table may not exist in all deployments
    return 0;
  }
}

async function querySnapshots(pool: Pool, storyId: number): Promise<SnapshotRow[]> {
  try {
    const res = await pool.query<SnapshotRow>(
      `SELECT
         saas.chapter_id::text AS chapter_id,
         (wsv.ready_for_writing = true
           AND wsv.fact_status = 'CLEAN'
           AND COALESCE(wsv.degraded_mode, false) = false
         ) AS snapshot_ready,
         wsv.degraded_mode
       FROM public.story_active_analysis_snapshot saas
       JOIN public.writing_snapshot_v3 wsv ON wsv.id = saas.snapshot_id
       WHERE saas.story_id = $1`,
      [storyId]
    );
    return res.rows;
  } catch {
    return [];
  }
}

async function queryChapterMeta(pool: Pool, storyId: number): Promise<ChapterMetaRow[]> {
  const res = await pool.query<ChapterMetaRow>(
    `WITH chapter_union AS (
       SELECT ns.chapter_id::text AS chapter_id
       FROM public.narrative_scene ns
       WHERE ns.story_id = $1 AND ns.status <> 'ARCHIVED'
       UNION
       SELECT st.chapter_id::text AS chapter_id
       FROM public.narrative_chapter_staging st WHERE st.story_id = $1
       UNION
       SELECT sc.chapter_id::text AS chapter_id
       FROM public.story_chapter sc WHERE sc.story_id = $1
       UNION
       SELECT COALESCE(
         sd.origin->>'chapter_id',
         CASE
           WHEN (sd.origin->>'source_path') IS NOT NULL AND (sd.origin->>'source_path') ~ 'CHAPTER \\d+'
           THEN 'ch' || LPAD(regexp_replace(sd.origin->>'source_path', '.*CHAPTER (\\d+).*', '\\1'), 2, '0')
           ELSE 'ch01'
         END
       ) AS chapter_id
       FROM public.source_doc sd
       WHERE sd.story_id = $1 AND sd.doc_type = 'ingest_chapter'
     )
     SELECT
       cu.chapter_id,
       sc.title,
       COALESCE(bool_or(sd.is_stable), false) AS is_stable
     FROM (SELECT DISTINCT chapter_id FROM chapter_union) cu
     LEFT JOIN public.story_chapter sc
       ON sc.story_id = $1 AND LOWER(TRIM(sc.chapter_id)) = LOWER(TRIM(cu.chapter_id))
     LEFT JOIN public.source_doc sd
       ON sd.story_id = $1
       AND sd.doc_type = 'ingest_chapter'
       AND (
         NULLIF(regexp_replace(cu.chapter_id, '[^0-9]', '', 'g'), '')::int
         = NULLIF(regexp_replace(
             COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path', 'chapter:', '')),
             '[^0-9]', '', 'g'), '')::int
       )
     GROUP BY cu.chapter_id, sc.title
     ORDER BY cu.chapter_id ASC`,
    [storyId]
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Chapter status mapping
// ---------------------------------------------------------------------------

function chapterSortKey(id: string): number {
  const m = id.match(/(\d+)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function deriveChapterStatus(
  meta: ChapterMetaRow,
  sceneRow: SceneReviewRow | undefined,
  snapshotReady: boolean,
  ingestPendingForChapter: boolean,
  ingestFailedForChapter: boolean
): ChapterWorkflowStatus {
  if (ingestPendingForChapter) return "import_needs_review";
  if (ingestFailedForChapter) return "import_failed";

  if (!sceneRow || Number(sceneRow.scenes_total) === 0) {
    // Has source doc but no scenes yet
    if (meta.is_stable) {
      return snapshotReady ? "ready_to_write" : "analysis_blocked";
    }
    return "not_started";
  }

  // Scenes exist — check review & lock states
  if (Number(sceneRow.reviews_submitted_not_applied) > 0) return "apply_pending";
  if (Number(sceneRow.reviews_open) > 0 || Number(sceneRow.scenes_need_review) > 0)
    return "scene_review_pending";
  if (sceneRow.all_locked === "true") return "publish_ready";
  if (Number(sceneRow.draft_in_progress) > 0) return "draft_in_progress";

  // Has scenes but none are in a clear state — treat as draft in progress
  return "draft_in_progress";
}

// ---------------------------------------------------------------------------
// Next action builder
// ---------------------------------------------------------------------------

function buildNextAction(
  type: StoryNextAction,
  slug: string,
  extra: Partial<NextActionDescriptor>
): NextActionDescriptor {
  const base = `/stories/${slug}`;

  const defaults: Record<StoryNextAction, Pick<NextActionDescriptor, "label" | "reason" | "targetUrl">> = {
    RESOLVE_CONFLICTS: {
      label: "Resolve story conflicts",
      reason: "Unresolved conflicts in story knowledge must be fixed before writing.",
      targetUrl: `${base}/memory?tab=conflicts`,
    },
    RETRY_MEMORY_ENRICH: {
      label: "Fix memory extraction errors",
      reason: "Some scenes failed to extract knowledge. Retry to keep story memory accurate.",
      targetUrl: `${base}/memory`,
    },
    REVIEW_IMPORT_SPLIT: {
      label: "Review chapter import",
      reason: "Imported chapters are waiting for your approval before scenes are created.",
      targetUrl: `${base}/ingest`,
    },
    RESOLVE_IMPORT_FAILURE: {
      label: "Fix failed import",
      reason: "A chapter import failed and needs attention.",
      targetUrl: `${base}/ingest`,
    },
    APPLY_REVIEWS: {
      label: "Apply pending reviews",
      reason: "Reviews have been scored but not yet applied to the story.",
      targetUrl: `${base}/reviews`,
    },
    REVIEW_SCENES: {
      label: "Review scenes",
      reason: "Scenes are ready for your review.",
      targetUrl: `${base}/reviews`,
    },
    ACTIVATE_ANALYSIS: {
      label: "Activate story analysis",
      reason: "Story analysis must be activated before you can write the next chapter.",
      targetUrl: `${base}/analysis`,
    },
    WRITE_NEXT_CHAPTER: {
      label: "Write next chapter",
      reason: "The story is ready to continue.",
      targetUrl: `${base}/write`,
    },
    PUBLISH_READY_CHAPTER: {
      label: "Publish chapter",
      reason: "All scenes are approved — this chapter is ready to publish.",
      targetUrl: `${base}/write`,
    },
    WAIT_SYSTEM: {
      label: "Processing…",
      reason: "The system is working. Check back shortly.",
    },
    IMPORT_SOURCE: {
      label: "Import your first chapter",
      reason: "No chapters yet — start by importing source text or writing a new chapter.",
      targetUrl: `${base}/ingest`,
    },
    IDLE: {
      label: "Story is up to date",
      reason: "Nothing requires your attention right now.",
    },
  };

  return {
    type,
    priority: PRIORITY[type],
    ...defaults[type],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Health derivation
// ---------------------------------------------------------------------------

function deriveHealth(counts: StoryCounts, nextAction: StoryNextAction): StoryHealth {
  if (nextAction === "RESOLVE_CONFLICTS" || nextAction === "RESOLVE_IMPORT_FAILURE")
    return "blocked";
  if (nextAction === "RETRY_MEMORY_ENRICH" || nextAction === "REVIEW_IMPORT_SPLIT")
    return "attention_needed";
  if (nextAction === "WAIT_SYSTEM" || counts.systemProcessingJobs > 0)
    return "processing";
  if (
    counts.reviewOpen > 0 ||
    counts.reviewSubmittedNotApplied > 0 ||
    counts.scenesNeedReview > 0
  )
    return "attention_needed";
  return "healthy";
}

// ---------------------------------------------------------------------------
// Main compute function
// ---------------------------------------------------------------------------

export async function computeStoryStatus(
  pool: Pool,
  storyId: number,
  storySlug: string
): Promise<StoryStatus> {
  const [ingest, sceneReviews, memoryFailed, conflicts, snapshots, chapterMeta] =
    await Promise.all([
      queryIngest(pool, storyId),
      querySceneReviews(pool, storyId),
      queryMemoryFail(pool, storyId),
      queryConflicts(pool, storyId),
      querySnapshots(pool, storyId),
      queryChapterMeta(pool, storyId),
    ]);

  // Build lookup maps
  const sceneMap = new Map(sceneReviews.map((r) => [r.chapter_id, r]));
  const snapshotMap = new Map(snapshots.map((s) => [s.chapter_id, s]));

  const ingestPendingApproval = Number(ingest.pending_approval);
  const ingestFailed = Number(ingest.failed);
  const systemProcessing = Number(ingest.processing);

  // Aggregate cross-chapter totals
  let totalScenesNeedReview = 0;
  let totalReviewOpen = 0;
  let totalReviewSubmitted = 0;
  let chaptersPublishReady = 0;

  for (const r of sceneReviews) {
    totalScenesNeedReview += Number(r.scenes_need_review);
    totalReviewOpen += Number(r.reviews_open);
    totalReviewSubmitted += Number(r.reviews_submitted_not_applied);
    if (r.all_locked === "true" && Number(r.scenes_total) > 0) chaptersPublishReady++;
  }

  const counts: StoryCounts = {
    ingestPendingApproval,
    ingestFailed,
    scenesNeedReview: totalScenesNeedReview,
    reviewOpen: totalReviewOpen,
    reviewSubmittedNotApplied: totalReviewSubmitted,
    memoryEnrichFailed: memoryFailed,
    canonConflictsOpen: conflicts,
    chaptersPublishReady,
    systemProcessingJobs: systemProcessing,
  };

  // Per-chapter status
  const sortedMeta = [...chapterMeta].sort(
    (a, b) => chapterSortKey(a.chapter_id) - chapterSortKey(b.chapter_id)
  );

  const chapters: ChapterStatusSummary[] = sortedMeta.map((meta) => {
    const sceneRow = sceneMap.get(meta.chapter_id);
    const snap = snapshotMap.get(meta.chapter_id);
    const snapshotReady = snap?.snapshot_ready ?? false;

    const status = deriveChapterStatus(
      meta,
      sceneRow,
      snapshotReady,
      /* ingestPendingForChapter */ false,  // per-chapter ingest cross-ref is additive complexity; use story-level for now
      /* ingestFailedForChapter */ false
    );

    const progress = {
      scenesTotal: Number(sceneRow?.scenes_total ?? 0),
      scenesApproved: Number(sceneRow?.scenes_approved ?? 0),
      scenesNeedReview: Number(sceneRow?.scenes_need_review ?? 0),
      reviewsOpen: Number(sceneRow?.reviews_open ?? 0),
      reviewsSubmittedNotApplied: Number(sceneRow?.reviews_submitted_not_applied ?? 0),
      conflictsOpen: 0,
    };

    let chapterNextAction: NextActionDescriptor | undefined;
    if (status === "import_needs_review")
      chapterNextAction = buildNextAction("REVIEW_IMPORT_SPLIT", storySlug, { chapterId: meta.chapter_id });
    else if (status === "apply_pending")
      chapterNextAction = buildNextAction("APPLY_REVIEWS", storySlug, {
        chapterId: meta.chapter_id,
        targetUrl: `/stories/${storySlug}/reviews`,
      });
    else if (status === "scene_review_pending")
      chapterNextAction = buildNextAction("REVIEW_SCENES", storySlug, {
        chapterId: meta.chapter_id,
        targetUrl: `/stories/${storySlug}/reviews`,
      });
    else if (status === "analysis_blocked")
      chapterNextAction = buildNextAction("ACTIVATE_ANALYSIS", storySlug, {
        chapterId: meta.chapter_id,
        targetUrl: `/stories/${storySlug}/analysis`,
      });
    else if (status === "ready_to_write")
      chapterNextAction = buildNextAction("WRITE_NEXT_CHAPTER", storySlug, {
        chapterId: meta.chapter_id,
        targetUrl: `/stories/${storySlug}/write?chapter_id=${meta.chapter_id}`,
      });
    else if (status === "publish_ready")
      chapterNextAction = buildNextAction("PUBLISH_READY_CHAPTER", storySlug, {
        chapterId: meta.chapter_id,
        targetUrl: `/stories/${storySlug}/write?chapter_id=${meta.chapter_id}`,
      });

    return {
      chapterId: meta.chapter_id,
      title: meta.title ?? null,
      status,
      progress,
      activeSnapshotReady: snapshotReady,
      nextAction: chapterNextAction,
    };
  });

  // Work queue: collect all chapter-level next actions, deduplicate by type
  const workQueueMap = new Map<StoryNextAction, NextActionDescriptor>();
  for (const ch of chapters) {
    if (!ch.nextAction) continue;
    const existing = workQueueMap.get(ch.nextAction.type);
    if (!existing || ch.nextAction.priority > existing.priority) {
      workQueueMap.set(ch.nextAction.type, ch.nextAction);
    }
  }
  const workQueue = [...workQueueMap.values()].sort((a, b) => b.priority - a.priority);

  // Story-level next action (priority engine)
  const base = `/stories/${storySlug}`;
  let nextAction: NextActionDescriptor;

  if (conflicts > 0) {
    nextAction = buildNextAction("RESOLVE_CONFLICTS", storySlug, {
      reason: `${conflicts} unresolved conflict(s) in story knowledge.`,
    });
  } else if (memoryFailed > 0) {
    nextAction = buildNextAction("RETRY_MEMORY_ENRICH", storySlug, {
      reason: `${memoryFailed} memory extraction task(s) failed.`,
    });
  } else if (ingestPendingApproval > 0) {
    nextAction = buildNextAction("REVIEW_IMPORT_SPLIT", storySlug, {
      reason: `${ingestPendingApproval} imported chapter(s) waiting for your approval.`,
    });
  } else if (ingestFailed > 0) {
    nextAction = buildNextAction("RESOLVE_IMPORT_FAILURE", storySlug, {
      reason: `${ingestFailed} chapter import(s) failed and need attention.`,
    });
  } else if (totalReviewSubmitted > 0) {
    nextAction = buildNextAction("APPLY_REVIEWS", storySlug, {
      reason: `${totalReviewSubmitted} review(s) scored but not yet applied to the story.`,
    });
  } else if (totalReviewOpen > 0 || totalScenesNeedReview > 0) {
    const count = totalReviewOpen + totalScenesNeedReview;
    nextAction = buildNextAction("REVIEW_SCENES", storySlug, {
      reason: `${count} scene(s) awaiting review.`,
    });
  } else {
    // Find the highest-priority chapter that needs action
    const needsAnalysis = chapters.find((ch) => ch.status === "analysis_blocked");
    const readyToWrite = chapters.find((ch) => ch.status === "ready_to_write");
    const publishReady = chapters.find((ch) => ch.status === "publish_ready");

    if (needsAnalysis) {
      nextAction = buildNextAction("ACTIVATE_ANALYSIS", storySlug, {
        chapterId: needsAnalysis.chapterId,
        reason: "Story analysis must be activated before you can write the next chapter.",
        targetUrl: `${base}/analysis`,
      });
    } else if (readyToWrite) {
      nextAction = buildNextAction("WRITE_NEXT_CHAPTER", storySlug, {
        chapterId: readyToWrite.chapterId,
        targetUrl: `${base}/write?chapter_id=${readyToWrite.chapterId}`,
      });
    } else if (publishReady) {
      nextAction = buildNextAction("PUBLISH_READY_CHAPTER", storySlug, {
        chapterId: publishReady.chapterId,
        targetUrl: `${base}/write?chapter_id=${publishReady.chapterId}`,
      });
    } else if (systemProcessing > 0) {
      nextAction = buildNextAction("WAIT_SYSTEM", storySlug, {
        reason: `${systemProcessing} background job(s) running. Check back shortly.`,
      });
    } else if (chapters.length === 0) {
      nextAction = buildNextAction("IMPORT_SOURCE", storySlug, {});
    } else {
      nextAction = buildNextAction("IDLE", storySlug, {});
    }
  }

  const health = deriveHealth(counts, nextAction.type);

  const active: StoryActive = {
    currentChapterId: nextAction.chapterId ?? null,
    activeSnapshotReady: snapshots.some((s) => s.snapshot_ready),
    hasDegradedAnalysis: snapshots.some((s) => s.degraded_mode === true),
  };

  return {
    storyId,
    storySlug,
    health,
    nextAction,
    counts,
    active,
    chapters,
    workQueue,
    updatedAt: new Date().toISOString(),
  };
}
