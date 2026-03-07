export function profileForRootCause(
  rootCause: string | null | undefined,
): "auto_recovery_outline" | "auto_recovery_budget" | "auto_recovery_artifact" | "auto_recovery_transport" {
  const rc = String(rootCause || "").toUpperCase();
  if (rc === "OUTLINE") return "auto_recovery_outline";
  if (rc === "BUDGET") return "auto_recovery_budget";
  if (rc === "ARTIFACT") return "auto_recovery_artifact";
  return "auto_recovery_transport";
}

export function runbookHintText(
  code: string | null | undefined,
  options?: { oversizedCount?: number | null },
): string {
  const key = String(code || "").toUpperCase();
  const oversizedCountRaw = Number(options?.oversizedCount);
  const oversizedCount = Number.isFinite(oversizedCountRaw) ? oversizedCountRaw : null;
  const oversizedHint = "Run artifact recovery; focus on oversized repair before analysis enqueue.";
  const coverageGapHint = "Analyze artifact gaps: LLM output did not fully cover the source text. Verify outline and content gaps.";
  const genericArtifactHint = "Run artifact recovery and inspect analysis_chunk diagnostics before Smart Retry.";
  if (key === "RUNBOOK_SPLIT_OUTLINE_COVERAGE") return "Increase max_llm_calls and release forced strategy; re-run outline coverage.";
  if (key === "RUNBOOK_SPLIT_BUDGET_PREEMPTION") return "Use budget recovery profile; prioritize primary+repair budget for long chapter.";
  if (key === "RUNBOOK_SPLIT_ARTIFACT_OVERSIZED") return oversizedHint;
  if (key === "RUNBOOK_SPLIT_ARTIFACT_COVERAGE_GAP") return coverageGapHint;
  if (key === "RUNBOOK_SPLIT_ARTIFACT_NOT_READY") {
    if (oversizedCount === null) return genericArtifactHint;
    return oversizedCount > 0 ? oversizedHint : coverageGapHint;
  }
  return "Verify worker/lane/llm health, then run Smart Retry once.";
}

export function ageSecFromIso(iso: string): number {
  const ts = Date.parse(iso || "");
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}

export function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function extractPrompt(payload: Record<string, unknown> | null | undefined, result: Record<string, unknown> | null | undefined) {
  const p = payload && typeof payload === "object" ? payload : null;
  const r = result && typeof result === "object" ? result : null;
  const direct = typeof r?.prompt_text === "string" ? r.prompt_text : typeof p?.prompt_text === "string" ? p.prompt_text : "";
  if (direct) return { text: direct, unavailableReason: null as string | null };
  const trace = Array.isArray(r?.chunk_prompt_trace)
    ? r.chunk_prompt_trace
    : Array.isArray((r as Record<string, unknown> | null)?.split_prompt_trace_chunks)
      ? ((r as Record<string, unknown>).split_prompt_trace_chunks as unknown[])
      : [];
  const merged = trace
    .map((x) => {
      if (!x || typeof x !== "object") return "";
      const text = (x as Record<string, unknown>).user_prompt ?? (x as Record<string, unknown>).prompt_text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
  if (merged) return { text: merged, unavailableReason: null as string | null };
  const unavailableReason =
    (typeof r?.prompt_unavailable_reason === "string" && r.prompt_unavailable_reason.trim()) ||
    (typeof r?.prompt_trace_phase === "string" && r.prompt_trace_phase.toUpperCase() === "PRE_LLM"
      ? "PROMPT_PENDING_PRE_LLM"
      : "PROMPT_UNAVAILABLE");
  return { text: "", unavailableReason };
}
