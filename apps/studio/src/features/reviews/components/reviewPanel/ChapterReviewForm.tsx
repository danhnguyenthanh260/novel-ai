import type { ReviewRequest } from "@/features/reviews/components/reviewPanel/types";

type ChapterReviewFormProps = {
  selectedRequest: ReviewRequest;
  v3Data: any;
  acting: boolean;
  onAcceptLedger: () => Promise<void>;
  onApplyPatch: (issueId: number) => Promise<void>;
};

export default function ChapterReviewForm({
  selectedRequest,
  v3Data,
  acting,
  onAcceptLedger,
  onApplyPatch,
}: ChapterReviewFormProps) {
  const ledger = v3Data?.ledger;
  const issues = v3Data?.issues || [];

  return (
    <div className="surface-card space-y-6 p-4">
      <header className="flex items-center justify-between border-b border-[#223247] pb-3">
        <div className="text-sm font-semibold text-emerald-400">Chapter V3 Review: {selectedRequest.chapter_id}</div>
        <button
          className="shell-link bg-emerald-900/30 px-3 py-1 text-xs text-emerald-400 border border-emerald-500/30"
          onClick={onAcceptLedger}
          disabled={acting || selectedRequest.status === 'APPLIED'}
        >
          {selectedRequest.status === 'APPLIED' ? 'LEDRGER ACCEPTED' : 'ACCEPT ALL DELTAS'}
        </button>
      </header>

      {/* Ledger Section */}
      <section className="space-y-2">
        <div className="text-xs font-bold uppercase text-slate-500">Narrative Ledger (Added Facts)</div>
        <div className="max-h-40 overflow-y-auto space-y-1 rounded bg-[#0b1219] p-2">
          {ledger?.added_facts?.map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-2 border-b border-slate-800 pb-1 text-xs">
              <span className="text-emerald-500 font-mono">+</span>
              <span className="text-slate-300">{f.fact || f.content}</span>
              {f.confidence && <span className="ml-auto text-[10px] text-slate-500">{Math.round(f.confidence * 100)}%</span>}
            </div>
          ))}
          {(!ledger?.added_facts || ledger.added_facts.length === 0) && (
            <div className="muted text-xs italic">No new facts extracted.</div>
          )}
        </div>
      </section>

      {/* Issues Section */}
      <section className="space-y-3">
        <div className="text-xs font-bold uppercase text-slate-500">Continuity Issues & Suggestions</div>
        <div className="space-y-3">
          {issues.map((issue: any) => (
            <div key={issue.id} className={`rounded border p-3 ${issue.severity === 'CRITICAL' ? 'border-red-500/30 bg-red-950/10' : 'border-slate-700 bg-slate-800/20'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  issue.severity === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'
                }`}>
                  {issue.severity}
                </span>
                <span className="text-[10px] text-slate-500">{issue.issue_type}</span>
              </div>
              <p className="text-xs text-slate-200 mb-2">{issue.description}</p>

              {issue.patch_suggestion && (
                <div className="mb-2 rounded bg-black/40 p-2 text-[11px] font-mono text-emerald-300 border-l-2 border-emerald-500">
                  {issue.patch_suggestion}
                </div>
              )}

              <div className="flex items-center gap-2 mt-2">
                {issue.auto_patch_available && issue.status === 'OPEN' && (
                  <button
                    className="shell-link px-2 py-1 text-[10px] border border-emerald-500/50 hover:bg-emerald-500/10"
                    onClick={() => onApplyPatch(issue.id)}
                    disabled={acting}
                  >
                    Apply Auto-Patch
                </button>
                )}
                <span className="ml-auto text-[9px] text-slate-500 uppercase">{issue.status}</span>
              </div>
            </div>
          ))}
          {issues.length === 0 && <div className="muted text-xs italic">No issues found by Auditor.</div>}
        </div>
      </section>
    </div>
  );
}
