import { useState } from "react";
import { useParams } from "next/navigation";
import type { FeedbackDraft } from "../../types";

export function FeedbackResponseViewer({
    draft,
    loading,
    onClearResponse,
}: {
    draft: FeedbackDraft;
    loading?: boolean;
    onClearResponse: () => void;
}) {
    const params = useParams<{ slug: string }>();
    const [promotingIds, setPromotingIds] = useState<Set<number>>(new Set());
    const [promotedIds, setPromotedIds] = useState<Set<number>>(new Set());
    const [showError, setShowError] = useState(false);

    if (loading) {
        return (
            <div className="mt-2 flex items-center gap-3 rounded border border-[#223247] bg-[#0c1322] p-3 text-sm">
                <div className="flex space-x-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: "0ms" }}></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: "150ms" }}></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: "300ms" }}></div>
                </div>
                <span className="animate-pulse font-medium text-slate-400">Supervisor is analyzing your note...</span>
            </div>
        );
    }

    if (!draft.aiResponse) return null;

    const response = draft.aiResponse as {
        findings?: Array<{
            category: string;
            details: string;
            severity: string;
            impact_score: number;
        }>;
        summary_action?: string;
        total_impact?: number;
        error?: string;
        structured_tags?: {
            findings?: Array<{
                category: string;
                details: string;
                severity: string;
                impact_score: number;
            }>;
            summary_action?: string;
            total_impact?: number;
            error?: string;
        };
        token_key?: string;
        reason_code?: string | null;
        version_pair_valid?: boolean;
        taxonomy_version?: string;
        rule_pack_version?: string;
        location_ref?: string | null;
        detection_mode?: string;
        enforcement_mode?: string;
        original_detection_mode?: string;
        original_enforcement_mode?: string;
        current_detection_mode?: string;
        current_enforcement_mode?: string;
        stale_marked_count?: number;
    };
    const effective = response.structured_tags ?? response;
    const { findings, summary_action, total_impact, error } = effective;
    const tokenKey = typeof response.token_key === "string" ? response.token_key : null;
    const reasonCode = typeof response.reason_code === "string" ? response.reason_code : null;
    const versionPairValid = typeof response.version_pair_valid === "boolean" ? response.version_pair_valid : null;
    const taxonomyVersion = typeof response.taxonomy_version === "string" ? response.taxonomy_version : null;
    const rulePackVersion = typeof response.rule_pack_version === "string" ? response.rule_pack_version : null;
    const locationRef = typeof response.location_ref === "string" ? response.location_ref : null;
    const detectionMode = typeof response.detection_mode === "string" ? response.detection_mode : null;
    const enforcementMode = typeof response.enforcement_mode === "string" ? response.enforcement_mode : null;
    const originalDetectionMode = typeof response.original_detection_mode === "string" ? response.original_detection_mode : null;
    const originalEnforcementMode = typeof response.original_enforcement_mode === "string" ? response.original_enforcement_mode : null;
    const currentDetectionMode = typeof response.current_detection_mode === "string" ? response.current_detection_mode : null;
    const currentEnforcementMode = typeof response.current_enforcement_mode === "string" ? response.current_enforcement_mode : null;
    const staleMarkedCount = Number(response.stale_marked_count ?? 0);

    const handlePromote = async (details: string, category: string, index: number) => {
        if (!details || !params?.slug) return;
        setPromotingIds(prev => new Set(prev).add(index));
        try {
            const res = await fetch(`/api/stories/${params.slug}/dictionary/promote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rule_inferred: details,
                    category,
                    token_key: tokenKey ?? "UNCLASSIFIED",
                    taxonomy_version: taxonomyVersion,
                    rule_pack_version: rulePackVersion,
                }),
            });
            if (res.ok) {
                setPromotedIds(prev => new Set(prev).add(index));
            }
        } catch (e) {
            console.error("Failed to promote rule:", e);
        } finally {
            setPromotingIds(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    const isLimited = error || (!findings || findings.length === 0);
    const hasAnyPromoted = promotedIds.size > 0;

    return (
        <div className="mt-2 rounded border border-[#223247] bg-[#0c1322] p-2 text-sm shadow-lg">
            <div className="mb-2 flex items-center justify-between border-b border-[#223247] pb-2">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-400">Supervisor Findings</span>
                    {total_impact !== undefined && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${total_impact > 1.2 ? "bg-rose-500/20 text-rose-400" : "bg-blue-500/20 text-blue-400"}`}>
                            Impact: {total_impact.toFixed(1)}
                        </span>
                    )}
                    {tokenKey && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-200">
                            token: {tokenKey}
                        </span>
                    )}
                    {versionPairValid !== null && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${versionPairValid ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300"}`}>
                            pair: {versionPairValid ? "valid" : "mismatch"}
                        </span>
                    )}
                    {reasonCode && (
                        <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-mono text-amber-200">
                            reason: {reasonCode}
                        </span>
                    )}
                    {staleMarkedCount > 0 && (
                        <span className="rounded bg-rose-900/40 px-1.5 py-0.5 text-[10px] font-mono text-rose-200">
                            stale snapshots: {staleMarkedCount}
                        </span>
                    )}
                </div>
                {isLimited && (
                    <button
                        type="button"
                        onClick={() => setShowError(!showError)}
                        className={`text-[10px] font-mono transition-opacity hover:opacity-100 ${showError ? "text-rose-400 opacity-100" : "text-amber-500 opacity-70"}`}
                    >
                        {showError ? (error ? `Error: ${error}` : "Debug: Empty Findings") : "Analysis info"}
                    </button>
                )}
            </div>

            {showError && (
                <div className="mb-3 rounded bg-black/40 p-2 font-mono text-[10px] text-slate-500">
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(response, null, 2)}
                    </pre>
                </div>
            )}

            {findings && findings.length > 0 ? (
                <div className="space-y-3">
                    {findings.map((f, i) => {
                        const isPromotingItem = promotingIds.has(i);
                        const isPromotedItem = promotedIds.has(i);

                        return (
                            <div key={i} className="group relative rounded border border-white/5 bg-white/[0.02] p-2 transition-colors hover:bg-white/[0.04]">
                                <div className="mb-1 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${f.severity === "system_rule" ? "text-rose-400" : "text-blue-400"}`}>
                                            {f.category}
                                        </span>
                                        <span className="text-[10px] text-slate-500">•</span>
                                        <span className={`text-[10px] font-mono ${f.impact_score > 0.7 ? "text-rose-300" : "text-slate-400"}`}>
                                            Score: {f.impact_score.toFixed(1)}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handlePromote(f.details, f.category, i)}
                                        disabled={isPromotingItem || isPromotedItem}
                                        className={`text-[10px] transition-opacity ${isPromotedItem
                                                ? "text-emerald-400 opacity-100 font-bold"
                                                : isPromotingItem
                                                    ? "text-amber-400 opacity-100"
                                                    : "text-blue-400 opacity-0 hover:underline group-hover:opacity-100"
                                            }`}
                                    >
                                        {isPromotedItem ? "✅ Promoted" : isPromotingItem ? "Promoting..." : "Push to Dict"}
                                    </button>
                                </div>
                                <div className="text-slate-200 leading-relaxed font-medium">
                                    {f.details}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-slate-400 italic px-2 py-1">
                    Supervisor noted the feedback but didn&apos;t extract discrete technical rules.
                </div>
            )}

            {summary_action && (
                <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-2 text-[11px] text-amber-200/90 shadow-inner">
                    <span className="font-bold text-amber-400 uppercase tracking-tighter mr-2">Action:</span>
                    {summary_action}
                </div>
            )}

            {(taxonomyVersion || rulePackVersion || locationRef || detectionMode || enforcementMode || originalDetectionMode || currentDetectionMode) && (
                <div className="mt-2 rounded border border-[#223247] bg-[#0a1220] px-2 py-2 text-[10px] text-slate-300">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>taxonomy: {taxonomyVersion ?? "-"}</span>
                        <span>rule-pack: {rulePackVersion ?? "-"}</span>
                        <span>location: {locationRef ?? "-"}</span>
                        <span>mode: {detectionMode ?? "-"} / {enforcementMode ?? "-"}</span>
                        <span>original mode: {originalDetectionMode ?? "-"} / {originalEnforcementMode ?? "-"}</span>
                        <span>current mode: {currentDetectionMode ?? "-"} / {currentEnforcementMode ?? "-"}</span>
                    </div>
                </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-[#223247] pt-2">
                <div className="text-[10px] text-slate-500 italic">
                    {hasAnyPromoted ? "✅ Rules pushed to system knowledge" : "Click findings to promote as rules"}
                </div>
                <button
                    type="button"
                    onClick={onClearResponse}
                    className="text-[10px] text-slate-500 transition-colors hover:text-red-400"
                >
                    Chưa đúng ý (Try Again)
                </button>
            </div>
        </div>
    );
}
