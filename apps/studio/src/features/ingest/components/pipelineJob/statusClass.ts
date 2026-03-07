export function statusClass(status: string): string {
  const s = String(status || "").toUpperCase();
  if (s === "DONE") return "border-emerald-600/40 bg-emerald-900/20 text-emerald-200";
  if (s === "RUNNING") return "border-amber-500/40 bg-amber-900/20 text-amber-200";
  if (s === "WAIT_REVIEW") return "border-violet-500/40 bg-violet-900/20 text-violet-200";
  if (s === "FAILED" || s === "BLOCKED") return "border-rose-500/40 bg-rose-900/20 text-rose-200";
  if (s === "READY") return "border-cyan-700/40 bg-cyan-900/20 text-cyan-200";
  return "border-[#2a3441] bg-[#0b1220] text-slate-300";
}
