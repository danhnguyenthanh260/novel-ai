"use client";

import React, { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { DictionaryEntry, DictionaryTier, upsertDictionaryEntry, deleteDictionaryEntry } from "../server/dictionaryService";

type DictionaryManagerProps = {
    initialEntries: DictionaryEntry[];
    storyId: number;
    defaultTier?: DictionaryTier;
    hideTabs?: boolean;
};

export default function DictionaryManager({ initialEntries, storyId, defaultTier = "technical", hideTabs = false }: DictionaryManagerProps) {
    const params = useParams<{ slug: string }>();
    const [entries, setEntries] = useState<DictionaryEntry[]>(initialEntries);
    const [activeTier, setActiveTier] = useState<DictionaryTier>(defaultTier);
    const [isPending, startTransition] = useTransition();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [formTerm, setFormTerm] = useState("");
    const [formDef, setFormDef] = useState("");
    const [formAgentInst, setFormAgentInst] = useState("");
    const [formGlobal, setFormGlobal] = useState(false);
    const [formActive, setFormActive] = useState(true);
    const [formPriority, setFormPriority] = useState(5);
    const [formAliases, setFormAliases] = useState("");
    const [formValidFrom, setFormValidFrom] = useState<number | null>(null);
    const [formValidTo, setFormValidTo] = useState<number | null>(null);

    // Test-Drive state
    const [sampleText, setSampleText] = useState("");
    const [simResult, setSimResult] = useState("");
    const [isSimulating, setIsSimulating] = useState(false);
    const [showTestDrive, setShowTestDrive] = useState(false);

    // Audit state
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<{ conflicts: any[], summary: string } | null>(null);

    const filtered = entries.filter((e) => e.tier === activeTier);

    const handleAudit = async () => {
        if (!params?.slug) return;
        setIsAuditing(true);
        setAuditResult(null);
        try {
            const res = await fetch(`/api/stories/${params.slug}/dictionary/audit`, { method: "POST" });
            const data = await res.json();
            if (data.ok) {
                setAuditResult({ conflicts: data.conflicts || [], summary: data.summary });
            } else {
                alert("Audit failed: " + data.error);
            }
        } catch (e: any) {
            alert("Audit failed: " + e.message);
        } finally {
            setIsAuditing(false);
        }
    };

    const handleEdit = (entry: DictionaryEntry) => {
        setEditingId(entry.id);
        setFormTerm(entry.term_key);
        setFormDef(entry.definition);
        setFormAgentInst(entry.agent_instructions);
        setFormGlobal(entry.story_id === null);
        setFormActive(entry.is_active);
        setFormPriority(entry.priority ?? 5);
        setFormAliases(Array.isArray(entry.aliases) ? entry.aliases.join(", ") : "");
        setFormValidFrom(entry.valid_from_chapter);
        setFormValidTo(entry.valid_to_chapter);

        // Reset test drive when switching edit
        setSimResult("");
        setSampleText("");
        setShowTestDrive(false);
        setAuditResult(null);
    };

    const handleAddNew = () => {
        setEditingId("new");
        setFormTerm("");
        setFormDef("");
        setFormAgentInst("");
        setFormGlobal(false);
        setFormActive(true);
        setFormPriority(5);
        setFormAliases("");
        setFormValidFrom(null);
        setFormValidTo(null);

        setSimResult("");
        setSampleText("");
        setShowTestDrive(false);
        setAuditResult(null);
    };

    const handleCancel = () => {
        setEditingId(null);
    };

    const handleSave = () => {
        if (!formTerm.trim() || !formDef.trim() || !formAgentInst.trim()) {
            alert("Please fill all required fields.");
            return;
        }

        const aliasList = formAliases.split(",").map(a => a.trim()).filter(a => !!a);

        startTransition(async () => {
            try {
                const updated = await upsertDictionaryEntry(
                    editingId === "new" ? null : editingId,
                    formGlobal ? null : storyId,
                    activeTier,
                    formTerm,
                    formDef,
                    formAgentInst,
                    formActive,
                    formPriority,
                    formGlobal ? 'global' : 'local',
                    aliasList,
                    formValidFrom,
                    formValidTo
                );

                if (editingId === "new") {
                    setEntries((prev) => [...prev, updated]);
                } else {
                    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                }
                setEditingId(null);
                setAuditResult(null); // Reset audit when rules change
            } catch (err: any) {
                alert("Error saving: " + err.message);
            }
        });
    };

    const handleDelete = (id: string) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;
        startTransition(async () => {
            try {
                await deleteDictionaryEntry(id);
                setEntries((prev) => prev.filter((e) => e.id !== id));
            } catch (err: any) {
                alert("Error deleting: " + err.message);
            }
        });
    };

    const handleTestDrive = async () => {
        if (!sampleText.trim() || !params?.slug) return;
        setIsSimulating(true);
        try {
            const res = await fetch(`/api/stories/${params.slug}/dictionary/test-drive`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sample_text: sampleText,
                    rule_content: formAgentInst,
                    tier: activeTier
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setSimResult(data.analysis);
            } else {
                setSimResult("Error: " + data.error);
            }
        } catch (e: any) {
            setSimResult("Failed to simulate: " + e.message);
        } finally {
            setIsSimulating(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {!hideTabs && (
                <div className="flex gap-4 border-b border-[#30363d] pb-2">
                    {(["technical", "narrative", "style"] as DictionaryTier[]).map((tier) => (
                        <button
                            key={tier}
                            onClick={() => {
                                setActiveTier(tier);
                                setEditingId(null);
                            }}
                            className={`px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${activeTier === tier
                                ? "border-b-2 border-blue-500 text-slate-100"
                                : "text-slate-400 hover:text-slate-200"
                                }`}
                        >
                            {tier}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-200 capitalize w-full">
                    {activeTier} Rules
                </h2>
                {!editingId && (
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                if (!confirm("This will deactivate all AUTO_RULE entries and initialize the 5 Universal Pillars. Proceed?")) return;
                                const res = await fetch(`/api/stories/${params.slug}/dictionary/consolidate`, { method: "POST" });
                                if (res.ok) {
                                    alert("Consolidation successful. Please refresh rules.");
                                    window.location.reload();
                                }
                            }}
                            className="whitespace-nowrap rounded border border-blue-500/30 bg-blue-600/10 px-3 py-1.5 text-xs font-bold text-blue-400 hover:bg-blue-600/20"
                        >
                            Consolidate to Pillars
                        </button>
                        <button
                            onClick={handleAudit}
                            disabled={isAuditing || entries.length < 2}
                            className="whitespace-nowrap rounded border border-amber-500/30 bg-amber-600/10 px-3 py-1.5 text-xs font-bold text-amber-500 hover:bg-amber-600/20 disabled:opacity-50"
                        >
                            {isAuditing ? "Auditing..." : "Check Conflicts"}
                        </button>
                        <button
                            onClick={handleAddNew}
                            className="whitespace-nowrap rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
                        >
                            Add New Rule
                        </button>
                    </div>
                )}
            </div>

            {auditResult && !editingId && (
                <div className="rounded border border-blue-500/30 bg-[#0d1629] p-4 shadow-sm animate-pulse-once">
                    <div className="flex justify-between items-center mb-2">
                        <div className="text-sm font-semibold text-blue-400">Logic Audit Result</div>
                        <button onClick={() => setAuditResult(null)} className="text-xs text-slate-500 hover:text-slate-300">Dismiss</button>
                    </div>
                    <div className="text-xs text-slate-400 mb-3">{auditResult.summary}</div>
                    {auditResult.conflicts.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {auditResult.conflicts.map((c, i) => (
                                <div key={i} className="rounded bg-red-900/10 border border-red-500/20 p-2 text-xs">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 font-bold text-red-400 mb-1">
                                                <span>Conflict:</span>
                                                <span className="bg-slate-800 px-1 rounded">{c.rule_a}</span>
                                                <span>↔</span>
                                                <span className="bg-slate-800 px-1 rounded">{c.rule_b}</span>
                                            </div>
                                            <div className="text-slate-300 mb-1 font-mono italic">"{c.reason}"</div>
                                            <div className="text-slate-400"><strong className="text-slate-500">Fix Suggestion:</strong> {c.resolution}</div>
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0">
                                            <button
                                                onClick={async () => {
                                                    const entryA = entries.find(e => e.term_key === c.rule_a);
                                                    if (entryA) {
                                                        const normalizedAliases = Array.isArray(entryA.aliases) ? entryA.aliases : (typeof entryA.aliases === 'string' && entryA.aliases ? [entryA.aliases] : []);
                                                        await upsertDictionaryEntry(
                                                            entryA.id,
                                                            entryA.story_id,
                                                            entryA.tier,
                                                            entryA.term_key,
                                                            entryA.definition,
                                                            entryA.agent_instructions,
                                                            false,
                                                            entryA.priority,
                                                            entryA.scope,
                                                            normalizedAliases,
                                                            entryA.valid_from_chapter,
                                                            entryA.valid_to_chapter
                                                        );
                                                        setEntries(prev => prev.map(e => e.id === entryA.id ? { ...e, is_active: false } : e));
                                                        alert(`Deactivated ${c.rule_a}`);
                                                    }
                                                }}
                                                className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-[10px] uppercase font-bold border border-red-600/30 transition"
                                            >
                                                Kill {c.rule_a}
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    const entryB = entries.find(e => e.term_key === c.rule_b);
                                                    if (entryB) {
                                                        const normalizedAliases = Array.isArray(entryB.aliases) ? entryB.aliases : (typeof entryB.aliases === 'string' && entryB.aliases ? [entryB.aliases] : []);
                                                        await upsertDictionaryEntry(
                                                            entryB.id,
                                                            entryB.story_id,
                                                            entryB.tier,
                                                            entryB.term_key,
                                                            entryB.definition,
                                                            entryB.agent_instructions,
                                                            false,
                                                            entryB.priority,
                                                            entryB.scope,
                                                            normalizedAliases,
                                                            entryB.valid_from_chapter,
                                                            entryB.valid_to_chapter
                                                        );
                                                        setEntries(prev => prev.map(e => e.id === entryB.id ? { ...e, is_active: false } : e));
                                                        alert(`Deactivated ${c.rule_b}`);
                                                    }
                                                }}
                                                className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-[10px] uppercase font-bold border border-red-600/30 transition"
                                            >
                                                Kill {c.rule_b}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-green-500 font-semibold">✓ No direct conflicts detected between current rules.</div>
                    )}
                </div>
            )}


            {editingId && (
                <div className="rounded border border-blue-500/50 bg-[#0d1629] p-4 shadow-sm animate-pulse-once">
                    <div className="mb-4 text-sm font-semibold text-blue-400">
                        {editingId === "new" ? "Create New Rule" : "Edit Rule"}
                    </div>
                    <div className="flex flex-col gap-3 text-sm">
                        <div>
                            <label className="mb-1 block text-slate-400">Term / Key Idea</label>
                            <input
                                autoFocus
                                className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                                value={formTerm}
                                onChange={(e) => setFormTerm(e.target.value)}
                                placeholder="e.g. MID_WORD_CUT or Kuro"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-slate-400">Definition</label>
                            <textarea
                                className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none min-h-[60px]"
                                value={formDef}
                                onChange={(e) => setFormDef(e.target.value)}
                                placeholder="Core meaning or context..."
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-slate-400">Agent Instructions (The Constitutional Rule)</label>
                            <textarea
                                className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none min-h-[80px]"
                                value={formAgentInst}
                                onChange={(e) => setFormAgentInst(e.target.value)}
                                placeholder="Strict instructions injected into the system prompt."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-slate-400">Priority (1-10)</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                                    value={formPriority}
                                    onChange={(e) => setFormPriority(Number(e.target.value))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-slate-400">Aliases (Comma separated)</label>
                                <input
                                    className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                                    value={formAliases}
                                    onChange={(e) => setFormAliases(e.target.value)}
                                    placeholder="e.g. Peter, Spiderman"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-slate-400">Valid From Chapter</label>
                                <input
                                    type="number"
                                    className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                                    value={formValidFrom ?? ""}
                                    onChange={(e) => setFormValidFrom(e.target.value ? Number(e.target.value) : null)}
                                    placeholder="Empty = All"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-slate-400">Valid To Chapter</label>
                                <input
                                    type="number"
                                    className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none"
                                    value={formValidTo ?? ""}
                                    onChange={(e) => setFormValidTo(e.target.value ? Number(e.target.value) : null)}
                                    placeholder="Empty = All"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-6 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={formGlobal}
                                    onChange={(e) => setFormGlobal(e.target.checked)}
                                    className="accent-blue-500 cursor-pointer"
                                />
                                Apply Globally (All Stories)
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={formActive}
                                    onChange={(e) => setFormActive(e.target.checked)}
                                    className="accent-blue-500 cursor-pointer"
                                />
                                Active
                            </label>
                        </div>

                        {/* Test-Drive Panel */}
                        <div className="mt-6 border-t border-[#30363d] pt-4">
                            <button
                                type="button"
                                onClick={() => setShowTestDrive(!showTestDrive)}
                                className="flex items-center gap-2 text-xs font-semibold text-amber-400 hover:text-amber-300"
                            >
                                {showTestDrive ? "Close Test-Drive" : "Test-Drive this Rule (Dry-Run)"}
                            </button>

                            {showTestDrive && (
                                <div className="mt-3 rounded bg-[#0b1117] p-3 border border-amber-500/20">
                                    <label className="mb-2 block text-xs font-medium text-slate-400">Paste sample text to verify logic:</label>
                                    <textarea
                                        className="w-full rounded border border-[#30363d] bg-[#0d1629] px-3 py-2 text-slate-200 focus:border-amber-500/50 focus:outline-none min-h-[100px] text-xs"
                                        value={sampleText}
                                        onChange={(e) => setSampleText(e.target.value)}
                                        placeholder="Paste a paragraph from your story here..."
                                    />
                                    <button
                                        type="button"
                                        onClick={handleTestDrive}
                                        disabled={isSimulating || !sampleText.trim()}
                                        className="mt-2 rounded bg-amber-600/20 px-3 py-1.5 text-xs font-bold text-amber-400 border border-amber-600/30 hover:bg-amber-600/30 disabled:opacity-50"
                                    >
                                        {isSimulating ? "Simulating..." : "Run Simulation"}
                                    </button>

                                    {simResult && (
                                        <div className="mt-3 p-3 rounded bg-[#161b22] border border-blue-500/10 text-xs text-blue-200/80 whitespace-pre-wrap font-mono">
                                            <div className="mb-1 font-bold text-blue-400 uppercase">AI Simulation Result:</div>
                                            {simResult}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                className="rounded bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-500 disabled:opacity-50"
                            >
                                {isPending ? (
                                    <span className="animate-pulse">Saving...</span>
                                ) : (
                                    "Save Rule"
                                )}
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={isPending}
                                className="rounded bg-transparent px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!editingId && filtered.length === 0 && (
                <div className="rounded border border-[#30363d] bg-[#0d1117] py-12 text-center text-sm text-slate-500">
                    No rules found for {activeTier}.
                </div>
            )}

            {!editingId && filtered.length > 0 && (
                <div className="grid gap-3">
                    {filtered.map((entry) => (
                        <div key={entry.id} className={`rounded border ${entry.is_active ? "border-[#21262d]" : "border-red-900/40 opacity-60"} bg-[#0d1117] p-4 transition-colors hover:border-[#4b5563]`}>
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-200">{entry.term_key}</span>
                                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 border border-slate-700">
                                            P{entry.priority}
                                        </span>
                                        {!entry.story_id && (
                                            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-400 border border-purple-500/20">
                                                Global
                                            </span>
                                        )}
                                        {entry.valid_from_chapter !== null || entry.valid_to_chapter !== null ? (
                                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500 border border-amber-500/20">
                                                CH: {entry.valid_from_chapter ?? "∞"} - {entry.valid_to_chapter ?? "∞"}
                                            </span>
                                        ) : null}
                                        {!entry.is_active && (
                                            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400 border border-red-500/20">
                                                Inactive
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-slate-400">
                                        <strong className="text-slate-500">Def:</strong> {entry.definition}
                                        {entry.aliases && Array.isArray(entry.aliases) && entry.aliases.length > 0 && (
                                            <span className="ml-2 italic text-xs text-slate-500">
                                                (aka: {entry.aliases.join(", ")})
                                            </span>
                                        )}
                                    </div>
                                    <div className="rounded-md bg-[#161b22] p-2 text-sm text-amber-100/80 border border-amber-500/10 whitespace-pre-wrap font-mono text-xs">
                                        {entry.agent_instructions}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 ml-4">
                                    <button
                                        onClick={() => handleEdit(entry)}
                                        className="text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(entry.id)}
                                        className="text-xs font-semibold text-red-500 hover:text-red-400 hover:underline"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
