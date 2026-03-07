"use client";

import React, { useState } from "react";

interface Beat {
    goal: string;
    conflict: string;
    outcome: string;
    pov?: string;
}

interface ScenePlan {
    title: string;
    beats: Beat[];
}

interface InteractiveOutlineProps {
    initialPlan: {
        chapter_summary: string;
        scenes: ScenePlan[];
    };
    onApprove: (finalPlan: any) => void;
    onRefresh: (instructions: string) => void;
}

export function InteractiveOutline({ initialPlan, onApprove, onRefresh }: InteractiveOutlineProps) {
    const [plan, setPlan] = useState(initialPlan);
    const [chatInput, setChatInput] = useState("");

    const handleBeatChange = (sceneIdx: number, beatIdx: number, field: keyof Beat, value: string) => {
        const newPlan = { ...plan };
        newPlan.scenes[sceneIdx].beats[beatIdx][field] = value;
        setPlan(newPlan);
    };

    return (
        <div className="surface-card flex flex-col h-[700px] border border-white/10 rounded-xl bg-black/40 backdrop-blur-md overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white/90">Chapter Beat Map</h3>
                    <p className="text-xs text-white/40">Review and refine the structural outline</p>
                </div>
                <button
                    onClick={() => onApprove(plan)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                    Approve & Write Chapter
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Outline List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {plan.scenes.map((scene, sIdx) => (
                        <div key={sIdx} className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
                                    {sIdx + 1}
                                </div>
                                <input
                                    className="bg-transparent border-none text-white/90 font-bold focus:ring-0 w-full"
                                    value={scene.title}
                                    onChange={(e) => {
                                        const newPlan = { ...plan };
                                        newPlan.scenes[sIdx].title = e.target.value;
                                        setPlan(newPlan);
                                    }}
                                />
                            </div>

                            <div className="ml-8 space-y-4">
                                {scene.beats.map((beat, bIdx) => (
                                    <div key={bIdx} className="p-3 bg-white/5 border border-white/5 rounded-lg space-y-2 hover:border-white/10 transition-colors">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider text-white/30 font-bold">Goal</label>
                                                <textarea
                                                    className="w-full bg-black/20 border-none rounded p-2 text-xs text-white/80 focus:ring-1 focus:ring-white/20 min-h-[50px]"
                                                    value={beat.goal}
                                                    onChange={(e) => handleBeatChange(sIdx, bIdx, "goal", e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider text-white/30 font-bold">Conflict</label>
                                                <textarea
                                                    className="w-full bg-black/20 border-none rounded p-2 text-xs text-white/80 focus:ring-1 focus:ring-white/20 min-h-[50px]"
                                                    value={beat.conflict}
                                                    onChange={(e) => handleBeatChange(sIdx, bIdx, "conflict", e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Planning Chat Sidebar */}
                <div className="w-80 border-l border-white/10 bg-white/5 flex flex-col">
                    <div className="p-4 flex-1">
                        <h4 className="text-sm font-bold text-white/60 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            The Architect
                        </h4>
                        <div className="text-xs text-white/40 leading-relaxed italic">
                            "I've structured this chapter to resolve the Kuro subplot while hinting at the upcoming rebellion. Would you like me to adjust the pacing or focus more on a specific character?"
                        </div>
                    </div>

                    <div className="p-4 border-t border-white/10 bg-black/20">
                        <textarea
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white/80 focus:ring-1 focus:ring-blue-500/50 min-h-[80px]"
                            placeholder="Suggest changes to the Architect..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                        />
                        <button
                            onClick={() => {
                                onRefresh(chatInput);
                                setChatInput("");
                            }}
                            className="mt-2 w-full shell-link py-2 text-xs font-bold bg-white/5 hover:bg-white/10 transition-all text-blue-300"
                        >
                            Update Beat Map
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
