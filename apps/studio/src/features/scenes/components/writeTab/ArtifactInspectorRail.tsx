import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ContextReadiness, ContextReadinessLabel } from "@/features/scenes/components/writeTab/types";

type InspectorTab = "Progress" | "Context" | "Issues" | "Memory" | "Versions";

type ArtifactInspectorRailProps = {
  readiness: ContextReadiness;
  continuityQueued: boolean;
};

const readinessLabels: Record<ContextReadiness, ContextReadinessLabel> = {
  proceed: "Context Clean",
  degraded: "Context Partial",
  blocked: "Context Blocked",
};

const workflowSteps = [
  ["WritingContext", "Done", "Minimum viable context met"],
  ["Draft", "Done", "Document artifact available when prose exists"],
  ["Continuity", "Waiting", "Run after edit"],
  ["Approval", "Locked", "Requires validation"],
  ["Memory", "Locked", "Approved revision only"],
] as const;

function readinessClass(readiness: ContextReadiness): string {
  if (readiness === "proceed") return "status-pill status-pill--clean";
  if (readiness === "blocked") return "status-pill status-pill--blocked";
  return "status-pill status-pill--partial";
}

function ProgressSummary({ continuityQueued }: { continuityQueued: boolean }) {
  return (
    <div className="inspector-summary-list">
      {workflowSteps.map(([label, status, note]) => (
        <div key={label} className="inspector-summary-row">
          <span className={`workflow-dot workflow-dot--${status === "Done" ? "done" : status === "Locked" ? "locked" : continuityQueued ? "active" : "pending"}`} />
          <div>
            <strong>{label}</strong>
            <p>{status === "Waiting" && continuityQueued ? "Running" : status} · {note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabPreview({ tab, continuityQueued }: { tab: InspectorTab; continuityQueued: boolean }) {
  if (tab === "Progress") return <ProgressSummary continuityQueued={continuityQueued} />;
  if (tab === "Context") {
    return (
      <div className="inspector-card-grid">
        {["Intent: Clean", "Immediate continuity: Clean", "Active characters: Partial", "Open threads: Clean", "Forbidden reveals: Watch"].map((item) => (
          <div key={item} className="inspector-mini-card">{item}</div>
        ))}
      </div>
    );
  }
  if (tab === "Issues") {
    return (
      <div className="inspector-stack">
        {["Forbidden reveal risk · Medium", "Relationship state uncertain · Low", "Timeline anchor missing · Low"].map((item) => (
          <div key={item} className="inspector-note">{item}</div>
        ))}
      </div>
    );
  }
  if (tab === "Memory") {
    return (
      <div className="inspector-stack">
        {["fact candidate · Draft-only", "character state change · Needs review", "open thread · Can promote after approval"].map((item) => (
          <div key={item} className="inspector-note">{item}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="inspector-stack">
      {["AI generated draft", "Human edit draft · rev_003", "Continuity checked draft", "Approved revision", "Export snapshot"].map((item) => (
        <div key={item} className="inspector-note">{item}</div>
      ))}
    </div>
  );
}

export default function ArtifactInspectorRail({ readiness, continuityQueued }: ArtifactInspectorRailProps) {
  const [inspectorWidth, setInspectorWidth] = useState(308);
  const [activeTab, setActiveTab] = useState<InspectorTab>("Progress");

  const startResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const onMove = (moveEvent: MouseEvent) => setInspectorWidth(Math.min(380, Math.max(260, startWidth - (moveEvent.clientX - startX))));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <aside className="artifact-inspector" aria-label="Artifact inspector">
      <div className="inspector-resize-handle" onMouseDown={startResize} aria-hidden />
      <div className="inspector-topline">
        <span className={readinessClass(readiness)}>{readinessLabels[readiness]}</span>
        <div className="context-progress-container !m-0 !max-w-none flex-1">
          <div className="context-progress-fill" style={{ width: "65%" }} />
        </div>
        <span className="muted text-[10px]">2 warnings</span>
      </div>
      <div className="inspector-tabs" role="tablist">
        {(["Progress", "Context", "Issues", "Memory", "Versions"] as InspectorTab[]).map((tab) => (
          <button key={tab} type="button" className={tab === activeTab ? "shell-link shell-link--active px-2 py-1 text-xs" : "shell-link px-2 py-1 text-xs"} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <TabPreview tab={activeTab} continuityQueued={continuityQueued} />
    </aside>
  );
}
