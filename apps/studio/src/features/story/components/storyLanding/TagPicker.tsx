import React from "react";

type TagPickerProps = {
    label: string;
    selected: string[];
    options: readonly string[];
    onToggle: (tag: string) => void;
    onAddCustom?: (tag: string) => void;
};

export default function TagPicker({ label, selected, options, onToggle, onAddCustom }: TagPickerProps) {
    const [customValue, setCustomValue] = React.useState("");

    const handleCustomAdd = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && customValue.trim() && onAddCustom) {
            onAddCustom(customValue.trim());
            setCustomValue("");
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {options.map((opt) => {
                    const isSelected = selected.includes(opt);
                    return (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => onToggle(opt)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition border ${isSelected
                                    ? "bg-blue-600 border-blue-500 text-white"
                                    : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20"
                                }`}
                        >
                            {opt}
                        </button>
                    );
                })}
                {/* Custom Tags already in 'selected' but not in 'options' */}
                {selected
                    .filter((s) => !options.includes(s))
                    .map((custom) => (
                        <button
                            key={custom}
                            type="button"
                            onClick={() => onToggle(custom)}
                            className="rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 px-2.5 py-1 text-xs font-medium hover:bg-emerald-600/30"
                        >
                            {custom} (Custom)
                        </button>
                    ))}
            </div>
            {onAddCustom && (
                <div className="mt-2">
                    <input
                        className="shell-control w-full bg-[#1a2333]/50 px-3 py-1.5 text-xs border-white/5 placeholder:text-slate-600"
                        placeholder="Type custom tag & press Enter..."
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        onKeyDown={handleCustomAdd}
                    />
                </div>
            )}
        </div>
    );
}
