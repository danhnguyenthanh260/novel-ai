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
};

export default function ChapterReader({ chapterId, items, pendingProse, stagingData, onSave, onResplit }: ChapterReaderProps) {
    const [showScenes, setShowScenes] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [localProse, setLocalProse] = useState("");

    const isThisPending = pendingProse?.id === chapterId;
    const effectivePendingProse = isThisPending ? pendingProse?.prose : null;

    const displayProse = effectivePendingProse || (stagingData?.user_prose) || items.map(s => s.text_content).join("\n\n");

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
                    {stagingData && !pendingProse && (
                        <span className="text-[10px] bg-[#9de5dc]/20 text-[#9de5dc] px-2 py-0.5 rounded border border-[#9de5dc]/30 font-bold uppercase tracking-widest">
                            DB Draft
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
                        {!pendingProse && stagingData && (
                            <button
                                onClick={handleResplit}
                                className="px-3 py-1.5 text-xs font-semibold rounded bg-[#133a37] border border-[#9de5dc]/30 text-[#9de5dc] hover:bg-[#1a4a46] transition uppercase tracking-wider"
                            >
                                SPLIT INTO SCENES
                            </button>
                        )}
                        {!pendingProse && !stagingData && items.length > 0 && (
                            <button
                                onClick={() => setShowScenes(!showScenes)}
                                className="px-3 py-1.5 text-xs font-semibold rounded bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition uppercase tracking-wider"
                            >
                                {showScenes ? "HIDE SCENE MARKERS" : "SHOW SCENE MARKERS"}
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
                ) : effectivePendingProse || (stagingData && stagingData.user_prose) ? (
                    <div className="text-slate-200 whitespace-pre-wrap text-[17px] leading-relaxed tracking-wide font-serif border-l-2 border-[#9de5dc]/20 pl-6 py-2">
                        {effectivePendingProse || stagingData?.user_prose}
                    </div>
                ) : items.length > 0 ? (
                    showScenes ? (
                        <div className="space-y-12">
                            {items.map((item) => (
                                <section key={item.id} className="space-y-4 border-b border-white/5 pb-12 last:border-0 relative group">
                                    <div className="flex items-center gap-3 mb-6">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                                            SCENE {item.idx} {item.title ? `| ${item.title}` : ""}
                                        </span>
                                        <span className="text-[10px] bg-[#133a37] text-[#9de5dc] px-1.5 py-0.5 rounded uppercase font-mono">
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

            {items.length === 0 && (
                <div className="py-20 text-center muted uppercase tracking-widest text-xs">
                    This chapter is empty.
                </div>
            )}
        </div>
    );
}
