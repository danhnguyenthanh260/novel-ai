"use client";

import type { ValidateWarning } from "./types";

type Props = {
    warnings: ValidateWarning[];
    label?: string;
};

const SEVERITY_TAG: Record<string, string> = {
    error: "ERROR",
    warning: "WARN ",
    info: "INFO ",
};

export function ValidateWarningList({ warnings, label }: Props) {
    if (!warnings || warnings.length === 0) return null;
    return (
        <div className="grid gap-1">
            {label && <div className="muted text-xs font-medium">{label}</div>}
            {warnings.map((w, i) => (
                <div key={i} className="font-mono text-xs leading-relaxed">
                    <span
                        className={
                            w.severity === "error"
                                ? "text-rose-400"
                                : w.severity === "warning"
                                    ? "text-amber-400"
                                    : "text-slate-400"
                        }
                    >
                        {SEVERITY_TAG[w.severity] ?? w.severity.toUpperCase()}
                    </span>
                    {" | "}
                    <span className="text-slate-300">{w.code}</span>
                    {w.location?.char_offset != null && (
                        <span className="muted"> | offset {w.location.char_offset}</span>
                    )}
                    {w.location?.context_excerpt && (
                        <span className="text-slate-400"> | &ldquo;{w.location.context_excerpt}&rdquo;</span>
                    )}
                    {" | "}
                    <span className="text-slate-400">{w.note}</span>
                </div>
            ))}
        </div>
    );
}
