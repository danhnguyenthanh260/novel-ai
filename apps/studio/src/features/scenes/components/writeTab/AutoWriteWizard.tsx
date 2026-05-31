/* eslint-disable max-lines */
"use client";

import { useEffect, useState } from "react";
import { WritingWorkflowDashboard } from "@/features/autowrite/components/WritingWorkflowDashboard";

type AutoWriteWizardProps = {
    storySlug: string;
    chapterId: string;
    initialPrompt?: string;
    onComplete: (prose: string) => void;
    onClose: () => void;
};

type Beat = {
    idx: number;
    label: string;
    description: string;
    location: string;
    characters: string[];
    estimated_words: number;
};

type PlanResult = {
    title: string;
    summary: string;
    beats: Beat[];
    context_guard: {
        location_anchor: string;
        active_plot_threads: string[];
        important_objects: string[];
    };
    blocked_by_conflict_review?: boolean;
    blocked_by_canon_conflict?: boolean;
    blocked_reason?: string | null;
    writing_intent_mode?: "CONTINUE_CANON" | "RETCON_REWRITE" | string;
    retcon_accepted?: boolean;
    delta_classification?: string | null;
    conflict_resolution_mode?: string | null;
    superseded_fact_refs?: string[];
    new_fact_candidates?: string[];
    canon_delta_report_v1?: Record<string, unknown> | null;
    conflict_root_cause_v1?: Record<string, unknown> | null;
    reanalysis_actions_v1?: Record<string, unknown> | null;
};

type WritingStatusResult = {
    ok: boolean;
    job_id: number;
    status: string;
    progress?: {
        done_tasks: number;
        total_tasks: number;
    };
    staging_ready: boolean;
    prose: string;
    word_count: number;
    integrity_report: {
        location_verified: boolean;
        objects_tracked: string[];
        character_drift_detected: boolean;
    } | null;
    historian_snapshot?: {
        fact_status?: string;
        narrative_score?: number;
        emotional_target?: string | null;
        open_loops?: Array<{ id?: string; description?: string; urgency?: number }>;
        lore_debt?: boolean;
        snapshot_v3?: {
            external_signals?: {
                qdrant?: { style_similarity?: number; status?: string };
                neo4j?: { lineage_conflicts?: Array<Record<string, unknown>>; status?: string };
            };
        };
    } | null;
    latest_task?: {
        task_type: string | null;
        status: string | null;
        error: string | null;
    };
    chapter_output_contract_v1?: {
        word_range?: { min?: number; target?: number; max?: number };
    };
    quality_gate_report_v1?: {
        pass?: boolean;
        fail_codes?: string[];
        checks?: Record<string, { pass?: boolean; detail?: string }>;
    } | null;
    final_review_ready?: boolean;
    memory_runtime_v5?: Record<string, unknown> | null;
    planning_input_pack_json?: Record<string, unknown> | null;
    planning_output_json?: Record<string, unknown> | null;
    prose_input_pack_json?: Record<string, unknown> | null;
    prose_output_json?: Record<string, unknown> | null;
    conflict_report_v1?: Record<string, unknown> | null;
    blocked_by_conflict_review?: boolean;
    resolution_status?: string | null;
    entity_assignments?: Array<Record<string, unknown>>;
    blocked_by_canon_conflict?: boolean;
    writing_intent_mode?: "CONTINUE_CANON" | "RETCON_REWRITE" | string;
    retcon_accepted?: boolean;
    plan_continuity_gate_v1?: Record<string, unknown> | null;
    canonical_diff_preview?: Record<string, unknown> | null;
    character_state_cards_used?: Array<Record<string, unknown>>;
    continuity_evidence_refs?: string[];
    blocking_reason?: string | null;
    fact_lifecycle_v1?: Record<string, unknown> | null;
    canon_delta_report_v1?: Record<string, unknown> | null;
    conflict_root_cause_v1?: Record<string, unknown> | null;
    reanalysis_actions_v1?: Record<string, unknown> | null;
    conflict_resolution_mode?: string | null;
    delta_classification?: string | null;
    superseded_fact_refs?: string[];
    new_fact_candidates?: string[];
};

type PlanningGuardV1 = {
    allowed_characters?: string[];
    characters_used?: string[];
    unknown_character_hits?: string[];
    replan_triggered?: boolean;
};

const TERMINAL_FAILED_STATUSES = new Set(["FAILED", "CANCELLED", "PAUSED"]);

export default function AutoWriteWizard({ storySlug, chapterId, initialPrompt = "", onComplete, onClose }: AutoWriteWizardProps) {
    const normalizedInitialPrompt = initialPrompt.trim();
    const [step, setStep] = useState<"targets" | "planning" | "review" | "executing" | "splitting" | "done">("targets");
    const [targetWords, setTargetWords] = useState(1500);
    const [userPrompt, setUserPrompt] = useState(normalizedInitialPrompt);
    const [plan, setPlan] = useState<PlanResult | null>(null);
    const [prose, setProse] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [executing, setExecuting] = useState(false);
    const [execResult, setExecResult] = useState<WritingStatusResult | null>(null);
    const [activeJobId, setActiveJobId] = useState<number | null>(null);
    const [liveStatus, setLiveStatus] = useState<WritingStatusResult | null>(null);
    const [retrying, setRetrying] = useState(false);
    const [writingIntentMode, setWritingIntentMode] = useState<"CONTINUE_CANON" | "RETCON_REWRITE">("CONTINUE_CANON");
    const [isEditingPlan, setIsEditingPlan] = useState(false);

    useEffect(() => {
        setUserPrompt(normalizedInitialPrompt);
    }, [normalizedInitialPrompt]);

    const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "UNKNOWN_ERROR");
    const sanitizeEditedPlan = (current: PlanResult): PlanResult => ({
        ...current,
        blocked_by_conflict_review: false,
        blocked_by_canon_conflict: false,
        blocked_reason: null,
        delta_classification: null,
        conflict_resolution_mode: "none",
        superseded_fact_refs: [],
        new_fact_candidates: [],
        canon_delta_report_v1: null,
        conflict_root_cause_v1: null,
        reanalysis_actions_v1: null,
    });
    const updatePlan = (updater: (current: PlanResult) => PlanResult) => {
        setPlan((current) => {
            if (!current) return current;
            return updater(sanitizeEditedPlan(current));
        });
        setExecResult(null);
        setIsEditingPlan(true);
    };
    const updateBeat = (beatIdx: number, updater: (beat: Beat) => Beat) => {
        updatePlan((current) => ({
            ...current,
            beats: current.beats.map((beat, idx) => (idx === beatIdx ? updater(beat) : beat)),
        }));
    };

    const pollWritingStatusUntilReady = async (
        jobId: number,
        onTick?: (status: WritingStatusResult) => void
    ): Promise<WritingStatusResult> => {
        const maxPolls = 600;
        for (let i = 0; i < maxPolls; i += 1) {
            const res = await fetch(`/api/stories/${storySlug}/chapters/${chapterId}/auto-write/status?job_id=${jobId}`, {
                method: "GET",
                cache: "no-store",
            });
            const data = await res.json();
            if (!res.ok || data?.ok === false) throw new Error(data.error || "WRITING_STATUS_FAILED");
            const status = data as WritingStatusResult;
            onTick?.(status);
            if (status.staging_ready && typeof status.prose === "string" && status.prose.trim()) return status;
            if (TERMINAL_FAILED_STATUSES.has((status.status || "").toUpperCase())) {
                throw new Error(status.latest_task?.error || `WRITING_${status.status}`);
            }
            await waitMs(2000);
        }
        throw new Error("WRITING_STATUS_TIMEOUT");
    };

    const startPlanning = async () => {
        setStep("planning");
        setError(null);
        setIsEditingPlan(false);
        try {
            const res = await fetch(`/api/stories/${storySlug}/chapters/${chapterId}/plan`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ target_word_count: targetWords, user_prompt: userPrompt, writing_intent_mode: writingIntentMode }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "PLANNING_FAILED");
            setPlan(data.plan);
            if (String(data.status || "").startsWith("BLOCKED_BY_")) {
                setExecResult(data as WritingStatusResult);
            } else {
                setExecResult(null);
            }
            setStep("review");
        } catch (e: unknown) {
            setError(errorMessage(e));
            setStep("targets");
        }
    };

    const startAutoWriteOneClick = async () => {
        setStep("executing");
        setError(null);
        setActiveJobId(null);
        setLiveStatus(null);
        setIsEditingPlan(false);
        try {
            const res = await fetch(`/api/stories/${storySlug}/chapters/${chapterId}/auto-write`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ target_word_count: targetWords, user_prompt: userPrompt, writing_intent_mode: writingIntentMode }),
            });
            const data = await res.json();
            if (!res.ok || data?.ok === false) throw new Error(data.error || "AUTO_WRITE_FAILED");
            if (String(data.status || "").startsWith("BLOCKED_BY_")) {
                if (data.plan && typeof data.plan === "object") setPlan(data.plan as PlanResult);
                setExecResult(data as WritingStatusResult);
                setStep("done");
                return;
            }
            const jobId = Number(data.job_id);
            if (!Number.isFinite(jobId) || jobId <= 0) throw new Error("INVALID_JOB_ID");
            setActiveJobId(jobId);
            const status = await pollWritingStatusUntilReady(jobId, setLiveStatus);
            setProse(status.prose);
            setExecResult(status);
            setStep("done");
        } catch (e: unknown) {
            setError(errorMessage(e));
            setStep("targets");
            setActiveJobId(null);
            setLiveStatus(null);
        }
    };

    const hydratePlanFromStatus = (status: WritingStatusResult | null) => {
        const raw = status?.planning_output_json;
        if (!raw || typeof raw !== "object") return;
        const candidate = raw as Record<string, unknown>;
        if (!Array.isArray(candidate.beats)) return;
        if (!candidate.context_guard || typeof candidate.context_guard !== "object") return;
        setPlan({
            title: String(candidate.title || `Chapter ${chapterId} Plan`),
            summary: String(candidate.summary || ""),
            beats: (candidate.beats as Array<Record<string, unknown>>).map((b, idx) => ({
                idx: Number(b.idx || idx + 1),
                label: String(b.label || `Beat ${idx + 1}`),
                description: String(b.description || ""),
                location: String(b.location || ""),
                characters: Array.isArray(b.characters) ? b.characters.map((x) => String(x || "")).filter(Boolean) : [],
                estimated_words: Number(b.estimated_words || 0),
            })),
            context_guard: {
                location_anchor: String((candidate.context_guard as Record<string, unknown>).location_anchor || ""),
                active_plot_threads: Array.isArray((candidate.context_guard as Record<string, unknown>).active_plot_threads)
                    ? ((candidate.context_guard as Record<string, unknown>).active_plot_threads as unknown[]).map((x) => String(x || "")).filter(Boolean)
                    : [],
                important_objects: Array.isArray((candidate.context_guard as Record<string, unknown>).important_objects)
                    ? ((candidate.context_guard as Record<string, unknown>).important_objects as unknown[]).map((x) => String(x || "")).filter(Boolean)
                    : [],
            },
            blocked_by_conflict_review: Boolean(candidate.blocked_by_conflict_review),
            blocked_by_canon_conflict: Boolean(candidate.blocked_by_canon_conflict),
            blocked_reason: candidate.blocked_reason ? String(candidate.blocked_reason) : null,
            writing_intent_mode: candidate.writing_intent_mode ? String(candidate.writing_intent_mode) : undefined,
            retcon_accepted: Boolean(candidate.retcon_accepted),
            delta_classification: candidate.delta_classification ? String(candidate.delta_classification) : null,
            conflict_resolution_mode: candidate.conflict_resolution_mode ? String(candidate.conflict_resolution_mode) : null,
            superseded_fact_refs: Array.isArray(candidate.superseded_fact_refs) ? candidate.superseded_fact_refs.map((x) => String(x || "")).filter(Boolean) : [],
            new_fact_candidates: Array.isArray(candidate.new_fact_candidates) ? candidate.new_fact_candidates.map((x) => String(x || "")).filter(Boolean) : [],
            canon_delta_report_v1: candidate.canon_delta_report_v1 && typeof candidate.canon_delta_report_v1 === "object" ? (candidate.canon_delta_report_v1 as Record<string, unknown>) : null,
            conflict_root_cause_v1: candidate.conflict_root_cause_v1 && typeof candidate.conflict_root_cause_v1 === "object" ? (candidate.conflict_root_cause_v1 as Record<string, unknown>) : null,
            reanalysis_actions_v1: candidate.reanalysis_actions_v1 && typeof candidate.reanalysis_actions_v1 === "object" ? (candidate.reanalysis_actions_v1 as Record<string, unknown>) : null,
        });
    };

    const retryAutoWrite = async (mode: "refine" | "replan") => {
        setRetrying(true);
        setError(null);
        setStep("executing");
        setIsEditingPlan(false);
        try {
            const res = await fetch(`/api/stories/${storySlug}/chapters/${chapterId}/auto-write/retry`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    mode,
                    target_word_count: targetWords,
                    user_prompt: userPrompt,
                    writing_intent_mode: writingIntentMode,
                }),
            });
            const data = await res.json();
            if (!res.ok || data?.ok === false) throw new Error(data.error || "AUTO_WRITE_RETRY_FAILED");
            if (String(data.status || "").startsWith("BLOCKED_BY_")) {
                if (data.plan && typeof data.plan === "object") setPlan(data.plan as PlanResult);
                setExecResult(data as WritingStatusResult);
                setStep("done");
                return;
            }
            const jobId = Number(data.job_id);
            if (!Number.isFinite(jobId) || jobId <= 0) throw new Error("INVALID_JOB_ID");
            setActiveJobId(jobId);
            const status = await pollWritingStatusUntilReady(jobId, setLiveStatus);
            setProse(status.prose);
            setExecResult(status);
            setStep("done");
        } catch (e: unknown) {
            setError(errorMessage(e));
            setStep("done");
        } finally {
            setRetrying(false);
        }
    };

    const startExecution = async () => {
        if (!plan) return;
        setStep("executing");
        setError(null);
        setActiveJobId(null);
        setLiveStatus(null);
        setIsEditingPlan(false);
        try {
            const res = await fetch(`/api/stories/${storySlug}/chapters/${chapterId}/execute`, {
                method: "POST",
                body: JSON.stringify({ plan }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "EXECUTION_FAILED");
            const jobId = Number(data.job_id);
            if (!Number.isFinite(jobId) || jobId <= 0) throw new Error("INVALID_JOB_ID");
            setActiveJobId(jobId);

            const status = await pollWritingStatusUntilReady(jobId, setLiveStatus);
            setProse(status.prose);
            setExecResult(status);
            setStep("done");
        } catch (e: unknown) {
            setError(errorMessage(e));
            setStep("review");
            setActiveJobId(null);
            setLiveStatus(null);
        }
    };

    const controlExecution = async (action: "pause" | "abort") => {
        if (!activeJobId) return;
        try {
            const res = await fetch(`/api/stories/${storySlug}/chapters/${chapterId}/execute/control`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action, job_id: activeJobId }),
            });
            const data = await res.json();
            if (!res.ok || data?.ok === false) throw new Error(data.error || "WRITING_CONTROL_FAILED");
            if (action === "pause") {
                setError("WRITING_PAUSED_BY_USER");
            } else {
                setError("WRITING_CANCELLED_BY_USER");
            }
            setStep("review");
            setActiveJobId(null);
            setLiveStatus(null);
        } catch (e: unknown) {
            setError(errorMessage(e));
        }
    };

    const startSplitting = async () => {
        setStep("splitting");
        setError(null);
        try {
            const res = await fetch(`/api/stories/${slug}/chapters/${chapterId}/split`, {
                method: "POST",
                body: JSON.stringify({ prose }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "SPLIT_FAILED");
            // Important: We call onComplete which now clears pendingProse and reloads scenes
            onComplete(prose);
            onClose(); // Close the wizard after success
        } catch (e: unknown) {
            setError(errorMessage(e));
            setStep("done");
        }
    };

    const startStaging = async () => {
        setExecuting(true);
        setError(null);
        try {
            const res = await fetch(`/api/stories/${slug}/chapters/${chapterId}/stage`, {
                method: "POST",
                body: JSON.stringify({ prose, plan }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "STAGE_FAILED");
            onComplete(prose);
            onClose();
        } catch (e: unknown) {
            setError(errorMessage(e));
        } finally {
            setExecuting(false);
        }
    };

    const slug = storySlug; // for convenience
    const statusLabel = step === "executing"
        ? "AUTO_WRITE_RUNNING"
        : execResult?.final_review_ready
            ? "READY_FOR_REVIEW"
            : (step === "done" ? "BLOCKED_BY_QUALITY_GATES" : null);
    const planningGuard = (execResult?.planning_output_json as Record<string, unknown> | null)?.planning_guard_v1 as PlanningGuardV1 | undefined;
    const unknownHits = Array.isArray(planningGuard?.unknown_character_hits) ? planningGuard!.unknown_character_hits! : [];
    const allowedChars = Array.isArray(planningGuard?.allowed_characters) ? planningGuard!.allowed_characters! : [];
    const usedChars = Array.isArray(planningGuard?.characters_used) ? planningGuard!.characters_used! : [];
    const planMeta = plan as (PlanResult & Record<string, unknown>) | null;
    const deltaClassification = execResult?.delta_classification || planMeta?.delta_classification || null;
    const conflictResolutionMode = execResult?.conflict_resolution_mode || planMeta?.conflict_resolution_mode || null;
    const canonDeltaReport = (execResult?.canon_delta_report_v1 || planMeta?.canon_delta_report_v1 || null) as Record<string, unknown> | null;
    const conflictRootCause = (execResult?.conflict_root_cause_v1 || planMeta?.conflict_root_cause_v1 || null) as Record<string, unknown> | null;
    const reanalysisActions = (execResult?.reanalysis_actions_v1 || planMeta?.reanalysis_actions_v1 || null) as Record<string, unknown> | null;
    const supersededFactRefs = Array.isArray(execResult?.superseded_fact_refs)
        ? execResult!.superseded_fact_refs!
        : (Array.isArray(planMeta?.superseded_fact_refs) ? (planMeta?.superseded_fact_refs as string[]) : []);
    const newFactCandidates = Array.isArray(execResult?.new_fact_candidates)
        ? execResult!.new_fact_candidates!
        : (Array.isArray(planMeta?.new_fact_candidates) ? (planMeta?.new_fact_candidates as string[]) : []);
    const rootCauseChecks = Array.isArray(conflictRootCause?.checks) ? conflictRootCause.checks as Array<Record<string, unknown>> : [];
    const canExecuteReviewedPlan = !(plan?.blocked_by_conflict_review || plan?.blocked_by_canon_conflict);
    const reviewReadyToExecute = Boolean(plan) && (canExecuteReviewedPlan || isEditingPlan);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="surface-card w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl border border-white/10">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-lg font-bold tracking-tight text-[#9de5dc]">AutoWrite v2: Chapter Architect</h2>
                    <button onClick={onClose} className="muted hover:text-white text-xs font-bold font-mono">CLOSE [X]</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                    {statusLabel ? (
                        <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${statusLabel === "READY_FOR_REVIEW"
                            ? "bg-[#9de5dc]/10 text-[#9de5dc] border-[#9de5dc]/30"
                            : statusLabel === "AUTO_WRITE_RUNNING"
                                ? "bg-amber-500/10 text-amber-300 border-amber-400/30"
                                : "bg-red-500/10 text-red-300 border-red-500/30"
                            }`}>
                            {statusLabel}
                        </div>
                    ) : null}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 text-sm font-medium">
                            ERROR: {error}
                        </div>
                    )}

                    {step === "targets" && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest muted">Target Word Count</label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="500"
                                        max="5000"
                                        step="500"
                                        value={targetWords}
                                        onChange={(e) => setTargetWords(Number(e.target.value))}
                                        className="flex-1 accent-[#9de5dc]"
                                    />
                                    <span className="text-xl font-mono text-[#9de5dc] min-w-[100px] text-right">{targetWords} words</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest muted">Instruction (Optional)</label>
                                <textarea
                                    data-testid="autowrite-instruction-input"
                                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm focus:border-[#9de5dc] outline-none min-h-[100px]"
                                    placeholder="e.g. Focus on the tension between Kuro and Halden. Mention the rusted iron gate..."
                                    value={userPrompt}
                                    onChange={(e) => setUserPrompt(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest muted">Writing Intent Mode</label>
                                <select
                                    value={writingIntentMode}
                                    onChange={(e) => setWritingIntentMode(e.target.value === "RETCON_REWRITE" ? "RETCON_REWRITE" : "CONTINUE_CANON")}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-[#9de5dc] outline-none"
                                >
                                    <option value="CONTINUE_CANON">CONTINUE_CANON (default)</option>
                                    <option value="RETCON_REWRITE">RETCON_REWRITE (explicit)</option>
                                </select>
                                <div className="text-[11px] text-slate-500">
                                    Choose before running. `CONTINUE_CANON` preserves approved canon; `RETCON_REWRITE` allows intentional canon changes.
                                </div>
                            </div>

                            <button
                                onClick={startAutoWriteOneClick}
                                className="w-full py-3 bg-[#133a37] text-[#9de5dc] font-bold uppercase tracking-widest border border-[#9de5dc]/30 hover:bg-[#1a4a46] transition-all"
                            >
                                WRITE AUTO (ONE CLICK)
                            </button>
                            <button
                                onClick={startPlanning}
                                className="w-full py-2 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/5"
                            >
                                ADVANCED: PLAN + REVIEW + EXECUTE
                            </button>
                        </div>
                    )}

                    {step === "planning" && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="text-sm font-bold animate-pulse text-[#9de5dc] tracking-widest uppercase">Agent &quot;Architect&quot; is planning...</div>
                            <div className="muted text-xs">Analyzing historical data & building beat map</div>
                        </div>
                    )}

                    {step === "review" && plan && (
                        <div className="space-y-6">
                            <div className="p-4 bg-white/5 border border-white/10 rounded space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest muted">Chapter Title</label>
                                <input
                                    type="text"
                                    value={plan.title}
                                    onChange={(e) => updatePlan((current) => ({ ...current, title: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-[#9de5dc] focus:border-[#9de5dc] outline-none"
                                />
                                <label className="text-[10px] font-bold uppercase tracking-widest muted">Summary</label>
                                <textarea
                                    value={plan.summary}
                                    onChange={(e) => updatePlan((current) => ({ ...current, summary: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm text-slate-300 focus:border-[#9de5dc] outline-none min-h-[96px]"
                                />
                            </div>
                            {deltaClassification ? (
                                <div className={`rounded border p-3 space-y-2 ${canExecuteReviewedPlan ? "border-amber-400/30 bg-amber-400/10" : "border-red-500/30 bg-red-500/10"}`}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-100">
                                        Delta Classification: {deltaClassification}
                                    </div>
                                    <div className="text-[11px] text-slate-300">
                                        Resolution Mode: {conflictResolutionMode || "none"}
                                        {plan.blocked_reason ? ` | Reason: ${plan.blocked_reason}` : ""}
                                    </div>
                                    {typeof conflictRootCause?.summary === "string" ? (
                                        <div className="text-[11px] text-slate-300">{String(conflictRootCause.summary)}</div>
                                    ) : null}
                                    {Array.isArray(canonDeltaReport?.affected_dimensions) ? (
                                        <div className="text-[11px] text-slate-400">
                                            Affected: {(canonDeltaReport.affected_dimensions as unknown[]).map((x) => String(x || "")).filter(Boolean).join(", ") || "(none)"}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            <div className="space-y-4">
                                <label className="text-[10px] font-bold uppercase tracking-widest muted">Beat Map Strategy</label>
                                <div className="space-y-2">
                                    {plan.beats.map((beat, idx) => (
                                        <div key={beat.idx} className="p-3 border-l-2 border-[#133a37] bg-white/5 text-[13px] group">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold text-slate-300">Beat #{beat.idx}</span>
                                                <input
                                                    type="number"
                                                    min={100}
                                                    step={50}
                                                    value={beat.estimated_words}
                                                    onChange={(e) => updateBeat(idx, (currentBeat) => ({ ...currentBeat, estimated_words: Number(e.target.value || 0) }))}
                                                    className="w-28 bg-black/20 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-right text-slate-200 focus:border-[#9de5dc] outline-none"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={beat.label}
                                                    onChange={(e) => updateBeat(idx, (currentBeat) => ({ ...currentBeat, label: e.target.value }))}
                                                    className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm text-slate-100 focus:border-[#9de5dc] outline-none"
                                                />
                                                <textarea
                                                    value={beat.description}
                                                    onChange={(e) => updateBeat(idx, (currentBeat) => ({ ...currentBeat, description: e.target.value }))}
                                                    className="w-full bg-black/20 border border-white/10 rounded p-3 text-xs text-slate-300 focus:border-[#9de5dc] outline-none min-h-[100px]"
                                                />
                                                <input
                                                    type="text"
                                                    value={beat.location}
                                                    onChange={(e) => updateBeat(idx, (currentBeat) => ({ ...currentBeat, location: e.target.value }))}
                                                    className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-slate-300 focus:border-[#9de5dc] outline-none"
                                                    placeholder="Location anchor"
                                                />
                                                <input
                                                    type="text"
                                                    value={beat.characters.join(", ")}
                                                    onChange={(e) => updateBeat(idx, (currentBeat) => ({
                                                        ...currentBeat,
                                                        characters: e.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                                                    }))}
                                                    className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-slate-300 focus:border-[#9de5dc] outline-none"
                                                    placeholder="Characters, comma separated"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-3 bg-[#ff8f8f]/5 border border-[#ff8f8f]/20 rounded space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-[#ff8f8f]">Integrity Guard</label>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={plan.context_guard.location_anchor}
                                        onChange={(e) => updatePlan((current) => ({
                                            ...current,
                                            context_guard: { ...current.context_guard, location_anchor: e.target.value },
                                        }))}
                                        className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-slate-300 focus:border-[#9de5dc] outline-none"
                                        placeholder="Location anchor"
                                    />
                                    <input
                                        type="text"
                                        value={plan.context_guard.important_objects.join(", ")}
                                        onChange={(e) => updatePlan((current) => ({
                                            ...current,
                                            context_guard: {
                                                ...current.context_guard,
                                                important_objects: e.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                                            },
                                        }))}
                                        className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-slate-300 focus:border-[#9de5dc] outline-none"
                                        placeholder="Important objects, comma separated"
                                    />
                                    <input
                                        type="text"
                                        value={plan.context_guard.active_plot_threads.join(", ")}
                                        onChange={(e) => updatePlan((current) => ({
                                            ...current,
                                            context_guard: {
                                                ...current.context_guard,
                                                active_plot_threads: e.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                                            },
                                        }))}
                                        className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-slate-300 focus:border-[#9de5dc] outline-none"
                                        placeholder="Active plot threads, comma separated"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep("targets")}
                                    className="flex-1 py-3 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/5"
                                >
                                    RE-PLAN
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsEditingPlan((current) => !current)}
                                    className={`flex-1 py-3 border text-xs font-bold uppercase tracking-widest transition-all ${isEditingPlan ? "border-[#9de5dc]/40 text-[#9de5dc] bg-[#133a37]/30" : "border-white/10 hover:bg-white/5"}`}
                                >
                                    {isEditingPlan ? "EDITING PLAN" : "EDIT PLAN"}
                                </button>
                                <button
                                    onClick={startExecution}
                                    disabled={!reviewReadyToExecute}
                                    className="flex-2 py-3 bg-[#133a37] text-[#9de5dc] font-bold uppercase tracking-widest border border-[#9de5dc]/30 hover:bg-[#1a4a46] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    EXECUTE PROSE [2/2]
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "executing" && (
                        <div className="space-y-4">
                            <div className="text-center space-y-1">
                                <div className="text-sm font-bold animate-pulse text-[#9de5dc] tracking-widest uppercase">Agent &quot;Stylist&quot; is writing...</div>
                                <div className="muted text-xs">Writing {targetWords} words based on approved beats</div>
                                {activeJobId ? <div className="muted text-[11px] font-mono">job #{activeJobId}</div> : null}
                            </div>
                            <div className="rounded border border-white/10 bg-white/5 p-3 text-[11px] text-slate-300">
                                Writing Intent Mode locked for this run: <span className="font-mono text-slate-100">{writingIntentMode}</span>
                            </div>
                            <WritingWorkflowDashboard
                                storySlug={storySlug}
                                chapterId={chapterId}
                                jobId={activeJobId}
                                currentWordCount={liveStatus?.word_count ?? 0}
                                targetWordCount={targetWords}
                                writingStatus={liveStatus}
                                onPause={() => void controlExecution("pause")}
                                onAbort={() => void controlExecution("abort")}
                            />
                        </div>
                    )}

                    {step === "splitting" && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="text-sm font-bold animate-pulse text-[#9de5dc] tracking-widest uppercase">Agent &quot;Historian&quot; is splitting...</div>
                            <div className="muted text-xs">Analyzing narrative boundaries to create scenes</div>
                            <div className="w-full max-w-xs h-1 bg-white/5 rounded overflow-hidden">
                                <div className="h-full bg-[#9de5dc] animate-[progress_1s_ease-in-out_infinite]" style={{ width: "60%" }} />
                            </div>
                        </div>
                    )}

                    {step === "done" && (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="text-2xl">DONE</div>
                            <div className="text-sm font-bold text-[#9de5dc] tracking-widest uppercase">Chapter Generated</div>
                            <div className="w-full bg-[#131313] border border-white/5 p-4 rounded-lg space-y-4">
                                <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${execResult?.final_review_ready ? "bg-[#9de5dc]/10 text-[#9de5dc] border-[#9de5dc]/30" : "bg-red-500/10 text-red-400 border-red-500/30"}`}>
                                    {execResult?.final_review_ready ? "READY_FOR_REVIEW" : "QUALITY_GATES_FAILED"}
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest muted">Historian Audit</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${execResult?.integrity_report?.location_verified ? 'bg-[#9de5dc]/10 text-[#9de5dc] border-[#9de5dc]/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                                        {execResult?.integrity_report?.location_verified ? 'ANCHOR VERIFIED' : 'ANCHOR MISSED'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <div className="text-[9px] uppercase muted font-bold">Word Count</div>
                                        <div className="text-lg font-mono text-white">{execResult?.word_count || 0} / {targetWords}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] uppercase muted font-bold">Characters & Objects</div>
                                        <div className="text-[11px] text-slate-300">
                                            {(execResult?.integrity_report?.objects_tracked ?? []).length > 0
                                                ? (execResult?.integrity_report?.objects_tracked ?? []).join(", ")
                                                : "None detected"}
                                        </div>
                                    </div>
                                </div>

                                {execResult?.integrity_report?.character_drift_detected && (
                                    <div className="bg-orange-500/10 border border-orange-500/30 p-2 rounded text-[10px] text-orange-400 font-bold uppercase tracking-widest text-center">
                                        Warning: Character Voice Drift Detected
                                    </div>
                                )}
                                {execResult?.quality_gate_report_v1 && !execResult.quality_gate_report_v1.pass && (
                                    <div className="bg-red-500/10 border border-red-500/30 p-2 rounded text-[10px] text-red-300">
                                        FAIL CODES: {(execResult.quality_gate_report_v1.fail_codes || []).join(", ") || "UNKNOWN"}
                                    </div>
                                )}
                                {execResult?.blocked_by_conflict_review ? (
                                    <div className="bg-red-600/15 border border-red-500/40 p-2 rounded text-[10px] text-red-200">
                                        BLOCKED_BY_CONFLICT_REVIEW: unresolved critical entity conflicts require human validation in Memory Hub.
                                    </div>
                                ) : null}
                                {execResult?.blocked_by_canon_conflict ? (
                                    <div className="bg-red-600/15 border border-red-500/40 p-2 rounded text-[10px] text-red-200">
                                        {deltaClassification || "UNRESOLVED_CONFLICT"}: {String(conflictRootCause?.summary || execResult?.blocking_reason || "plan drift detected vs approved canon/timeline")}.
                                    </div>
                                ) : null}
                                {deltaClassification ? (
                                    <div className="space-y-1 border border-white/10 rounded p-2 bg-black/20 text-[11px] text-slate-300">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Dynamic Canon Recovery</div>
                                        <div>Classification: {deltaClassification}</div>
                                        <div>Resolution mode: {conflictResolutionMode || "none"}</div>
                                        <div>
                                            Recommended action: {String(canonDeltaReport?.recommended_action || "n/a")}
                                            {typeof canonDeltaReport?.confidence === "number" ? ` | confidence ${Number(canonDeltaReport.confidence).toFixed(3)}` : ""}
                                        </div>
                                        <div>Superseded refs: {supersededFactRefs.join(", ") || "(none)"}</div>
                                        <div>New fact candidates: {newFactCandidates.join(", ") || "(none)"}</div>
                                    </div>
                                ) : null}
                                {reanalysisActions ? (
                                    <div className="space-y-1 border border-white/10 rounded p-2 bg-black/20 text-[11px] text-slate-300">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Reanalysis Actions</div>
                                        <div>Attempted: {Boolean(reanalysisActions.attempted) ? "true" : "false"}</div>
                                        <div>Mode: {String(reanalysisActions.mode || "none")}</div>
                                        <div>Result: {String(reanalysisActions.result || "not_needed")}</div>
                                        <div>Refreshed snapshots: {Array.isArray(reanalysisActions.refreshed_snapshot_refs) ? (reanalysisActions.refreshed_snapshot_refs as unknown[]).map((x) => String(x || "")).filter(Boolean).join(", ") || "(none)" : "(none)"}</div>
                                    </div>
                                ) : null}
                                {rootCauseChecks.length > 0 ? (
                                    <div className="space-y-1 border border-white/10 rounded p-2 bg-black/20">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Conflict Root Cause</div>
                                        {rootCauseChecks.map((check, idx) => (
                                            <div key={`${String(check.dimension || "check")}-${idx}`} className="text-[11px] text-slate-300">
                                                <span className="text-amber-300">{String(check.dimension || "unknown")}</span>{" "}
                                                {String(check.issue_code || "ISSUE")} | {String(check.disposition || "MISSING")} | {String(check.recommended_action || "HUMAN_REVIEW")}
                                                <div className="text-slate-400">{String(check.explanation || "-")}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                {unknownHits.length > 0 ? (
                                    <div className="bg-red-500/10 border border-red-500/40 p-2 rounded text-[10px] text-red-200">
                                        CAST GUARD WARNING: unknown characters in plan: {unknownHits.join(", ")}
                                    </div>
                                ) : null}
                                {planningGuard ? (
                                    <div className="space-y-1 border border-white/10 rounded p-2 bg-black/20 text-[11px] text-slate-300">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Planning Guard v1</div>
                                        <div>Allowed characters ({allowedChars.length}): {allowedChars.join(", ") || "(none)"}</div>
                                        <div>Characters used ({usedChars.length}): {usedChars.join(", ") || "(none)"}</div>
                                        <div>Replan triggered: {planningGuard.replan_triggered ? "true" : "false"}</div>
                                    </div>
                                ) : null}
                                {execResult?.quality_gate_report_v1?.checks ? (
                                    <div className="space-y-1 border border-white/10 rounded p-2 bg-black/20">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Quality Gate Checks</div>
                                        {Object.entries(execResult.quality_gate_report_v1.checks).map(([key, val]) => (
                                            <div key={key} className="text-[11px] text-slate-300">
                                                <span className={val?.pass ? "text-[#9de5dc]" : "text-red-300"}>{val?.pass ? "PASS" : "FAIL"}</span>{" "}
                                                {key}: {val?.detail || "-"}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {execResult?.historian_snapshot && (
                                    <div className="border border-[#9de5dc]/20 bg-[#9de5dc]/5 rounded p-3 space-y-2">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#9de5dc]">Historian Snapshot v3</div>
                                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                                            <div>Fact Status: <span className="text-slate-200 font-mono">{execResult.historian_snapshot.fact_status ?? "N/A"}</span></div>
                                            <div>Score: <span className="text-slate-200 font-mono">{Number(execResult.historian_snapshot.narrative_score ?? 0).toFixed(3)}</span></div>
                                            <div>Emotion: <span className="text-slate-200">{execResult.historian_snapshot.emotional_target ?? "Mixed"}</span></div>
                                            <div>Open Loops: <span className="text-slate-200 font-mono">{execResult.historian_snapshot.open_loops?.length ?? 0}</span></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-400">
                                            <div>
                                                Style Similarity:{" "}
                                                <span className="text-slate-200 font-mono">
                                                    {Number(execResult.historian_snapshot.snapshot_v3?.external_signals?.qdrant?.style_similarity ?? 0).toFixed(3)}
                                                </span>
                                            </div>
                                            <div>
                                                Lineage Conflicts:{" "}
                                                <span className="text-slate-200 font-mono">
                                                    {execResult.historian_snapshot.snapshot_v3?.external_signals?.neo4j?.lineage_conflicts?.length ?? 0}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <details className="w-full bg-[#0f1117] border border-white/10 rounded p-3">
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-[#9de5dc]">PLANNING_INPUT_PACK_JSON</summary>
                                <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                                    {JSON.stringify(execResult?.planning_input_pack_json ?? null, null, 2)}
                                </pre>
                            </details>
                            <details className="w-full bg-[#0f1117] border border-white/10 rounded p-3">
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-[#9de5dc]">PLANNING_OUTPUT_JSON</summary>
                                <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                                    {JSON.stringify(execResult?.planning_output_json ?? null, null, 2)}
                                </pre>
                            </details>
                            <details className="w-full bg-[#0f1117] border border-white/10 rounded p-3">
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-[#9de5dc]">PROSE_INPUT_PACK_JSON</summary>
                                <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                                    {JSON.stringify(execResult?.prose_input_pack_json ?? null, null, 2)}
                                </pre>
                            </details>
                            <details className="w-full bg-[#0f1117] border border-white/10 rounded p-3">
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-[#9de5dc]">PROSE_OUTPUT_JSON</summary>
                                <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                                    {JSON.stringify(execResult?.prose_output_json ?? null, null, 2)}
                                </pre>
                            </details>
                            <details className="w-full bg-[#0f1117] border border-white/10 rounded p-3">
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-[#9de5dc]">CONFLICT_REPORT_V1</summary>
                                <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                                    {JSON.stringify({
                                        resolution_status: execResult?.resolution_status ?? null,
                                        blocked_by_conflict_review: Boolean(execResult?.blocked_by_conflict_review),
                                        conflict_report_v1: execResult?.conflict_report_v1 ?? null,
                                        entity_assignments: execResult?.entity_assignments ?? [],
                                    }, null, 2)}
                                </pre>
                            </details>
                            <details className="w-full bg-[#0f1117] border border-white/10 rounded p-3">
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-[#9de5dc]">PLAN_CONTINUITY_GATE_V1</summary>
                                <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                                    {JSON.stringify({
                                        writing_intent_mode: execResult?.writing_intent_mode ?? writingIntentMode,
                                        retcon_accepted: Boolean(execResult?.retcon_accepted),
                                        blocked_by_canon_conflict: Boolean(execResult?.blocked_by_canon_conflict),
                                        plan_continuity_gate_v1: execResult?.plan_continuity_gate_v1 ?? null,
                                        canonical_diff_preview: execResult?.canonical_diff_preview ?? null,
                                        character_state_cards_used: execResult?.character_state_cards_used ?? [],
                                        continuity_evidence_refs: execResult?.continuity_evidence_refs ?? [],
                                    }, null, 2)}
                                </pre>
                            </details>

                            <p className="text-xs muted max-w-sm text-center italic">The prose has been drafted and is ready for structural splitting.</p>

                            <div className="flex flex-col w-full max-w-xs gap-3 mt-6">
                                <button
                                    onClick={startSplitting}
                                    disabled={!execResult?.final_review_ready}
                                    className="w-full py-3 bg-[#133a37] text-[#9de5dc] font-bold uppercase tracking-widest border border-[#9de5dc]/30 hover:bg-[#1a4a46] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    APPROVE & SPLIT INTO SCENES
                                </button>
                                <button
                                    onClick={startStaging}
                                    className="w-full py-3 border border-[#9de5dc]/30 text-[#9de5dc] font-bold uppercase tracking-widest hover:bg-[#133a37]/30 transition-all"
                                >
                                    {executing ? "SAVING..." : "SAVE CHAPTER DRAFT (NO SPLIT)"}
                                </button>
                                {!execResult?.final_review_ready ? (
                                    <>
                                        <button
                                            onClick={() => {
                                                hydratePlanFromStatus(execResult);
                                                setStep("review");
                                            }}
                                            className="w-full py-2 border border-amber-300/40 text-amber-300 text-[11px] font-bold uppercase tracking-widest hover:bg-amber-300/10"
                                        >
                                            EDIT PLAN
                                        </button>
                                        <button
                                            onClick={() => void retryAutoWrite("refine")}
                                            disabled={retrying}
                                            className="w-full py-2 border border-red-400/40 text-red-300 text-[11px] font-bold uppercase tracking-widest hover:bg-red-400/10 disabled:opacity-50"
                                        >
                                            {retrying ? "RETRYING..." : "RETRY AUTOWRITE (REFINE)"}
                                        </button>
                                        <button
                                            onClick={() => void retryAutoWrite("replan")}
                                            disabled={retrying}
                                            className="w-full py-2 border border-red-400/40 text-red-300 text-[11px] font-bold uppercase tracking-widest hover:bg-red-400/10 disabled:opacity-50"
                                        >
                                            {retrying ? "RETRYING..." : "RETRY AUTOWRITE (REPLAN)"}
                                        </button>
                                        {execResult?.blocked_by_canon_conflict && writingIntentMode !== "RETCON_REWRITE" ? (
                                            <button
                                                onClick={() => {
                                                    setWritingIntentMode("RETCON_REWRITE");
                                                    void retryAutoWrite("replan");
                                                }}
                                                disabled={retrying}
                                                className="w-full py-2 border border-amber-400/40 text-amber-300 text-[11px] font-bold uppercase tracking-widest hover:bg-amber-400/10 disabled:opacity-50"
                                            >
                                                {retrying ? "RETRYING..." : "PROCEED AS RETCON"}
                                            </button>
                                        ) : null}
                                    </>
                                ) : null}
                                <button
                                    onClick={() => onComplete(prose)}
                                    className="w-full py-2 border border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-widest hover:bg-white/5"
                                >
                                    JUST VIEW PROSE (MANUAL)
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

