import { buildAssistantReadiness } from "@/features/scenes/components/writeTab/chatOrchestration/readiness";
import type { RecoveryChip } from "@/features/scenes/components/writeTab/types";

type ReadinessBriefingProps = {
  briefing: ReturnType<typeof buildAssistantReadiness>;
  onChip: (chip: RecoveryChip) => void;
};

function readinessMarker(state: "ok" | "missing" | "partial"): string {
  if (state === "ok") return "✓";
  if (state === "partial") return "~";
  return "✗";
}

export default function ReadinessBriefing({ briefing, onChip }: ReadinessBriefingProps) {
  return (
    <section className={`readiness-card readiness-card--${briefing.status}`} aria-label="Studio readiness briefing">
      <div className="readiness-card__header">
        <div>
          <div className="work-stream__eyebrow">Studio Writing Assistant</div>
          <h1>{briefing.title}</h1>
        </div>
        <span className={`status-pill status-pill--${briefing.status === "ready" ? "clean" : briefing.status === "degraded" ? "partial" : "blocked"}`}>
          {briefing.status.toUpperCase()}
        </span>
      </div>
      <div className="readiness-card__items">
        {briefing.items.map((item) => (
          <div key={item.label} className={`readiness-card__item readiness-card__item--${item.state}`}>
            <span aria-hidden>{readinessMarker(item.state)}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <p>{briefing.summary}</p>
      <div className="readiness-card__chips" aria-label="Recovery options">
        {briefing.chips.map((chip) => (
          <button key={`${chip.intent}-${chip.label}`} type="button" onClick={() => onChip(chip)}>
            {chip.label}
          </button>
        ))}
      </div>
    </section>
  );
}
