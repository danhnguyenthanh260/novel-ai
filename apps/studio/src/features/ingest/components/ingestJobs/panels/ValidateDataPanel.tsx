"use client";

import type { ValidateChapterReport, ValidateCustomRule } from "../validate/types";
import { ValidateWarningList } from "../validate/ValidateWarningList";
import { ValidateRuleForm } from "../validate/ValidateRuleForm";

type ValidateDataPanelProps = {
    jobId: number | null;
    validateReports: ValidateChapterReport[];
    customRules: ValidateCustomRule[];
    validateLoading: boolean;
    validateActing: boolean;
    onApproveData: () => void;
    onApproveChapter: (chapterTaskId: number) => void;
    onRejectData: () => void;
    onAddRule: (rule: { pattern: string; description: string; severity: string }) => void;
};

function ChapterValidateRow({
    report,
    validateActing,
    onApproveChapter,
}: {
    report: ValidateChapterReport;
    validateActing: boolean;
    onApproveChapter: (chapterTaskId: number) => void;
}) {
    const r = report.report;
    const chapterId = report.chapter_id ?? report.source_path ?? `task #${report.task_id}`;
    const allWarnings = [...(r?.warnings ?? []), ...(r?.custom_matches ?? [])];
    const taskType = String(report.task_type || "");
    const canApproveChapter = taskType === "CHAPTER_INGEST" && String(report.status || "").toUpperCase() === "DONE";

    return (
        <div className="grid gap-1 border-b border-[#223247] pb-2 last:border-0">
            <div className="flex items-center justify-between gap-2">
                <div className="muted text-xs">
                    {chapterId} | task: {taskType || "UNKNOWN"} | chars: {" "}
                    {r ? (
                        <>
                            errors: <span className={r.error_count > 0 ? "text-rose-400" : "text-slate-300"}>{r.error_count}</span>
                            {" | "}
                            warnings: <span className={r.warning_count > 0 ? "text-amber-400" : "text-slate-300"}>{r.warning_count}</span>
                        </>
                    ) : (
                        <span>{report.status}</span>
                    )}
                </div>
                {canApproveChapter ? (
                    <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        disabled={validateActing}
                        onClick={() => onApproveChapter(report.task_id)}
                    >
                        {validateActing ? "working..." : "approve chapter"}
                    </button>
                ) : null}
            </div>
            {allWarnings.length > 0 && (
                <ValidateWarningList warnings={allWarnings} />
            )}
            {r?.llm_analysis && (
                <div className="text-xs text-slate-400 italic">llm notes: {r.llm_analysis}</div>
            )}
        </div>
    );
}

function CustomRuleList({ rules }: { rules: ValidateCustomRule[] }) {
    if (!rules.length) return null;
    return (
        <div className="grid gap-1">
            <div className="muted text-xs font-medium">active custom rules</div>
            {rules.map((r) => (
                <div key={r.id} className="font-mono text-xs text-slate-400">
                    [{r.severity.toUpperCase()}] {r.pattern}{r.description ? ` — ${r.description}` : ""}
                </div>
            ))}
        </div>
    );
}

export function ValidateDataPanel({
    jobId,
    validateReports,
    customRules,
    validateLoading,
    validateActing,
    onApproveData,
    onApproveChapter,
    onRejectData,
    onAddRule,
}: ValidateDataPanelProps) {
    if (!jobId) return null;

    const hasErrors = validateReports.some((r) => (r.report?.error_count ?? 0) > 0);
    const totalWarnings = validateReports.reduce((s, r) => s + (r.report?.warning_count ?? 0), 0);

    return (
        <section className="surface-card">
            <div className="flex items-center justify-between border-b border-[#223247] px-4 py-3 text-sm font-medium">
                <span>validate data (job #{jobId})</span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        onClick={onRejectData}
                        disabled={validateActing}
                    >
                        {validateActing ? "working..." : "reject data"}
                    </button>
                    <button
                        type="button"
                        className="shell-link px-2 py-1 text-xs"
                        onClick={onApproveData}
                        disabled={validateActing}
                    >
                        {validateActing ? "working..." : "approve & split"}
                    </button>
                </div>
            </div>

            <div className="grid gap-3 p-4">
                {validateLoading && <div className="muted text-sm">loading validate reports...</div>}

                {!validateLoading && !validateReports.length && (
                    <div className="muted text-sm">no validate tasks found</div>
                )}

                {!validateLoading && validateReports.length > 0 && (
                    <>
                        <div className="muted text-xs">
                            chapters: {validateReports.length} | total warnings: {totalWarnings}
                            {hasErrors && <span className="ml-2 text-rose-400">has errors — review before approving</span>}
                        </div>
                        <div className="grid gap-3">
                            {validateReports.map((r) => (
                                <ChapterValidateRow
                                    key={r.task_id}
                                    report={r}
                                    validateActing={validateActing}
                                    onApproveChapter={onApproveChapter}
                                />
                            ))}
                        </div>
                    </>
                )}

                <div className="border-t border-[#223247] pt-3">
                    <CustomRuleList rules={customRules} />
                    <div className="mt-2">
                        <div className="muted text-xs mb-1">add custom rule</div>
                        <ValidateRuleForm onAddRule={onAddRule} acting={validateActing} />
                    </div>
                </div>
            </div>
        </section>
    );
}
