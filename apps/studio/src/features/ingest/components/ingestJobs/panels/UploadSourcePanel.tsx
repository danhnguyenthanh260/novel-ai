"use client";

import type { Dispatch, SetStateAction } from "react";

type UploadMode = "ZIP_UPLOAD" | "MEGA_FILE" | "PASTE_TEXT";
type SplitMode = "auto" | "manual";
type ReviewMode = "AUTO_LOCK" | "REVIEW_GATE";

type UploadStateProps = {
  uploadMode: UploadMode;
  setUploadMode: Dispatch<SetStateAction<UploadMode>>;
  splitMode: SplitMode;
  setSplitMode: Dispatch<SetStateAction<SplitMode>>;
  reviewMode: ReviewMode;
  setReviewMode: Dispatch<SetStateAction<ReviewMode>>;
  selfHealingEnabled: boolean;
  setSelfHealingEnabled: Dispatch<SetStateAction<boolean>>;
  autoRetryEnabled: boolean;
  setAutoRetryEnabled: Dispatch<SetStateAction<boolean>>;
  validateBeforeSplit: boolean;
  setValidateBeforeSplit: Dispatch<SetStateAction<boolean>>;
  maxLlmCalls: 1 | 2 | 3;
  setMaxLlmCalls: Dispatch<SetStateAction<1 | 2 | 3>>;
  createdBy: string;
  setCreatedBy: Dispatch<SetStateAction<string>>;
  setZipFile: Dispatch<SetStateAction<File | null>>;
  setMegaFile: Dispatch<SetStateAction<File | null>>;
  pastedName: string;
  setPastedName: Dispatch<SetStateAction<string>>;
  pastedChapterNo: string;
  setPastedChapterNo: Dispatch<SetStateAction<string>>;
  pastedText: string;
  setPastedText: Dispatch<SetStateAction<string>>;
};

type UploadActionProps = {
  uploading: boolean;
  onValidateUpload: () => void;
  onCreateIngestJob: () => void;
};

type UploadSourcePanelProps = UploadStateProps & UploadActionProps;

function UploadConfigControls({
  uploadMode,
  setUploadMode,
  splitMode,
  setSplitMode,
  reviewMode,
  setReviewMode,
  selfHealingEnabled,
  setSelfHealingEnabled,
  autoRetryEnabled,
  setAutoRetryEnabled,
  maxLlmCalls,
  setMaxLlmCalls,
  validateBeforeSplit,
  setValidateBeforeSplit,
  createdBy,
  setCreatedBy,
}: Pick<
  UploadStateProps,
  | "uploadMode"
  | "setUploadMode"
  | "splitMode"
  | "setSplitMode"
  | "reviewMode"
  | "setReviewMode"
  | "selfHealingEnabled"
  | "setSelfHealingEnabled"
  | "autoRetryEnabled"
  | "setAutoRetryEnabled"
  | "maxLlmCalls"
  | "setMaxLlmCalls"
  | "validateBeforeSplit"
  | "setValidateBeforeSplit"
  | "createdBy"
  | "setCreatedBy"
>) {
  return (
    <div className="grid gap-2 md:grid-cols-7">
      <label className="grid gap-1 text-sm">
        <span>Input Mode</span>
        <select
          className="shell-control px-2 py-2 text-sm"
          value={uploadMode}
          onChange={(e) => setUploadMode((e.target.value as UploadMode) ?? "ZIP_UPLOAD")}
        >
          <option value="ZIP_UPLOAD">ZIP_UPLOAD</option>
          <option value="MEGA_FILE">MEGA_FILE</option>
          <option value="PASTE_TEXT">PASTE_TEXT</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Split Mode</span>
        <select
          className="shell-control px-2 py-2 text-sm"
          value={splitMode}
          onChange={(e) => setSplitMode((e.target.value as SplitMode) ?? "auto")}
        >
          <option value="auto">auto (LLM split, no delimiter required)</option>
          <option value="manual">manual (require scene delimiter)</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Review Mode</span>
        <select
          className="shell-control px-2 py-2 text-sm"
          value={reviewMode}
          onChange={(e) => setReviewMode((e.target.value as ReviewMode) ?? "AUTO_LOCK")}
        >
          <option value="AUTO_LOCK">AUTO_LOCK</option>
          <option value="REVIEW_GATE">REVIEW_GATE</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Self-healing</span>
        <select
          className="shell-control px-2 py-2 text-sm"
          value={selfHealingEnabled ? "on" : "off"}
          onChange={(e) => setSelfHealingEnabled(e.target.value === "on")}
        >
          <option value="on">ON</option>
          <option value="off">OFF</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Auto-retry</span>
        <select
          className="shell-control px-2 py-2 text-sm"
          value={autoRetryEnabled ? "on" : "off"}
          onChange={(e) => setAutoRetryEnabled(e.target.value === "on")}
          disabled={!selfHealingEnabled}
        >
          <option value="on">ON</option>
          <option value="off">OFF</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Max LLM calls</span>
        <select
          className="shell-control px-2 py-2 text-sm"
          value={String(maxLlmCalls)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n === 1 || n === 2 || n === 3) setMaxLlmCalls(n);
          }}
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Validate Data</span>
        <select
          className="shell-control px-2 py-2 text-sm"
          value={validateBeforeSplit ? "on" : "off"}
          onChange={(e) => setValidateBeforeSplit(e.target.value === "on")}
        >
          <option value="on">ON (Review first)</option>
          <option value="off">OFF (Direct split)</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Created By</span>
        <input className="shell-control px-2 py-2 text-sm" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
      </label>
    </div>
  );
}

function UploadPayloadInput({
  uploadMode,
  setZipFile,
  setMegaFile,
  pastedName,
  setPastedName,
  pastedChapterNo,
  setPastedChapterNo,
  pastedText,
  setPastedText,
}: Pick<
  UploadStateProps,
  | "uploadMode"
  | "setZipFile"
  | "setMegaFile"
  | "pastedName"
  | "setPastedName"
  | "pastedChapterNo"
  | "setPastedChapterNo"
  | "pastedText"
  | "setPastedText"
>) {
  if (uploadMode === "ZIP_UPLOAD") {
    return (
      <label className="grid gap-1 text-sm">
        <span>ZIP File</span>
        <input
          type="file"
          accept=".zip,application/zip"
          className="shell-control px-2 py-2 text-sm"
          onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
        />
      </label>
    );
  }

  if (uploadMode === "MEGA_FILE") {
    return (
      <label className="grid gap-1 text-sm">
        <span>MEGA File</span>
        <input
          type="file"
          accept=".txt,.md,text/plain"
          className="shell-control px-2 py-2 text-sm"
          onChange={(e) => setMegaFile(e.target.files?.[0] ?? null)}
        />
      </label>
    );
  }

  return (
    <div className="grid gap-2 text-sm">
      <label className="grid gap-1">
        <span>Paste Name</span>
        <input
          className="shell-control px-2 py-2 text-sm"
          value={pastedName}
          onChange={(e) => setPastedName(e.target.value)}
          placeholder="pasted_input.txt"
        />
      </label>
      <label className="grid gap-1">
        <span>Target Chapter No (optional)</span>
        <input
          type="number"
          min={1}
          className="shell-control px-2 py-2 text-sm"
          value={pastedChapterNo}
          onChange={(e) => setPastedChapterNo(e.target.value)}
          placeholder="e.g. 3 => ch03"
        />
      </label>
      <label className="grid gap-1">
        <span>Paste Text</span>
        <textarea
          className="shell-control min-h-40 px-2 py-2 text-sm"
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste chapter text or mega text with chapter markers..."
        />
      </label>
    </div>
  );
}

function UploadActions({ uploading, onValidateUpload, onCreateIngestJob }: UploadActionProps) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="shell-link px-3 py-2 text-sm" onClick={onValidateUpload} disabled={uploading}>
        {uploading ? "Working..." : "Validate Upload"}
      </button>
      <button type="button" className="shell-link px-3 py-2 text-sm" onClick={onCreateIngestJob} disabled={uploading}>
        {uploading ? "Working..." : "Create Ingest Job"}
      </button>
    </div>
  );
}

export function UploadSourcePanel(props: UploadSourcePanelProps) {
  return (
    <section className="surface-card">
      <div className="border-b border-[#223247] px-4 py-3 text-sm font-medium">Upload Source</div>
      <div className="grid gap-3 p-4">
        <UploadConfigControls
          uploadMode={props.uploadMode}
          setUploadMode={props.setUploadMode}
          splitMode={props.splitMode}
          setSplitMode={props.setSplitMode}
          reviewMode={props.reviewMode}
          setReviewMode={props.setReviewMode}
          selfHealingEnabled={props.selfHealingEnabled}
          setSelfHealingEnabled={props.setSelfHealingEnabled}
          autoRetryEnabled={props.autoRetryEnabled}
          setAutoRetryEnabled={props.setAutoRetryEnabled}
          maxLlmCalls={props.maxLlmCalls}
          setMaxLlmCalls={props.setMaxLlmCalls}
          validateBeforeSplit={props.validateBeforeSplit}
          setValidateBeforeSplit={props.setValidateBeforeSplit}
          createdBy={props.createdBy}
          setCreatedBy={props.setCreatedBy}
        />
        <UploadPayloadInput
          uploadMode={props.uploadMode}
          setZipFile={props.setZipFile}
          setMegaFile={props.setMegaFile}
          pastedName={props.pastedName}
          setPastedName={props.setPastedName}
          pastedChapterNo={props.pastedChapterNo}
          setPastedChapterNo={props.setPastedChapterNo}
          pastedText={props.pastedText}
          setPastedText={props.setPastedText}
        />
        <UploadActions
          uploading={props.uploading}
          onValidateUpload={props.onValidateUpload}
          onCreateIngestJob={props.onCreateIngestJob}
        />
      </div>
    </section>
  );
}
