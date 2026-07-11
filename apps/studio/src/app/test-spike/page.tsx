"use client";
import { useState } from "react";

export default function SpikePage() {
    // Biến lưu trạng thái hiện tại, mặc định là partial (màu Vàng)
    const [currentStatus, setCurrentStatus] = useState<"clean" | "partial" | "blocked">("partial");

    let colorClasses = "";
    let statusText = "";

    if (currentStatus === "blocked") {
        colorClasses = "bg-red-900 text-red-200 border-red-500";
        statusText = "Context Blocked";
    } else if (currentStatus === "partial") {
        colorClasses = "bg-yellow-900 text-yellow-200 border-yellow-500";
        statusText = "Context Degraded";
    } else {
        colorClasses = "bg-emerald-900 text-emerald-200 border-emerald-500";
        statusText = "Context Clean";
    }

    return (
        <div className="p-10 bg-[#0d1117] min-h-screen text-slate-200">
            <h1 className="text-3xl font-bold mb-2">Phase 4.5: UI Implementation Spike</h1>
            <p className="mb-8 text-slate-400">Tested by: Hao | Component: Context Status Badge</p>
            
            {/* Cụm nút bấm để test đổi trạng thái (Trigger) */}
            <div className="flex gap-4 mb-8">
                <button onClick={() => setCurrentStatus("clean")} className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-emerald-100 rounded border border-emerald-700 transition">
                    Test Clean State
                </button>
                <button onClick={() => setCurrentStatus("partial")} className="px-4 py-2 bg-yellow-900 hover:bg-yellow-800 text-yellow-100 rounded border border-yellow-700 transition">
                    Test Partial State
                </button>
                <button onClick={() => setCurrentStatus("blocked")} className="px-4 py-2 bg-red-900 hover:bg-red-800 text-red-100 rounded border border-red-700 transition">
                    Test Blocked State
                </button>
            </div>

            {/* Đây chính là cái thẻ giao diện cần nộp báo cáo */}
            <div className="flex items-center gap-4 p-6 border border-[#30363d] rounded-lg bg-[#21262d] inline-flex">
                <span className="font-semibold text-lg text-white">Unified Knowledge Hub</span>
                <span className={`px-3 py-1 text-xs font-semibold border rounded-full transition-colors duration-300 ${colorClasses}`}>
                    {statusText}
                </span>
            </div>
        </div>
    );
}