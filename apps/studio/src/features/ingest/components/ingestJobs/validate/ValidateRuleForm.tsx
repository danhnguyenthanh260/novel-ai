"use client";

import { useState } from "react";

type Props = {
    onAddRule: (rule: { pattern: string; description: string; severity: string }) => void;
    acting?: boolean;
};

export function ValidateRuleForm({ onAddRule, acting }: Props) {
    const [pattern, setPattern] = useState("");
    const [description, setDescription] = useState("");
    const [severity, setSeverity] = useState<"warning" | "error" | "info">("warning");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = pattern.trim();
        if (!trimmed) return;
        onAddRule({ pattern: trimmed, description: description.trim(), severity });
        setPattern("");
        setDescription("");
        setSeverity("warning");
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="muted">pattern:</span>
            <input
                type="text"
                className="bg-transparent border border-[#223247] rounded px-2 py-0.5 text-xs text-slate-200 w-48 focus:outline-none focus:border-slate-500"
                placeholder="regex pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                disabled={acting}
            />
            <span className="muted">severity:</span>
            <select
                className="bg-[#0b1526] border border-[#223247] rounded px-1 py-0.5 text-xs text-slate-200 focus:outline-none"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "warning" | "error" | "info")}
                disabled={acting}
            >
                <option value="warning">warning</option>
                <option value="error">error</option>
                <option value="info">info</option>
            </select>
            <span className="muted">note:</span>
            <input
                type="text"
                className="bg-transparent border border-[#223247] rounded px-2 py-0.5 text-xs text-slate-200 w-40 focus:outline-none focus:border-slate-500"
                placeholder="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={acting}
            />
            <button
                type="submit"
                className="shell-link px-2 py-0.5 text-xs"
                disabled={acting || !pattern.trim()}
            >
                {acting ? "adding..." : "add rule"}
            </button>
        </form>
    );
}
