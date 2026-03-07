export function buildUploadFormData(params: {
  uploadMode: "ZIP_UPLOAD" | "MEGA_FILE" | "PASTE_TEXT";
  splitMode: "auto" | "manual";
  selfHealingEnabled: boolean;
  autoRetryEnabled: boolean;
  maxLlmCalls: 1 | 2 | 3;
  createdBy: string;
  reviewMode: "AUTO_LOCK" | "REVIEW_GATE";
  includeReviewMode: boolean;
  zipFile: File | null;
  megaFile: File | null;
  pastedText: string;
  pastedName: string;
  pastedChapterNo: string;
  validateBeforeSplit: boolean;
}): FormData | null {
  const form = new FormData();
  form.set("mode", params.uploadMode);
  form.set("split_mode", params.splitMode);
  form.set("self_healing_enabled", String(params.selfHealingEnabled));
  form.set("auto_retry_enabled", String(params.autoRetryEnabled));
  form.set("max_llm_calls", String(params.maxLlmCalls));
  form.set("created_by", params.createdBy.trim() || "ui");
  if (params.includeReviewMode) form.set("review_mode", params.reviewMode);
  form.set("validate_before_split", String(params.validateBeforeSplit));

  if (params.uploadMode === "ZIP_UPLOAD") {
    if (!params.zipFile) return null;
    form.set("zip_file", params.zipFile);
    return form;
  }

  if (params.uploadMode === "MEGA_FILE") {
    if (!params.megaFile) return null;
    form.set("mega_file", params.megaFile);
    return form;
  }

  if (!params.pastedText.trim()) return null;
  form.set("paste_text", params.pastedText);
  form.set("paste_name", params.pastedName.trim() || "pasted_input.txt");
  const chapterNo = Number(params.pastedChapterNo);
  if (Number.isFinite(chapterNo) && chapterNo > 0) {
    form.set("paste_chapter_no", String(Math.floor(chapterNo)));
  }
  return form;
}

export function uploadMissingInputMessage(uploadMode: "ZIP_UPLOAD" | "MEGA_FILE" | "PASTE_TEXT"): string {
  if (uploadMode === "ZIP_UPLOAD") return "Select zip file first.";
  if (uploadMode === "MEGA_FILE") return "Select mega file first.";
  return "Paste text first.";
}
