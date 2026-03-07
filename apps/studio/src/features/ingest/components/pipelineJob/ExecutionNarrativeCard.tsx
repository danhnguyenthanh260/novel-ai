"use client";

import { type PipelineExecutionNarrative } from "../pipelineJobClientTypes";

export default function ExecutionNarrativeCard({
  narrative,
}: {
  narrative: PipelineExecutionNarrative | null;
}) {
  return (
    <section className="surface-card p-3">
      <div className="mb-2 text-sm font-medium text-slate-200">Execution Narrative</div>
      <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
        <div className="rounded border border-[#2A3441] bg-[#0b1220] px-3 py-2">
          <div className="muted">Just Did</div>
          <div className="font-semibold text-slate-200">{narrative?.last_node_key || "-"}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-950/30 px-3 py-2">
          <div className="muted">Doing Now</div>
          <div className="font-semibold text-amber-200">{narrative?.current_node_key || "-"}</div>
          <div className="muted mt-1">phase: {narrative?.current_phase || "-"}</div>
        </div>
        <div className="rounded border border-[#2A3441] bg-[#0b1220] px-3 py-2">
          <div className="muted">Will Do Next</div>
          <div className="font-semibold text-slate-200">{narrative?.next_node_key || "-"}</div>
        </div>
      </div>
      {narrative?.decision_reason || narrative?.block_reason ? (
        <div className="mt-2 rounded border border-[#2A3441] bg-[#0b1220] px-3 py-2 text-xs text-slate-300">
          <div>decision_reason: {narrative?.decision_reason || "-"}</div>
          <div>block_reason: {narrative?.block_reason || "-"}</div>
        </div>
      ) : null}
    </section>
  );
}
