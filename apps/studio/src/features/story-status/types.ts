// Story-level business state contract.
// These types are author-oriented: they describe what the author needs to do,
// not what the system internally tracks.

export type StoryNextAction =
  | "REVIEW_IMPORT_SPLIT"      // ingest job awaiting approval
  | "RESOLVE_IMPORT_FAILURE"   // ingest job failed
  | "APPLY_REVIEWS"            // review submitted but not applied to canon
  | "REVIEW_SCENES"            // scenes evaluated / reviews open
  | "ACTIVATE_ANALYSIS"        // next chapter ready but no active snapshot
  | "WRITE_NEXT_CHAPTER"       // all clear — continue writing
  | "RESOLVE_CONFLICTS"        // entity_conflict_review open (deferred: iteration 2)
  | "RETRY_MEMORY_ENRICH"      // memory_enrich_task failed (deferred: iteration 2)
  | "PUBLISH_READY_CHAPTER"    // all scenes locked, chapter ready to publish
  | "WAIT_SYSTEM"              // background jobs running, no author action needed
  | "IMPORT_SOURCE"            // no chapters exist yet
  | "IDLE";                    // nothing to do

export type StoryHealth = "healthy" | "attention_needed" | "blocked" | "processing";

/** Per-chapter author-facing state (not raw DB status) */
export type ChapterWorkflowStatus =
  | "not_started"
  | "import_needs_review"
  | "import_failed"
  | "analysis_blocked"
  | "ready_to_write"
  | "draft_in_progress"
  | "scene_review_pending"
  | "apply_pending"
  | "conflict_blocked"
  | "publish_ready"
  | "published";

export interface NextActionDescriptor {
  type: StoryNextAction;
  /** Short author-friendly label ("Review chapter import") */
  label: string;
  /** One-sentence explanation why this is the next step */
  reason: string;
  /** Direct URL to the relevant workspace */
  targetUrl?: string;
  /** Which chapter this action is about, if applicable */
  chapterId?: string | null;
  sceneId?: string | null;
  /** Higher = more urgent. Used to sort workQueue. */
  priority: number;
}

export interface ChapterProgress {
  scenesTotal: number;
  scenesApproved: number;               // status = LOCKED
  scenesNeedReview: number;             // status = EVALUATED
  reviewsOpen: number;
  reviewsSubmittedNotApplied: number;
  conflictsOpen: number;
}

export interface ChapterStatusSummary {
  chapterId: string;
  title?: string | null;
  status: ChapterWorkflowStatus;
  progress: ChapterProgress;
  activeSnapshotReady: boolean;
  nextAction?: NextActionDescriptor;
}

export interface StoryCounts {
  ingestPendingApproval: number;
  ingestFailed: number;
  scenesNeedReview: number;             // EVALUATED without an OPEN review
  reviewOpen: number;
  reviewSubmittedNotApplied: number;
  memoryEnrichFailed: number;
  canonConflictsOpen: number;
  chaptersPublishReady: number;
  systemProcessingJobs: number;
}

export interface StoryActive {
  currentChapterId?: string | null;
  activeSnapshotReady: boolean;
  hasDegradedAnalysis: boolean;
}

export interface StoryStatus {
  storyId: number;
  storySlug: string;
  health: StoryHealth;
  /** The single most important thing the author should do right now */
  nextAction: NextActionDescriptor;
  counts: StoryCounts;
  active: StoryActive;
  /** All chapters with their individual workflow status */
  chapters: ChapterStatusSummary[];
  /** All pending author actions sorted by priority (descending) */
  workQueue: NextActionDescriptor[];
  updatedAt: string;
}
