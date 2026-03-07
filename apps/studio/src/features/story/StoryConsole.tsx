"use client";

import { useState } from "react";
import StorySettingsForm from "./StorySettingsForm";
import DictionaryManager from "@/features/dictionary/components/DictionaryManager";
import { DictionaryEntry, DictionaryTier } from "@/features/dictionary/server/dictionaryService";
import Link from "next/link";

type TabKey = "meta" | "tech" | "lexicon" | "narrative" | "style";

export default function StoryConsole({
    slug,
    storyId,
    initialEntries
}: {
    slug: string,
    storyId: number,
    initialEntries: DictionaryEntry[]
}) {
    const [activeTab, setActiveTab] = useState<TabKey>("meta");

    return (
        <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-100">Unified Knowledge Hub</h1>
                    <p className="muted text-sm mt-1">
                        Configuration and Constitutional Rules for <strong className="text-white">{slug}</strong>
                    </p>
                </div>
                <Link
                    href={`/stories/${slug}`}
                    className="rounded border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d] transition-colors"
                >
                    Back to Story
                </Link>
            </div>

            <div className="flex gap-1 border-b border-[#30363d] overflow-x-auto pb-px">
                <button
                    onClick={() => setActiveTab("meta")}
                    className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === "meta" ? "border-emerald-500 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                >
                    Settings: Core Meta
                </button>
                <button
                    onClick={() => setActiveTab("tech")}
                    className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === "tech" ? "border-emerald-500 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                >
                    Settings: Tech Controls
                </button>
                <div className="w-px bg-[#30363d] mx-2 my-2"></div>
                <button
                    onClick={() => setActiveTab("lexicon")}
                    className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === "lexicon" ? "border-blue-500 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                >
                    Rules: Technical Lexicon
                </button>
                <button
                    onClick={() => setActiveTab("narrative")}
                    className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === "narrative" ? "border-blue-500 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                >
                    Rules: Narrative Bible
                </button>
                <button
                    onClick={() => setActiveTab("style")}
                    className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === "style" ? "border-blue-500 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                >
                    Rules: Style Guide
                </button>
            </div>

            <div className="pt-2">
                {activeTab === "meta" && <StorySettingsForm slug={slug} initialTab="meta" />}
                {activeTab === "tech" && <StorySettingsForm slug={slug} initialTab="tech" />}
                {activeTab === "lexicon" && <DictionaryManager initialEntries={initialEntries} storyId={storyId} defaultTier="technical" hideTabs={true} />}
                {activeTab === "narrative" && <DictionaryManager initialEntries={initialEntries} storyId={storyId} defaultTier="narrative" hideTabs={true} />}
                {activeTab === "style" && <DictionaryManager initialEntries={initialEntries} storyId={storyId} defaultTier="style" hideTabs={true} />}
            </div>
        </div>
    );
}
