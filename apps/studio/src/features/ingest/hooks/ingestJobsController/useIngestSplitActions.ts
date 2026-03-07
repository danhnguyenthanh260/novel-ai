import { useCallback, useState } from "react";
import { createDefaultFeedbackDraft } from "@/features/ingest/components/ingestJobs/mappers";
import type { ExistingChapter, FeedbackDraft, SplitDraftData, SplitDraftScene, WorkerStatus } from "@/features/ingest/components/ingestJobs/types";
import {
  postApproveSplit,
  postReprocessScenes,
  postRejectSplit,
  postSplitFeedback,
} from "@/features/ingest/hooks/ingestJobsController/http";

function resolveWorkerStatus(worker: Record<string, unknown> | undefined): WorkerStatus | null {
  if (!worker) return null;
  const state = typeof worker.state === "string" ? worker.state : "";
  return {
    enabled: true,
    running: state === "started" || state === "already_running",
    pid: Number.isFinite(Number(worker.pid)) ? Number(worker.pid) : null,
    detail: typeof worker.detail === "string" ? worker.detail : undefined,
  };
}

function resolveWorkerInfo(worker: Record<string, unknown> | undefined): string {
  const state = typeof worker?.state === "string" ? worker.state : "";
  const pid = worker?.pid;
  const detail = typeof worker?.detail === "string" ? worker.detail : "unknown";
  if (state === "started") return ` worker started (pid ${pid ?? "-"})`;
  if (state === "already_running") return ` worker running (pid ${pid ?? "-"})`;
  if (state === "error") return ` worker issue: ${detail}`;
  return "";
}

export function useIngestSplitActions(params: {
  baseUrl: string;
  createdBy: string;
  reprocessReasonCode:
  | "BOUNDARY_QUALITY"
  | "MID_WORD_CUT"
  | "SCENE_SPLIT_TOO_WIDE"
  | "SCENE_SPLIT_TOO_FRAGMENTED"
  | "QUOTE_CONTINUITY_BREAK"
  | "SYSTEMIC_ENTITY_SPLIT"
  | "OTHER";
  reprocessNote: string;
  splitMode: "auto" | "manual";
  selfHealingEnabled: boolean;
  autoRetryEnabled: boolean;
  maxLlmCalls: 1 | 2 | 3;
  reviewMode: "AUTO_LOCK" | "REVIEW_GATE";
  forcedStrategy: string | null;
  selectedJobId: number | null;
  splitDraft: SplitDraftData | null;
  existingChapters: ExistingChapter[];
  setError: (msg: string | null) => void;
  setUploadInfo: (msg: string | null) => void;
  setWorkerStatus: (status: WorkerStatus | null) => void;
  setSelectedJobId: (id: number | null) => void;
  loadJobs: () => Promise<void>;
  loadTasks: (jobId: number) => Promise<void>;
  loadSplitDraft: (jobId: number) => Promise<void>;
  loadSourceDocs: () => Promise<void>;
}) {
  const [splitActing, setSplitActing] = useState(false);
  const [expandedSceneKeys, setExpandedSceneKeys] = useState<string[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [reprocessRunning, setReprocessRunning] = useState(false);
  const [feedbackBusyByTask, setFeedbackBusyByTask] = useState<Record<number, boolean>>({});
  const [feedbackDraftByTask, setFeedbackDraftByTask] = useState<Record<number, FeedbackDraft>>({});

  const runSplitAction = useCallback(
    async (action: "approve" | "reject", chapterTaskId?: number, chapterScenes?: SplitDraftScene[]) => {
      if (!params.selectedJobId || splitActing || !params.splitDraft) return;
      setSplitActing(true);
      params.setError(null);
      try {
        if (action === "approve") {
          const scenesPayload =
            Array.isArray(chapterScenes) && chapterScenes.length > 0 ? chapterScenes : params.splitDraft.scenes;
          try {
            const json = await postApproveSplit(
              params.baseUrl,
              params.selectedJobId,
              params.createdBy,
              scenesPayload,
              chapterTaskId
            );
            params.setUploadInfo(
              `Job #${params.selectedJobId} chapter_task #${json?.chapter_task_id ?? chapterTaskId ?? "-"} approved. Enqueued ${json?.enqueued_scene_tasks ?? 0
              } scene tasks.${resolveWorkerInfo(json.worker as Record<string, unknown> | undefined)}`
            );
          } catch (e: unknown) {
            if (e instanceof Error && e.message === "CHAPTER_ALREADY_APPROVED") {
              params.setUploadInfo(
                `Job #${params.selectedJobId} chapter_task #${chapterTaskId ?? "-"} already approved. Reusing existing scene tasks.`
              );
              await params.loadJobs();
              await params.loadTasks(params.selectedJobId);
              await params.loadSplitDraft(params.selectedJobId);
              return;
            }
            throw e;
          }
        } else {
          await postRejectSplit(params.baseUrl, params.selectedJobId, params.createdBy, "");
          params.setUploadInfo(`Job #${params.selectedJobId} cancelled (rejected).`);
        }
        await params.loadJobs();
        await params.loadTasks(params.selectedJobId);
        await params.loadSplitDraft(params.selectedJobId);
      } catch (e: unknown) {
        params.setError(e instanceof Error ? e.message : "SPLIT_ACTION_FAILED");
      } finally {
        setSplitActing(false);
      }
    },
    [params, splitActing]
  );

  const approveAllSplitChapters = useCallback(async () => {
    if (!params.splitDraft || params.splitDraft.chapters.length === 0 || splitActing || !params.selectedJobId) return;
    setSplitActing(true);
    params.setError(null);
    try {
      let totalEnqueued = 0;
      let skippedApproved = 0;
      for (const chapter of params.splitDraft.chapters) {
        if (chapter.scenes.length === 0) continue;
        try {
          const json = await postApproveSplit(
            params.baseUrl,
            params.selectedJobId,
            params.createdBy,
            chapter.scenes,
            chapter.task_id
          );
          totalEnqueued += Number(json?.enqueued_scene_tasks ?? 0);
        } catch (e: unknown) {
          if (e instanceof Error && e.message === "CHAPTER_ALREADY_APPROVED") {
            skippedApproved += 1;
            continue;
          }
          throw e;
        }
      }
      params.setUploadInfo(
        `Job #${params.selectedJobId} approve-all completed. Enqueued ${totalEnqueued} scene tasks` +
        (skippedApproved > 0 ? `, skipped ${skippedApproved} already-approved chapter(s).` : ".")
      );
      await params.loadJobs();
      await params.loadTasks(params.selectedJobId);
      await params.loadSplitDraft(params.selectedJobId);
    } catch (e: unknown) {
      params.setError(e instanceof Error ? e.message : "APPROVE_ALL_SPLIT_FAILED");
    } finally {
      setSplitActing(false);
    }
  }, [params, splitActing]);

  const toggleChapterSelection = useCallback((chapterId: string) => {
    setSelectedChapterIds((prev) => {
      if (prev.includes(chapterId)) return prev.filter((id) => id !== chapterId);
      return [...prev, chapterId];
    });
  }, []);

  const selectAllChapters = useCallback(() => {
    setSelectedChapterIds(params.existingChapters.map((c) => c.chapter_id));
  }, [params.existingChapters]);

  const clearSelectedChapters = useCallback(() => {
    setSelectedChapterIds([]);
  }, []);

  const runReprocessSelectedChapters = useCallback(async () => {
    if (reprocessRunning || selectedChapterIds.length === 0) return;
    if (!params.reprocessReasonCode) {
      params.setError("REPROCESS_REASON_CODE_REQUIRED");
      return;
    }
    setReprocessRunning(true);
    params.setError(null);
    params.setUploadInfo(null);
    try {
      const json = await postReprocessScenes(params.baseUrl, {
        chapterIds: selectedChapterIds,
        reprocessReasonCode: params.reprocessReasonCode,
        reprocessNote: params.reprocessNote,
        splitMode: params.splitMode,
        selfHealingEnabled: params.selfHealingEnabled,
        autoRetryEnabled: params.autoRetryEnabled,
        maxLlmCalls: params.maxLlmCalls,
        reviewMode: params.reviewMode,
        createdBy: params.createdBy,
        sourceJobId: params.selectedJobId,
        forcedStrategy: params.forcedStrategy,
      });
      const worker = json.worker as Record<string, unknown> | undefined;
      params.setUploadInfo(
        `Reprocess job #${json?.job_id} created for ${Array.isArray(json?.chapter_ids) ? json.chapter_ids.length : selectedChapterIds.length
        } chapters.${resolveWorkerInfo(worker)}`
      );
      const status = resolveWorkerStatus(worker);
      if (status) params.setWorkerStatus(status);
      await params.loadJobs();
      await params.loadSourceDocs();
      if (json?.job_id) params.setSelectedJobId(Number(json.job_id));
    } catch (e: unknown) {
      params.setError(e instanceof Error ? e.message : "REPROCESS_SCENES_FAILED");
    } finally {
      setReprocessRunning(false);
    }
  }, [params, reprocessRunning, selectedChapterIds]);

  const submitSplitFeedback = useCallback(
    async (chapter: SplitDraftData["chapters"][number]) => {
      if (!params.selectedJobId || !chapter.task_id) return;
      if (feedbackBusyByTask[chapter.task_id]) return;
      const draft = feedbackDraftByTask[chapter.task_id] ?? createDefaultFeedbackDraft();
      const hasBoundaryRef = Boolean(draft.sceneIdxLeft || draft.sceneIdxRight || draft.charOffset);
      const hasLocation = draft.locationRef.trim().length > 0;
      const hasTemplatePattern = (draft.note.match(/\+/g) ?? []).length >= 2;
      const hasDirectiveKeyword = /^(?:\[.*?\]\s*)*(AVOID|NEVER|ALWAYS|MUST|RULE:|PREFER:)/i.test(draft.note.trim());

      if ((!hasBoundaryRef && !hasLocation && !hasTemplatePattern && !hasDirectiveKeyword) || draft.note.trim().length < 8) {
        params.setError("TEMPLATE_REQUIRED: [TOKEN]+[SCENE/LINE]+[REASON] or DIRECTIVE_KEYWORD (AVOID/ALWAYS/RULE:/PREFER:)");
        return;
      }
      setFeedbackBusyByTask((prev) => ({ ...prev, [chapter.task_id]: true }));
      params.setError(null);
      try {
        const aiResponse = await postSplitFeedback(
          params.baseUrl,
          params.selectedJobId,
          chapter.task_id,
          chapter.strategy_selected,
          draft,
          params.createdBy
        );
        params.setUploadInfo(
          `Feedback saved for chapter task #${chapter.task_id}.`
        );
        setFeedbackDraftByTask((prev) => ({
          ...prev,
          [chapter.task_id]: { ...draft, aiResponse, open: true },
        }));
        await params.loadSplitDraft(params.selectedJobId);
      } catch (e: unknown) {
        params.setError(e instanceof Error ? e.message : "SPLIT_FEEDBACK_FAILED");
      } finally {
        setFeedbackBusyByTask((prev) => ({ ...prev, [chapter.task_id]: false }));
      }
    },
    [params, feedbackBusyByTask, feedbackDraftByTask]
  );

  const reprocessSingleChapter = useCallback(
    async (chapter: SplitDraftData["chapters"][number]) => {
      if (!params.selectedJobId || !chapter.task_id || !chapter.chapter_id) return;
      if (reprocessRunning) return;

      const draft = feedbackDraftByTask[chapter.task_id];

      setReprocessRunning(true);
      params.setError(null);
      params.setUploadInfo("Reprocessing chapter...");
      try {
        const json = await postReprocessScenes(params.baseUrl, {
          chapterIds: [chapter.chapter_id],
          reprocessReasonCode: params.reprocessReasonCode || "OTHER",
          reprocessNote: draft?.note.trim() || params.reprocessNote || "",
          splitMode: params.splitMode,
          selfHealingEnabled: params.selfHealingEnabled,
          autoRetryEnabled: params.autoRetryEnabled,
          maxLlmCalls: params.maxLlmCalls,
          reviewMode: params.reviewMode,
          createdBy: params.createdBy,
          sourceJobId: params.selectedJobId,
          forcedStrategy: params.forcedStrategy,
        });
        const worker = json.worker as Record<string, unknown> | undefined;
        params.setUploadInfo(
          `Reprocess job #${json?.job_id} created for chapter ${chapter.chapter_id}.${resolveWorkerInfo(worker)}`
        );
        const status = resolveWorkerStatus(worker);
        if (status) params.setWorkerStatus(status);
        await params.loadJobs();
        await params.loadSourceDocs();
        if (json?.job_id) params.setSelectedJobId(Number(json.job_id));
      } catch (e: unknown) {
        params.setError(e instanceof Error ? e.message : "REPROCESS_CHAPTER_FAILED");
      } finally {
        setReprocessRunning(false);
      }
    },
    [params, reprocessRunning, feedbackDraftByTask]
  );

  function toggleExpandedScene(key: string) {
    setExpandedSceneKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function updateFeedbackDraft(taskId: number, patch: Partial<FeedbackDraft>) {
    setFeedbackDraftByTask((prev) => {
      const current = prev[taskId] ?? createDefaultFeedbackDraft();
      return {
        ...prev,
        [taskId]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  return {
    splitActing,
    expandedSceneKeys,
    selectedChapterIds,
    reprocessRunning,
    feedbackBusyByTask,
    feedbackDraftByTask,
    setSelectedChapterIds,
    runSplitAction,
    approveAllSplitChapters,
    toggleChapterSelection,
    selectAllChapters,
    clearSelectedChapters,
    runReprocessSelectedChapters,
    reprocessSingleChapter,
    submitSplitFeedback,
    toggleExpandedScene,
    updateFeedbackDraft,
  };
}
