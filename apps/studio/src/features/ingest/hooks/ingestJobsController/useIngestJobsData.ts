import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ExistingChapter,
  IngestJob,
  IngestTask,
  SourceDocItem,
  SplitDraftData,
} from "@/features/ingest/components/ingestJobs/types";
import {
  fetchJobs,
  fetchSourceDocs,
  fetchSplitDraft,
  fetchStoryChapters,
  fetchTasks,
} from "@/features/ingest/hooks/ingestJobsController/http";

const JOBS_POLL_MS = 10_000;
const TASKS_POLL_MS = 10_000;
const SPLIT_DRAFT_POLL_MS = 15_000;

export function useIngestJobsData(params: {
  baseUrl: string;
  listUrl: string;
  storySlug: string;
  setError: (msg: string | null) => void;
}) {
  const { baseUrl, listUrl, storySlug, setError } = params;
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsHasNext, setJobsHasNext] = useState(false);
  const [jobsHasPrev, setJobsHasPrev] = useState(false);
  const [tasks, setTasks] = useState<IngestTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [splitDraft, setSplitDraft] = useState<SplitDraftData | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);
  const [existingChapters, setExistingChapters] = useState<ExistingChapter[]>([]);
  const [sourceDocs, setSourceDocs] = useState<SourceDocItem[]>([]);
  const [sourceDocsLoading, setSourceDocsLoading] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((j) => String(j.id) === String(selectedJobId)) ?? null,
    [jobs, selectedJobId]
  );
  const selectedTask = useMemo(
    () => tasks.find((t) => String(t.id) === String(selectedTaskId)) ?? null,
    [tasks, selectedTaskId]
  );
  const shouldShowSplitPanel = useMemo(() => {
    const status = selectedJob?.status;
    if (!status) return false;
    return ["SPLIT_DRAFT", "AWAIT_APPROVAL", "APPROVED", "REJECTED", "RUNNING"].includes(status);
  }, [selectedJob]);

  const sceneProgressByChapterTask = useMemo(() => {
    const acc: Record<
      number,
      {
        total: number;
        ready: number;
        running: number;
        done: number;
        failed: number;
      }
    > = {};
    for (const task of tasks) {
      if (task.task_type !== "SCENE_CREATE") continue;
      const chapterTaskId = Number(task.chapter_task_id);
      if (!Number.isFinite(chapterTaskId) || chapterTaskId <= 0) continue;
      if (!acc[chapterTaskId]) {
        acc[chapterTaskId] = { total: 0, ready: 0, running: 0, done: 0, failed: 0 };
      }
      const row = acc[chapterTaskId];
      row.total += 1;
      if (task.status === "READY" || task.status === "PENDING") row.ready += 1;
      else if (task.status === "RUNNING") row.running += 1;
      else if (task.status === "DONE") row.done += 1;
      else if (task.status === "FAILED") row.failed += 1;
    }
    return acc;
  }, [tasks]);

  const splitFlagSummary = useMemo(() => {
    if (!splitDraft) return { total: 0, flagged: 0, pct: 0 };
    const sourceScenes =
      splitDraft.chapters.length > 0
        ? splitDraft.chapters.flatMap((c) => c.scenes)
        : splitDraft.scenes;
    if (sourceScenes.length === 0) return { total: 0, flagged: 0, pct: 0 };
    let flagged = 0;
    for (const s of sourceScenes) {
      if (Array.isArray(s.flags) && s.flags.length > 0) flagged += 1;
    }
    const total = sourceScenes.length;
    const pct = total > 0 ? Math.round((flagged * 10000) / total) / 100 : 0;
    return { total, flagged, pct };
  }, [splitDraft]);

  const splitHasManualReview = useMemo(
    () => Boolean(splitDraft?.chapters?.some((c) => c.supervisor_decision === "manual_review")),
    [splitDraft]
  );

  const loadTasks = useCallback(
    async (jobId: number) => {
      try {
        setTasks(await fetchTasks(baseUrl, jobId));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "GET_INGEST_TASKS_FAILED");
        setTasks([]);
      }
    },
    [baseUrl, setError]
  );

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { jobs: items, total, hasPrev, hasNext } = await fetchJobs(listUrl);
      setJobsTotal(total);
      setJobsHasPrev(hasPrev);
      setJobsHasNext(hasNext);
      setJobs(items);
      if (items.length === 0) {
        setSelectedJobId(null);
        setTasks([]);
      } else if (!selectedJobId || !items.some((j) => String(j.id) === String(selectedJobId))) {
        setSelectedJobId(Number(items[0].id));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "GET_INGEST_JOBS_FAILED");
      setJobs([]);
      setJobsTotal(0);
      setJobsHasPrev(false);
      setJobsHasNext(false);
      setTasks([]);
      setSelectedJobId(null);
    } finally {
      setLoading(false);
    }
  }, [listUrl, selectedJobId, setError]);

  const loadSplitDraft = useCallback(
    async (jobId: number) => {
      setSplitLoading(true);
      try {
        setSplitDraft(await fetchSplitDraft(baseUrl, jobId));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "GET_SPLIT_DRAFT_FAILED");
        setSplitDraft(null);
      } finally {
        setSplitLoading(false);
      }
    },
    [baseUrl, setError]
  );

  const loadExistingChapters = useCallback(async () => {
    try {
      setExistingChapters(await fetchStoryChapters(storySlug));
    } catch {
      setExistingChapters([]);
    }
  }, [storySlug]);

  const loadSourceDocs = useCallback(async () => {
    setSourceDocsLoading(true);
    try {
      setSourceDocs(await fetchSourceDocs(baseUrl));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "SOURCE_DOCS_LIST_FAILED");
    } finally {
      setSourceDocsLoading(false);
    }
  }, [baseUrl, setError]);

  useEffect(() => {
    loadJobs();
    const timer = window.setInterval(loadJobs, JOBS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadJobs]);

  useEffect(() => {
    loadExistingChapters();
  }, [loadExistingChapters]);

  useEffect(() => {
    loadSourceDocs();
  }, [loadSourceDocs]);

  useEffect(() => {
    if (!selectedJobId) return;
    loadTasks(selectedJobId);
    const timer = window.setInterval(() => loadTasks(selectedJobId), TASKS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadTasks, selectedJobId]);

  useEffect(() => {
    if (!tasks.length) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !tasks.some((t) => String(t.id) === String(selectedTaskId))) {
      setSelectedTaskId(Number(tasks[0].id));
    }
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    if (!selectedJobId || !shouldShowSplitPanel) {
      setSplitDraft(null);
      return;
    }
    loadSplitDraft(selectedJobId);
    const timer = window.setInterval(() => loadSplitDraft(selectedJobId), SPLIT_DRAFT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [selectedJobId, shouldShowSplitPanel, loadSplitDraft]);

  return {
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
  };
}
