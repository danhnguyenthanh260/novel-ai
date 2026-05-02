"use client";

import { useState } from "react";

type ChapterReaderProps = {
    chapterId: string;
    items: Array<{
        id: number;
        idx: number;
        title: string | null;
        status: string;
        text_content: string;
    }>;
    pendingProse: { id: string; prose: string } | null;
    stagingData: { user_prose: string; llm_prose: string; status: string } | null;
    onSave: (prose: string) => Promise<void>;
    onResplit: (prose: string) => Promise<void>;
    v3Draft?: { full_text: string; status: string; virtual_scenes: any[] } | null;
};

export default function ChapterReader({ chapterId, items, pendingProse, stagingData, onSave, onResplit, v3Draft }: ChapterReaderProps) {
    const [viewingDraft, setViewingDraft] = useState((stagingData || v3Draft) && items.length === 0);
    const [showScenes, setShowScenes] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [localProse, setLocalProse] = useState("");

    const isThisPending = pendingProse?.id === chapterId;
    const effectivePendingProse = isThisPending ? pendingProse?.prose : null;

    // Unified prose logic: Priority: Pending > V3 Draft > Staging > Scenes Joined
    const displayProse = (
        effectivePendingProse ||
        (viewingDraft && v3Draft ? v3Draft.full_text : null) ||
        (viewingDraft && stagingData ? (stagingData.user_prose || stagingData.llm_prose) : null) ||
        (items.length > 0 ? items.map(s => s.text_content).join("\n\n") : (v3Draft?.full_text || stagingData?.user_prose || stagingData?.llm_prose))
    ) || "";

    const startEditing = () => {
        setLocalProse(displayProse);
        setIsEditing(true);
    };

    const handleSave = async () => {
        await onSave(localProse);
        setIsEditing(false);
    };

    const handleResplit = async () => {
        if (!confirm("This will delete all existing scenes in this chapter and recreate them based on your text. Continue?")) return;
        await onResplit(localProse || displayProse);
        setIsEditing(false);
    };

    const hasVirtualScenes = items.some(s => s.id === -1);
    const isV3 = !!v3Draft || hasVirtualScenes;

    return (
        <div className="flex flex-col gap-6 p-4 md:p-8 bg-[#0a0a0a] text-slate-200">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-3">
                    Chapter {chapterId}
                    {pendingProse && (
                        <span className="text-[10px] bg-[#ff8f8f]/20 text-[#ff8f8f] px-2 py-0.5 rounded border border-[#ff8f8f]/30 font-bold uppercase tracking-widest">
                            RAM Draft
                        </span>
                    )}
                    {(stagingData || v3Draft) && !pendingProse && (
                        <span className="text-[10px] bg-[#9de5dc]/20 text-[#9de5dc] px-2 py-0.5 rounded border border-[#9de5dc]/30 font-bold uppercase tracking-widest">
                            {isV3 ? "V3 LEDGER DRAFT" : "DB Draft"}
                        </span>
                    )}
                </h1>
                <div className="muted text-xs uppercase tracking-widest mt-1">
                    {isEditing ? "Editing Mode" : "Reading Mode"}
                </div>
            </div>
            <div className="flex items-center gap-2">
                {!isEditing ? (
                    <>
                        <button
                            onClick={startEditing}
                            className="px-3 py-1.5 text-xs font-semibold rounded bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition uppercase tracking-wider"
                        >
                            EDIT CHAPTER
                        </button>
                        {!pendingProse && (stagingData || v3Draft) && (
                            <button
                                onClick={handleResplit}
                                className="px-3 py-1.5 text-xs font-semibold rounded bg-[#133a37] border border-[#9de5dc]/30 text-[#9de5dc] hover:bg-[#1a4a46] transition uppercase tracking-wider"
                            >
                                {isV3 ? "FINALIZE & SPLIT" : "SPLIT INTO SCENES"}
                            </button>
                        )}
                        {(stagingData || v3Draft) && items.length > 0 && !hasVirtualScenes && (
                            <button
                                onClick={() => setViewingDraft(!viewingDraft)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded border transition uppercase tracking-wider ${
                                    viewingDraft
                                    ? "bg-[#9de5dc]/10 border-[#9de5dc]/30 text-[#9de5dc] hover:bg-[#9de5dc]/20"
                                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                }`}
                            >
                                {viewingDraft ? "VIEW VERIFIED SCENES" : "VIEW UNFINISHED DRAFT"}
                            </button>
                        )}
                        {!pendingProse && !stagingData && items.length > 0 && (
                            <button
                                onClick={() => setShowScenes(!showScenes)}
                                className="px-3 py-1.5 text-xs font-semibold rounded bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition uppercase tracking-wider"
                            >
                                {showScenes ? "HIDE SCENE MARKERS" : (isV3 ? "SHOW GHOST MARKERS" : "SHOW SCENE MARKERS")}
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <button
                            onClick={handleSave}
                            className="px-3 py-1.5 text-xs font-semibold rounded bg-[#9de5dc] text-[#0a0a0a] hover:bg-[#b0f0e8] transition uppercase tracking-wider"
                        >
                            SAVE DRAFT
                        </button>
                        <button
                            onClick={handleResplit}
                            className="px-3 py-1.5 text-xs font-semibold rounded bg-[#133a37] text-[#9de5dc] border border-[#9de5dc]/20 hover:bg-[#1a4a46] transition uppercase tracking-wider"
                        >
                            SAVE & SPLIT
                        </button>
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-3 py-1.5 text-xs font-semibold rounded bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition uppercase tracking-wider"
                        >
                            CANCEL
                        </button>
                    </>
                )}
            </div>

            <article className="mx-auto max-w-3xl w-full">
                {isEditing ? (
                    <textarea
                        className="w-full min-h-[600px] bg-[#111] text-slate-200 p-6 rounded border border-white/10 focus:border-[#9de5dc]/30 outline-none font-serif text-[17px] leading-relaxed resize-none"
                        value={localProse}
                        onChange={(e) => setLocalProse(e.target.value)}
                        placeholder="Write your chapter content here..."
                    />
                ) : effectivePendingProse || (stagingData && stagingData.user_prose) || (v3Draft && viewingDraft) ? (
                    <div className="text-slate-200 whitespace-pre-wrap text-[17px] leading-relaxed tracking-wide font-serif border-l-2 border-[#9de5dc]/20 pl-6 py-2">
                        {effectivePendingProse || (viewingDraft && v3Draft ? v3Draft.full_text : stagingData?.user_prose)}
                    </div>
                ) : items.length > 0 ? (
                    showScenes ? (
                        <div className="space-y-12">
                            {items.map((item) => (
                                <section key={item.id === -1 ? `virtual-${item.idx}` : item.id} className="space-y-4 border-b border-white/5 pb-12 last:border-0 relative group">
                                    <div className="flex items-center gap-3 mb-6">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                                            {item.id === -1 ? "GHOST SCENE" : "SCENE"} {item.idx} {item.title ? `| ${item.title}` : ""}
                                        </span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono ${item.id === -1 ? "bg-white/10 text-slate-400" : "bg-[#133a37] text-[#9de5dc]"}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                    <div className="text-slate-200 whitespace-pre-wrap text-lg leading-relaxed font-serif">
                                        {item.text_content || <span className="italic opacity-30">(No content for this scene)</span>}
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : (
                        <div className="text-slate-200 whitespace-pre-wrap text-[17px] leading-relaxed tracking-wide font-serif">
                            {items.map((s) => s.text_content).join("\n\n")}
                        </div>
                    )
                ) : (
                    <div className="py-20 text-center muted italic">No content available for this chapter.</div>
                )}
            </article>

            {items.length === 0 && !stagingData && !v3Draft && !pendingProse && (
                <div className="py-20 text-center muted uppercase tracking-widest text-xs">
                    This chapter is empty.
                </div>
            )}
        </div>
    );
}
