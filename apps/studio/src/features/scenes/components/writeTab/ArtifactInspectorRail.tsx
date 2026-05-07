import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ContextReadiness, ContextReadinessLabel } from "@/features/scenes/components/writeTab/types";

type InspectorTab = "Progress" | "Context" | "Issues" | "Memory" | "Versions";

type ArtifactInspectorRailProps = {
  readiness: ContextReadiness;
  continuityQueued: boolean;
  diagnostics: ArtifactInspectorDiagnostics;
};

export type ArtifactInspectorDiagnostics = {
  activeMode: string;
  chapterId: string;
  chapterTitle: string;
  hasChapter: boolean;
  hasDraft: boolean;
  draftWordCount: number;
  currentVersionNo: number | null;
  currentVersionKind: string | null;
  gateLabel: string;
  gateDetail: string;
  canApprove: boolean;
};

const readinessLabels: Record<ContextReadiness, ContextReadinessLabel> = {
  proceed: "Context Clean",
  degraded: "Context Partial",
  blocked: "Context Blocked",
};

function readinessClass(readiness: ContextReadiness): string {
  if (readiness === "proceed") return "status-pill status-pill--clean";
  if (readiness === "blocked") return "status-pill status-pill--blocked";
  return "status-pill status-pill--partial";
}

function progressPercent(diagnostics: ArtifactInspectorDiagnostics, continuityQueued: boolean) {
  const completed =
    Number(diagnostics.hasChapter) +
    Number(diagnostics.hasDraft) +
    Number(continuityQueued || diagnostics.canApprove) +
    Number(diagnostics.canApprove);
  return Math.max(8, Math.round((completed / 4) * 100));
}

function warningCount(readiness: ContextReadiness, diagnostics: ArtifactInspectorDiagnostics, continuityQueued: boolean) {
  return [
    !diagnostics.hasChapter,
    !diagnostics.hasDraft,
    readiness !== "proceed",
    continuityQueued,
    !diagnostics.canApprove,
  ].filter(Boolean).length;
}

function workflowSteps(diagnostics: ArtifactInspectorDiagnostics, continuityQueued: boolean) {
  return [
    {
      label: "Chapter",
      status: diagnostics.hasChapter ? "Done" : "Locked",
      note: diagnostics.hasChapter ? diagnostics.chapterId : "Select or create a chapter",
    },
    {
      label: "Draft",
      status: diagnostics.hasDraft ? "Done" : "Waiting",
      note: diagnostics.hasDraft ? `${diagnostics.draftWordCount} words available` : "Create or paste prose",
    },
    {
      label: "Continuity",
      status: continuityQueued ? "Running" : diagnostics.canApprove ? "Done" : "Waiting",
      note: continuityQueued ? "Validation running" : "Run after edit",
    },
    {
      label: "Approval",
      status: diagnostics.canApprove ? "Ready" : "Locked",
      note: diagnostics.gateLabel,
    },
    {
      label: "Memory",
      status: diagnostics.canApprove ? "Waiting" : "Locked",
      note: diagnostics.canApprove ? "Ready after reviewer approval" : "Approved revision only",
    },
  ];
}

function stepClass(status: string, continuityQueued: boolean) {
  if (status === "Done" || status === "Ready") return "done";
  if (status === "Locked") return "locked";
  if (status === "Running" || continuityQueued) return "active";
  return "pending";
}

function ProgressSummary({ diagnostics, continuityQueued }: { diagnostics: ArtifactInspectorDiagnostics; continuityQueued: boolean }) {
  return (
    <div className="inspector-summary-list">
      {workflowSteps(diagnostics, continuityQueued).map((step) => (
        <div key={step.label} className="inspector-summary-row">
          <span className={`workflow-dot workflow-dot--${stepClass(step.status, continuityQueued)}`} />
          <div>
            <strong>{step.label}</strong>
            <p>{step.status} · {step.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContextPreview({ readiness, diagnostics }: { readiness: ContextReadiness; diagnostics: ArtifactInspectorDiagnostics }) {
  const contextItems = [
    `Chapter: ${diagnostics.hasChapter ? diagnostics.chapterTitle : "Missing"}`,
    `Artifact mode: ${diagnostics.activeMode}`,
    `Readiness: ${readinessLabels[readiness]}`,
    `Draft words: ${diagnostics.draftWordCount}`,
    `Approval: ${diagnostics.gateLabel}`,
  ];
  return (
    <div className="inspector-card-grid">
      {contextItems.map((item) => (
        <div key={item} className="inspector-mini-card">{item}</div>
      ))}
    </div>
  );
}

function IssuesPreview({
  readiness,
  diagnostics,
  continuityQueued,
}: {
  readiness: ContextReadiness;
  diagnostics: ArtifactInspectorDiagnostics;
  continuityQueued: boolean;
}) {
  const issues = [
    !diagnostics.hasChapter ? "No chapter selected" : null,
    !diagnostics.hasDraft ? "No draft artifact available" : null,
    readiness === "blocked" ? "Context readiness is blocked" : null,
    readiness === "degraded" ? "Context readiness is partial" : null,
    continuityQueued ? "Continuity validation is running" : null,
    !diagnostics.canApprove ? diagnostics.gateDetail : null,
  ].filter((item): item is string => Boolean(item));
  return (
    <div className="inspector-stack">
      {(issues.length ? issues : ["No blocking artifact issues."]).map((item) => (
        <div key={item} className="inspector-note">{item}</div>
      ))}
    </div>
  );
}

function MemoryPreview({ diagnostics }: { diagnostics: ArtifactInspectorDiagnostics }) {
  const memoryItems = [
    "Memory diagnostics unavailable in this inspector.",
    "Use the story Memory workspace for retrieval, conflicts, and extraction review.",
    diagnostics.gateDetail,
  ];
  return (
    <div className="inspector-stack">
      {memoryItems.map((item) => (
        <div key={item} className="inspector-note">{item}</div>
      ))}
    </div>
  );
}

function VersionsPreview({ diagnostics, continuityQueued }: { diagnostics: ArtifactInspectorDiagnostics; continuityQueued: boolean }) {
  const versionItems = [
    diagnostics.currentVersionNo !== null ? `Current version v${diagnostics.currentVersionNo} · ${diagnostics.currentVersionKind ?? "unknown"}` : "No current scene version",
    diagnostics.hasDraft ? `Current draft · ${diagnostics.draftWordCount} words` : "No draft version",
    continuityQueued ? "Continuity check queued" : "Continuity check not running",
    diagnostics.canApprove ? "Approval candidate ready" : `Approval locked · ${diagnostics.gateLabel}`,
  ];
  return (
    <div className="inspector-stack">
      {versionItems.map((item) => (
        <div key={item} className="inspector-note">{item}</div>
      ))}
    </div>
  );
}

function TabPreview({
  tab,
  readiness,
  diagnostics,
  continuityQueued,
}: {
  tab: InspectorTab;
  readiness: ContextReadiness;
  diagnostics: ArtifactInspectorDiagnostics;
  continuityQueued: boolean;
}) {
  if (tab === "Progress") return <ProgressSummary diagnostics={diagnostics} continuityQueued={continuityQueued} />;
  if (tab === "Context") return <ContextPreview readiness={readiness} diagnostics={diagnostics} />;
  if (tab === "Issues") return <IssuesPreview readiness={readiness} diagnostics={diagnostics} continuityQueued={continuityQueued} />;
  if (tab === "Memory") return <MemoryPreview diagnostics={diagnostics} />;
  return <VersionsPreview diagnostics={diagnostics} continuityQueued={continuityQueued} />;
}

export default function ArtifactInspectorRail({ readiness, continuityQueued, diagnostics }: ArtifactInspectorRailProps) {
  const [inspectorWidth, setInspectorWidth] = useState(308);
  const [activeTab, setActiveTab] = useState<InspectorTab>("Progress");
  const progress = progressPercent(diagnostics, continuityQueued);
  const warnings = warningCount(readiness, diagnostics, continuityQueued);

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
          <div className="context-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="muted text-[10px]">{warnings} warnings</span>
      </div>
      <div className="inspector-tabs" role="tablist">
        {(["Progress", "Context", "Issues", "Memory", "Versions"] as InspectorTab[]).map((tab) => (
          <button key={tab} type="button" className={tab === activeTab ? "shell-link shell-link--active px-2 py-1 text-xs" : "shell-link px-2 py-1 text-xs"} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <TabPreview tab={activeTab} readiness={readiness} diagnostics={diagnostics} continuityQueued={continuityQueued} />
    </aside>
  );
}
