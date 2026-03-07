import { useCallback, useState } from "react";
import type { WorkerStatus } from "@/features/ingest/components/ingestJobs/types";
import {
  patchIngestJobAction,
  postCreateIngestJob,
  postValidateUpload,
} from "@/features/ingest/hooks/ingestJobsController/http";
import {
  buildUploadFormData,
  uploadMissingInputMessage,
} from "@/features/ingest/hooks/ingestJobsController/uploadForm";

function resolveUploadWorkerInfo(worker: Record<string, unknown> | undefined): string {
  const state = typeof worker?.state === "string" ? worker.state : "";
  const pid = worker?.pid;
  const detail = typeof worker?.detail === "string" ? worker.detail : "unknown";
  if (state === "started") return ` worker started (pid ${pid ?? "-"})`;
  if (state === "already_running") return ` worker running (pid ${pid ?? "-"})`;
  if (state === "disabled") return " worker auto-start disabled";
  if (state === "error") return ` worker start issue: ${detail}`;
  return "";
}

function resolveUploadWorkerStatus(worker: Record<string, unknown> | undefined): WorkerStatus | null {
  if (!worker) return null;
  const state = typeof worker.state === "string" ? worker.state : "";
  return {
    enabled: true,
    running: state === "started" || state === "already_running",
    pid: Number.isFinite(Number(worker.pid)) ? Number(worker.pid) : null,
    detail: typeof worker.detail === "string" ? worker.detail : undefined,
  };
}

export function useIngestUploadActions(params: {
  baseUrl: string;
  selectedJobId: number | null;
  setSelectedJobId: (id: number | null) => void;
  setError: (msg: string | null) => void;
  setUploadInfo: (msg: string | null) => void;
  setWorkerStatus: (status: WorkerStatus | null) => void;
  loadJobs: () => Promise<void>;
  loadTasks: (jobId: number) => Promise<void>;
  loadSourceDocs: () => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"ZIP_UPLOAD" | "MEGA_FILE" | "PASTE_TEXT">("ZIP_UPLOAD");
  const [splitMode, setSplitMode] = useState<"auto" | "manual">("auto");
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(true);
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(true);
  const [maxLlmCalls, setMaxLlmCalls] = useState<1 | 2 | 3>(2);
  const [reviewMode, setReviewMode] = useState<"AUTO_LOCK" | "REVIEW_GATE">("AUTO_LOCK");
  const [validateBeforeSplit, setValidateBeforeSplit] = useState(false);
  const [createdBy, setCreatedBy] = useState("ui");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [megaFile, setMegaFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [pastedName, setPastedName] = useState("pasted_input.txt");
  const [pastedChapterNo, setPastedChapterNo] = useState("");

  const runAction = useCallback(
    async (
      action: "cancel_job" | "retry_failed_tasks" | "retry_task",
      taskId?: number,
      options?: {
        retryProfile?: "auto_recovery_outline" | "auto_recovery_budget" | "auto_recovery_artifact" | "auto_recovery_transport";
      }
    ) => {
      if (!params.selectedJobId || acting) return;
      setActing(true);
      params.setError(null);
      try {
        await patchIngestJobAction(
          params.baseUrl,
          params.selectedJobId,
          action,
          taskId,
          options?.retryProfile
        );
        await params.loadJobs();
        await params.loadTasks(params.selectedJobId);
      } catch (e: unknown) {
        params.setError(e instanceof Error ? e.message : "INGEST_ACTION_FAILED");
      } finally {
        setActing(false);
      }
    },
    [params, acting]
  );

  const validateUpload = useCallback(async () => {
    if (uploading) return;
    params.setError(null);
    params.setUploadInfo(null);
    const form = buildUploadFormData({
      uploadMode,
      splitMode,
      selfHealingEnabled,
      autoRetryEnabled,
      maxLlmCalls,
      createdBy,
      reviewMode,
      includeReviewMode: false,
      validateBeforeSplit,
      zipFile,
      megaFile,
      pastedText,
      pastedName,
      pastedChapterNo,
    });
    if (!form) {
      params.setError(uploadMissingInputMessage(uploadMode));
      return;
    }

    setUploading(true);
    try {
      const summary = await postValidateUpload(params.baseUrl, form);
      params.setUploadInfo(`Validated: chapters=${summary.chapters}, scenes_est=${summary.scenesEstimate}`);
    } catch (e: unknown) {
      params.setError(e instanceof Error ? e.message : "UPLOAD_VALIDATE_FAILED");
    } finally {
      setUploading(false);
    }
  }, [
    params,
    uploading,
    uploadMode,
    splitMode,
    selfHealingEnabled,
    autoRetryEnabled,
    maxLlmCalls,
    createdBy,
    reviewMode,
    zipFile,
    megaFile,
    pastedText,
    pastedName,
    pastedChapterNo,
    validateBeforeSplit,
  ]);

  const createJobFromUpload = useCallback(async () => {
    if (uploading) return;
    params.setError(null);
    params.setUploadInfo(null);
    const form = buildUploadFormData({
      uploadMode,
      splitMode,
      selfHealingEnabled,
      autoRetryEnabled,
      maxLlmCalls,
      createdBy,
      reviewMode,
      includeReviewMode: true,
      validateBeforeSplit,
      zipFile,
      megaFile,
      pastedText,
      pastedName,
      pastedChapterNo,
    });
    if (!form) {
      params.setError(uploadMissingInputMessage(uploadMode));
      return;
    }

    setUploading(true);
    try {
      const json = await postCreateIngestJob(params.baseUrl, form);
      const worker = json.worker as Record<string, unknown> | undefined;
      const summary = json.summary as Record<string, unknown> | undefined;
      params.setUploadInfo(
        `Job #${json?.job_id} created. chapters=${summary?.total_chapters ?? 0}, scenes_est=${summary?.total_scenes_estimate ?? 0
        }.${resolveUploadWorkerInfo(worker)}`
      );
      const status = resolveUploadWorkerStatus(worker);
      if (status) params.setWorkerStatus(status);
      await params.loadJobs();
      await params.loadSourceDocs();
      if (json?.job_id) params.setSelectedJobId(Number(json.job_id));
    } catch (e: unknown) {
      params.setError(e instanceof Error ? e.message : "UPLOAD_CREATE_JOB_FAILED");
    } finally {
      setUploading(false);
    }
  }, [
    params,
    uploading,
    uploadMode,
    splitMode,
    selfHealingEnabled,
    autoRetryEnabled,
    maxLlmCalls,
    createdBy,
    reviewMode,
    zipFile,
    megaFile,
    pastedText,
    pastedName,
    pastedChapterNo,
    validateBeforeSplit,
  ]);

  return {
    acting,
    uploading,
    uploadMode,
    splitMode,
    selfHealingEnabled,
    autoRetryEnabled,
    maxLlmCalls,
    reviewMode,
    validateBeforeSplit,
    createdBy,
    pastedText,
    pastedName,
    pastedChapterNo,
    setUploadMode,
    setSplitMode,
    setSelfHealingEnabled,
    setAutoRetryEnabled,
    setMaxLlmCalls,
    setReviewMode,
    setValidateBeforeSplit,
    setCreatedBy,
    setZipFile,
    setMegaFile,
    setPastedText,
    setPastedName,
    setPastedChapterNo,
    runAction,
    validateUpload,
    createJobFromUpload,
  };
}
