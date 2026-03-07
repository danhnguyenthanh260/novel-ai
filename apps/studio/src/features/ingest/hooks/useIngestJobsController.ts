"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { apiBase } from "@/lib/apiBase";
import { JOBS_PAGE_SIZE } from "@/features/ingest/components/ingestJobs/constants";
import type { WorkerStatus } from "@/features/ingest/components/ingestJobs/types";
import type { ValidateChapterReport, ValidateCustomRule } from "@/features/ingest/components/ingestJobs/validate/types";
import {
  fetchIngestTaxonomyConfig,
  fetchWorkerStatus,
  postRebuildGlobalProfile,
  postSetCanonicalSourceDoc,
  postWorkerAction,
} from "@/features/ingest/hooks/ingestJobsController/http";
import { useIngestJobsData } from "@/features/ingest/hooks/ingestJobsController/useIngestJobsData";
import { useIngestSplitActions } from "@/features/ingest/hooks/ingestJobsController/useIngestSplitActions";
import { useIngestUploadActions } from "@/features/ingest/hooks/ingestJobsController/useIngestUploadActions";

const WORKER_POLL_MS = 15_000;

export function useIngestJobsController(storySlug: string) {
  const [jobsOffset, setJobsOffset] = useState(0);
  const baseUrl = useMemo(() => apiBase(storySlug), [storySlug]);
  const listUrl = useMemo(
    () => `${baseUrl}/ingest/jobs?limit=${JOBS_PAGE_SIZE}&offset=${jobsOffset}`,
    [baseUrl, jobsOffset]
  );
  const [error, setError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [rebuildGlobalBusy, setRebuildGlobalBusy] = useState(false);
  const [canonicalBusyId, setCanonicalBusyId] = useState<string | null>(null);
  const [reprocessReasonCode, setReprocessReasonCode] = useState<
    | "BOUNDARY_QUALITY"
    | "MID_WORD_CUT"
    | "SCENE_SPLIT_TOO_WIDE"
    | "SCENE_SPLIT_TOO_FRAGMENTED"
    | "QUOTE_CONTINUITY_BREAK"
    | "SYSTEMIC_ENTITY_SPLIT"
    | "OTHER"
  >("BOUNDARY_QUALITY");
  const [reprocessNote, setReprocessNote] = useState("");
  const [forcedStrategy, setForcedStrategy] = useState<string | null>("S3_SEMANTIC_RESPLIT");
  const [validateReports, setValidateReports] = useState<ValidateChapterReport[]>([]);
  const [customRules, setCustomRules] = useState<ValidateCustomRule[]>([]);
  const [taxonomyVersion, setTaxonomyVersion] = useState("v1.0");
  const [rulePackVersion, setRulePackVersion] = useState("rp1.0");
  const [tokenKeys, setTokenKeys] = useState<string[]>(["UNCLASSIFIED"]);
  const [validateLoading, setValidateLoading] = useState(false);
  const [validateActing, setValidateActing] = useState(false);
  const jobsPage = Math.floor(jobsOffset / JOBS_PAGE_SIZE) + 1;

  const data = useIngestJobsData({
    baseUrl,
    listUrl,
    storySlug,
    setError,
  });
  const {
    jobs,
    jobsTotal,
    jobsHasNext,
    jobsHasPrev,
    tasks,
    selectedTaskId,
    selectedJobId,
    selectedTask,
    selectedJob,
    loading,
    splitDraft,
    splitLoading,
    existingChapters,
    sourceDocs,
    sourceDocsLoading,
    sceneProgressByChapterTask,
    splitFlagSummary,
    splitHasManualReview,
    shouldShowSplitPanel,
    setSelectedTaskId,
    setSelectedJobId,
    loadJobs,
    loadTasks,
    loadSplitDraft,
    loadExistingChapters,
    loadSourceDocs,
  } = data;
  const jobsPageCount = Math.max(1, Math.ceil(jobsTotal / JOBS_PAGE_SIZE));

  const refreshWorkerStatus = useCallback(async () => {
    try {
      const status = await fetchWorkerStatus(baseUrl);
      if (status) setWorkerStatus(status);
    } catch {
      // ignore
    }
  }, [baseUrl]);

  const runWorkerAction = useCallback(
    async (action: "start" | "stop" | "restart" | "kill" | "start_llama") => {
      if (workerBusy) return;
      setWorkerBusy(true);
      setError(null);
      try {
        const { worker, result } = await postWorkerAction(baseUrl, action);
        setWorkerStatus(worker);
        const detail = result && typeof result.detail === "string" ? result.detail : "";
        setUploadInfo(
          action === "start"
            ? "Worker start requested."
            : action === "stop"
              ? "Worker stopped."
              : action === "restart"
                ? "Worker restarted."
                : `Llama server start requested.${detail ? ` ${detail}` : ""}`
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "WORKER_ACTION_FAILED");
      } finally {
        setWorkerBusy(false);
      }
    },
    [baseUrl, workerBusy]
  );

  const setCanonicalSourceDoc = useCallback(
    async (sourceDocId: string) => {
      if (!sourceDocId || canonicalBusyId) return;
      setCanonicalBusyId(sourceDocId);
      setError(null);
      try {
        const chapterId = await postSetCanonicalSourceDoc(baseUrl, sourceDocId);
        setUploadInfo(`Canonical source set for ${chapterId}.`);
        await loadSourceDocs();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "SOURCE_DOC_SET_CANONICAL_FAILED");
      } finally {
        setCanonicalBusyId(null);
      }
    },
    [baseUrl, canonicalBusyId, loadSourceDocs]
  );

  const rebuildGlobalProfile = useCallback(async () => {
    if (rebuildGlobalBusy) return;
    setRebuildGlobalBusy(true);
    setError(null);
    try {
      const { chapterProfiles, globalBest } = await postRebuildGlobalProfile(baseUrl);
      setUploadInfo(`Global profile rebuilt from ${chapterProfiles} chapter profiles. best=${globalBest}`);
      if (selectedJobId) {
        await loadSplitDraft(selectedJobId);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "REBUILD_GLOBAL_PROFILE_FAILED");
    } finally {
      setRebuildGlobalBusy(false);
    }
  }, [baseUrl, rebuildGlobalBusy, selectedJobId, loadSplitDraft]);

  // ─── Validate actions ───────────────────────────────────────────────────────

  const uploadActions = useIngestUploadActions({
    baseUrl,
    selectedJobId,
    setSelectedJobId,
    setError,
    setUploadInfo,
    setWorkerStatus,
    loadJobs,
    loadTasks,
    loadSourceDocs,
  });

  const loadValidateReport = useCallback(async (jobId: number) => {
    setValidateLoading(true);
    try {
      const res = await fetch(`${baseUrl}/ingest/validate?job_id=${jobId}`);
      const json = await res.json();
      if (json.ok) {
        const chapters: ValidateChapterReport[] = (json.chapters ?? []).map((t: Record<string, unknown>) => ({
          task_id: Number(t.id),
          task_type: typeof t.task_type === "string" ? t.task_type : null,
          source_path: t.source_path as string | null,
          seq_no: Number(t.seq_no),
          status: t.status as string,
          chapter_id: (t.payload_json as Record<string, unknown>)?.chapter_id as string | null ?? null,
          report:
            String(t.task_type || "") === "CHAPTER_VALIDATE"
              ? (t.result_json as ValidateChapterReport["report"] ?? null)
              : null,
        }));
        setValidateReports(chapters);
        setCustomRules(json.custom_rules ?? []);
      }
    } catch {
      // ignore
    } finally {
      setValidateLoading(false);
    }
  }, [baseUrl]);

  const approveChapterData = useCallback(async () => {
    if (!selectedJobId || validateActing) return;
    setValidateActing(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/ingest/validate/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selectedJobId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "APPROVE_CHAPTER_DATA_FAILED");
      setUploadInfo(`Data approved — ${json.split_tasks_inserted} split task(s) created.`);
      await loadJobs();
      await loadTasks(selectedJobId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "APPROVE_CHAPTER_DATA_FAILED");
    } finally {
      setValidateActing(false);
    }
  }, [baseUrl, selectedJobId, validateActing, loadJobs, loadTasks]);

  const approveIngestChapter = useCallback(async (chapterTaskId: number) => {
    if (!selectedJobId || !chapterTaskId || validateActing) return;
    setValidateActing(true);
    setError(null);
    try {
      const res = await fetch(
        `${baseUrl}/ingest/jobs/${selectedJobId}/chapters/${chapterTaskId}/approve-chapter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            created_by: uploadActions.createdBy.trim() || "ui",
            split_mode: uploadActions.splitMode,
            split_controls: {
              self_healing_enabled: uploadActions.selfHealingEnabled,
              auto_retry_enabled: uploadActions.autoRetryEnabled,
              max_llm_calls: uploadActions.maxLlmCalls,
            },
          }),
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "APPROVE_INGEST_CHAPTER_FAILED");
      setUploadInfo(`Chapter task #${chapterTaskId} approved. Split task queued.`);
      await loadJobs();
      await loadTasks(selectedJobId);
      await loadValidateReport(selectedJobId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "APPROVE_INGEST_CHAPTER_FAILED");
    } finally {
      setValidateActing(false);
    }
  }, [
    selectedJobId,
    validateActing,
    baseUrl,
    uploadActions.createdBy,
    uploadActions.splitMode,
    uploadActions.selfHealingEnabled,
    uploadActions.autoRetryEnabled,
    uploadActions.maxLlmCalls,
    loadJobs,
    loadTasks,
    loadValidateReport,
  ]);

  const rejectChapterData = useCallback(async () => {
    if (!selectedJobId || validateActing) return;
    setValidateActing(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/ingest/validate/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selectedJobId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "REJECT_CHAPTER_DATA_FAILED");
      setUploadInfo(`Job #${selectedJobId} data rejected and cancelled.`);
      await loadJobs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "REJECT_CHAPTER_DATA_FAILED");
    } finally {
      setValidateActing(false);
    }
  }, [baseUrl, selectedJobId, validateActing, loadJobs]);

  const addValidateRule = useCallback(async (rule: { pattern: string; description: string; severity: string }) => {
    if (!selectedJobId || validateActing) return;
    setValidateActing(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/ingest/validate/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "ADD_RULE_FAILED");
      setUploadInfo(`Custom rule added (id: ${json.rule_id}).`);
      await loadValidateReport(selectedJobId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ADD_RULE_FAILED");
    } finally {
      setValidateActing(false);
    }
  }, [baseUrl, selectedJobId, validateActing, loadValidateReport]);

  // Auto-load validate report when chapter ingest approval gate is relevant
  useEffect(() => {
    if (selectedJobId && ["AWAITING_DATA_APPROVAL", "RUNNING", "SPLIT_DRAFT"].includes(String(selectedJob?.status || ""))) {
      loadValidateReport(selectedJobId);
    } else {
      setValidateReports([]);
      setCustomRules([]);
    }
  }, [selectedJob?.status, selectedJobId, loadValidateReport]);

  const splitActions = useIngestSplitActions({
    baseUrl,
    createdBy: uploadActions.createdBy,
    reprocessReasonCode,
    reprocessNote,
    splitMode: uploadActions.splitMode,
    selfHealingEnabled: uploadActions.selfHealingEnabled,
    autoRetryEnabled: uploadActions.autoRetryEnabled,
    maxLlmCalls: uploadActions.maxLlmCalls,
    reviewMode: uploadActions.reviewMode,
    forcedStrategy,
    selectedJobId,
    splitDraft,
    existingChapters,
    setError,
    setUploadInfo,
    setWorkerStatus,
    setSelectedJobId,
    loadJobs,
    loadTasks,
    loadSplitDraft,
    loadSourceDocs,
  });
  const { setSelectedChapterIds } = splitActions;

  useEffect(() => {
    refreshWorkerStatus();
    const timer = window.setInterval(refreshWorkerStatus, WORKER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshWorkerStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetchIngestTaxonomyConfig(baseUrl);
        if (cancelled) return;
        setTaxonomyVersion(config.taxonomyVersion);
        setRulePackVersion(config.rulePackVersion);
        setTokenKeys(config.tokenKeys.length > 0 ? config.tokenKeys : ["UNCLASSIFIED"]);
      } catch {
        if (cancelled) return;
        setTokenKeys(["UNCLASSIFIED"]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  useEffect(() => {
    setSelectedChapterIds((prev) =>
      prev.filter((id) => existingChapters.some((chapter) => chapter.chapter_id === id))
    );
  }, [existingChapters, setSelectedChapterIds]);

  return {
    jobs,
    jobsTotal,
    jobsPage,
    jobsPageCount,
    jobsHasPrev,
    jobsHasNext,
    tasks,
    selectedTaskId,
    selectedTask,
    selectedJobId,
    selectedJob,
    loading,
    error,
    acting: uploadActions.acting,
    uploading: uploadActions.uploading,
    uploadMode: uploadActions.uploadMode,
    setUploadMode: uploadActions.setUploadMode,
    splitMode: uploadActions.splitMode,
    setSplitMode: uploadActions.setSplitMode,
    selfHealingEnabled: uploadActions.selfHealingEnabled,
    setSelfHealingEnabled: uploadActions.setSelfHealingEnabled,
    autoRetryEnabled: uploadActions.autoRetryEnabled,
    setAutoRetryEnabled: uploadActions.setAutoRetryEnabled,
    maxLlmCalls: uploadActions.maxLlmCalls,
    setMaxLlmCalls: uploadActions.setMaxLlmCalls,
    reviewMode: uploadActions.reviewMode,
    setReviewMode: uploadActions.setReviewMode,
    validateBeforeSplit: uploadActions.validateBeforeSplit,
    setValidateBeforeSplit: uploadActions.setValidateBeforeSplit,
    createdBy: uploadActions.createdBy,
    setCreatedBy: uploadActions.setCreatedBy,
    setZipFile: uploadActions.setZipFile,
    setMegaFile: uploadActions.setMegaFile,
    pastedText: uploadActions.pastedText,
    setPastedText: uploadActions.setPastedText,
    pastedName: uploadActions.pastedName,
    setPastedName: uploadActions.setPastedName,
    pastedChapterNo: uploadActions.pastedChapterNo,
    setPastedChapterNo: uploadActions.setPastedChapterNo,
    uploadInfo,
    splitDraft,
    splitLoading,
    splitActing: splitActions.splitActing,
    expandedSceneKeys: splitActions.expandedSceneKeys,
    existingChapters,
    selectedChapterIds: splitActions.selectedChapterIds,
    reprocessReasonCode,
    setReprocessReasonCode,
    reprocessNote,
    setReprocessNote,
    forcedStrategy,
    setForcedStrategy,
    reprocessRunning: splitActions.reprocessRunning,
    feedbackBusyByTask: splitActions.feedbackBusyByTask,
    feedbackDraftByTask: splitActions.feedbackDraftByTask,
    workerStatus,
    workerBusy,
    rebuildGlobalBusy,
    sourceDocs,
    sourceDocsLoading,
    canonicalBusyId,
    sceneProgressByChapterTask,
    splitFlagSummary,
    splitHasManualReview,
    taxonomyVersion,
    rulePackVersion,
    tokenKeys,
    shouldShowSplitPanel,
    setSelectedJobId,
    setSelectedTaskId,
    runWorkerAction,
    rebuildGlobalProfile,
    loadJobs,
    validateUpload: uploadActions.validateUpload,
    createJobFromUpload: uploadActions.createJobFromUpload,
    selectAllChapters: splitActions.selectAllChapters,
    clearSelectedChapters: splitActions.clearSelectedChapters,
    loadExistingChapters,
    toggleChapterSelection: splitActions.toggleChapterSelection,
    runReprocessSelectedChapters: splitActions.runReprocessSelectedChapters,
    reprocessSingleChapter: splitActions.reprocessSingleChapter,
    loadSourceDocs,
    setCanonicalSourceDoc,
    runAction: uploadActions.runAction,
    loadSplitDraft,
    runSplitAction: splitActions.runSplitAction,
    approveAllSplitChapters: splitActions.approveAllSplitChapters,
    toggleExpandedScene: splitActions.toggleExpandedScene,
    updateFeedbackDraft: splitActions.updateFeedbackDraft,
    submitSplitFeedback: splitActions.submitSplitFeedback,
    prevJobsPage: () => setJobsOffset((x) => Math.max(0, x - JOBS_PAGE_SIZE)),
    nextJobsPage: () => setJobsOffset((x) => x + JOBS_PAGE_SIZE),
    // Validate
    validateReports,
    customRules,
    validateLoading,
    validateActing,
    approveChapterData,
    approveIngestChapter,
    rejectChapterData,
    addValidateRule,
    baseUrl,
  };
}

export type IngestJobsControllerState = ReturnType<typeof useIngestJobsController>;
