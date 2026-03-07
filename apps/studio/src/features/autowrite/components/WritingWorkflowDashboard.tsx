"use client";

import React from "react";

interface PipelineStep {
    id: string;
    name: string;
    status: "pending" | "running" | "done" | "error";
    description: string;
}

interface WritingWorkflowDashboardProps {
    storySlug: string;
    chapterId?: string;
    jobId?: number | null;
    currentWordCount: number;
    targetWordCount: number;
    writingStatus?: {
        status: string;
        progress?: {
            done_tasks: number;
            total_tasks: number;
        };
        latest_task?: {
            task_type: string | null;
            status: string | null;
            error: string | null;
        };
    } | null;
    onPause?: () => void;
    onAbort?: () => void;
    controlsDisabled?: boolean;
}

export function WritingWorkflowDashboard({
    storySlug,
    chapterId,
    jobId,
    currentWordCount,
    targetWordCount,
    writingStatus = null,
    onPause,
    onAbort,
    controlsDisabled = false,
}: WritingWorkflowDashboardProps) {
    const latestTaskType = (writingStatus?.latest_task?.task_type || "").toUpperCase();
    const status = (writingStatus?.status || "").toUpperCase();

    const steps: PipelineStep[] = [
        { id: "analysis", name: "Analysis Agent", status: "pending", description: "Historian synthesizing context..." },
        { id: "planning", name: "Planning Agent", status: "done", description: "Architect building beat map..." },
        { id: "execution", name: "Execution Phase", status: "pending", description: "Writer drafting prose sequentially..." },
        { id: "supervisor", name: "Supervisor Agent", status: "pending", description: "Editor polishing and pruning..." },
    ];

    if (!writingStatus) {
        steps[0].status = "running";
    } else if (status === "DONE") {
        steps.forEach((step) => {
            step.status = "done";
        });
    } else if (status === "FAILED" || status === "CANCELLED") {
        if (latestTaskType.includes("FINALIZE")) {
            steps[0].status = "done";
            steps[1].status = "done";
            steps[2].status = "done";
            steps[3].status = "error";
        } else if (latestTaskType.includes("STYLIST") || latestTaskType.includes("CRITIC") || latestTaskType.includes("REFINE")) {
            steps[0].status = "done";
            steps[1].status = "done";
            steps[2].status = "error";
        } else {
            steps[0].status = "error";
        }
    } else if (latestTaskType.includes("FINALIZE")) {
        steps[0].status = "done";
        steps[1].status = "done";
        steps[2].status = "done";
        steps[3].status = "running";
    } else if (latestTaskType.includes("STYLIST") || latestTaskType.includes("CRITIC") || latestTaskType.includes("REFINE")) {
        steps[0].status = "done";
        steps[1].status = "done";
        steps[2].status = "running";
    } else {
        steps[0].status = "running";
    }

    const wcPercent = Math.min(100, (currentWordCount / targetWordCount) * 100);
    const wcColor = currentWordCount > targetWordCount + 200 ? "#ff8f8f" : currentWordCount > targetWordCount ? "#ffd966" : "#66d9ff";

    return (
        <div className="surface-card p-4 space-y-6 max-w-2xl mx-auto border border-white/10 rounded-xl bg-black/40 backdrop-blur-md">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight text-white/90">Agentic Writing Pipeline</h2>
                <div className="text-xs font-mono px-2 py-1 rounded bg-white/5 text-white/40">
                    {storySlug}
                    {writingStatus?.progress ? ` | ${writingStatus.progress.done_tasks}/${writingStatus.progress.total_tasks}` : ""}
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                    <span className="text-white/60">Word Count Progress</span>
                    <span style={{ color: wcColor }}>{currentWordCount} / {targetWordCount} words</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-500 ease-out"
                        style={{
                            width: `${wcPercent}%`,
                            backgroundColor: wcColor,
                            boxShadow: `0 0 10px ${wcColor}44`,
                        }}
                    />
                </div>
                {currentWordCount > targetWordCount + 200 && (
                    <div className="text-[10px] text-[#ff8f8f] animate-pulse">
                        OVER LIMIT: Supervisor Agent will prune strictly.
                    </div>
                )}
            </div>

            <div className="grid gap-3">
                {steps.map((step) => (
                    <div
                        key={step.id}
                        className={`p-3 rounded-lg border transition-all ${
                            step.status === "running"
                                ? "bg-white/5 border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                                : "bg-transparent border-white/5"
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className={`w-2 h-2 rounded-full ${
                                    step.status === "done"
                                        ? "bg-emerald-400"
                                        : step.status === "running"
                                          ? "bg-blue-400 animate-pulse"
                                          : step.status === "error"
                                            ? "bg-red-400"
                                            : "bg-white/20"
                                }`}
                            />
                            <div className="flex-1">
                                <div className="text-sm font-semibold text-white/80">{step.name}</div>
                                <div className="text-xs text-white/40">{step.description}</div>
                            </div>
                            {step.status === "running" && <div className="text-[10px] font-mono text-blue-400 tracking-widest">ACTIVE</div>}
                        </div>
                    </div>
                ))}
            </div>

            <div className="pt-4 border-t border-white/10 flex gap-2">
                <button
                    type="button"
                    onClick={onPause}
                    disabled={controlsDisabled || !jobId || !chapterId}
                    className="flex-1 shell-link py-2 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Pause Pipeline
                </button>
                <button
                    type="button"
                    onClick={onAbort}
                    disabled={controlsDisabled || !jobId || !chapterId}
                    className="flex-1 shell-link py-2 text-sm font-medium border-red-900/40 text-red-300 hover:bg-red-950/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Abort Job
                </button>
            </div>
        </div>
    );
}
