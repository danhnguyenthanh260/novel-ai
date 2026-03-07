import type { ConsistencySummary } from "@/features/scenes/components/draftRunner/shared";

export function ConsistencySummaryPanel(props: { summary: ConsistencySummary }) {
  const { summary } = props;

  return (
    <details className="surface-card p-2 text-sm">
      <summary className="cursor-pointer font-medium">
        Consistency Summary ({summary.canonConflicts.length}/{summary.timelineInconsistencies.length}/{summary.uncertainQuestions.length})
      </summary>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <div className="shell-control p-2">
          <div className="mb-1 text-xs font-medium text-red-300">Canon conflicts</div>
          <div className="muted space-y-1 text-xs">
            {summary.canonConflicts.length > 0
              ? summary.canonConflicts.slice(0, 6).map((x, idx) => <div key={`canon-${idx}`}>{x}</div>)
              : <div>No conflict marker found.</div>}
          </div>
        </div>
        <div className="shell-control p-2">
          <div className="mb-1 text-xs font-medium text-amber-300">Timeline inconsistencies</div>
          <div className="muted space-y-1 text-xs">
            {summary.timelineInconsistencies.length > 0
              ? summary.timelineInconsistencies.slice(0, 6).map((x, idx) => <div key={`timeline-${idx}`}>{x}</div>)
              : <div>No timeline warning marker found.</div>}
          </div>
        </div>
        <div className="shell-control p-2">
          <div className="mb-1 text-xs font-medium text-sky-300">Uncertain / TODO questions</div>
          <div className="muted space-y-1 text-xs">
            {summary.uncertainQuestions.slice(0, 8).map((x, idx) => (
              <div key={`question-${idx}`}>{x}</div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
