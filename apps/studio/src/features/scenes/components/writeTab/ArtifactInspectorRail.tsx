import { useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  ArtifactPreviewBlockView,
  ContextDigestBlockView,
  WorkflowProgressBlockView,
} from "@/features/scenes/components/writeTab/chatOrchestration/TimelineBlocks";
import {
  continuityWorkflowProgressEvent,
  workflowProgressBlockFromEvent,
} from "@/features/scenes/components/writeTab/chatOrchestration/workflowProgressEvents";
import type { ContextReadiness, ContextReadinessLabel, TimelineBlock, WriteInspectorMode } from "@/features/scenes/components/writeTab/types";

const inspectorTabs: Array<{ mode: WriteInspectorMode; label: string }> = [
  { mode: "progress", label: "Progress" },
  { mode: "context", label: "Context" },
  { mode: "artifacts", label: "Artifacts" },
  { mode: "memory", label: "Memory" },
];

type ArtifactInspectorRailProps = {
  readiness: ContextReadiness;
  continuityQueued: boolean;
  diagnostics: ArtifactInspectorDiagnostics;
  mode: WriteInspectorMode;
  onModeChange: (mode: WriteInspectorMode) => void;
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
  const workflowBlock = buildWorkflowBlock(diagnostics, continuityQueued);
  return Math.max(8, Math.round((workflowBlock.current_step / workflowBlock.total_steps) * 100));
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

function present(condition: boolean, label: string): string | null {
  return condition ? label : null;
}

function buildContextDigestBlock(readiness: ContextReadiness, diagnostics: ArtifactInspectorDiagnostics, continuityQueued: boolean): Extract<TimelineBlock, { type: "context_digest" }> {
  const included = [
    present(diagnostics.hasChapter, `Chapter: ${diagnostics.chapterTitle}`),
    present(diagnostics.hasDraft, `Draft: ${diagnostics.draftWordCount} words`),
    `Artifact mode: ${diagnostics.activeMode}`,
    `Approval: ${diagnostics.gateLabel}`,
  ].filter((item): item is string => Boolean(item));
  const missing = [
    present(!diagnostics.hasChapter, "Chapter selected"),
    present(!diagnostics.hasDraft, "Draft artifact"),
  ].filter((item): item is string => Boolean(item));
  const degraded = [
    present(readiness !== "proceed", `Readiness: ${readinessLabels[readiness]}`),
    present(continuityQueued, "Continuity validation running"),
  ].filter((item): item is string => Boolean(item));
  const conflicts = [
    present(!diagnostics.hasChapter, "No chapter selected"),
    present(!diagnostics.hasDraft, "No draft artifact available"),
    present(readiness === "blocked", "Context readiness is blocked"),
    present(readiness === "degraded", "Context readiness is partial"),
    present(continuityQueued, "Continuity validation is running"),
    present(!diagnostics.canApprove, diagnostics.gateDetail),
  ].filter((item): item is string => Boolean(item));
  return {
    id: "inspector-context-digest",
    type: "context_digest",
    source: "assistant",
    title: diagnostics.hasChapter ? `${diagnostics.chapterTitle} context` : "Context readiness",
    included,
    missing,
    degraded,
    conflicts,
  };
}

function buildWorkflowBlock(diagnostics: ArtifactInspectorDiagnostics, continuityQueued: boolean): Extract<TimelineBlock, { type: "workflow_progress" }> {
  const event = continuityWorkflowProgressEvent({ chapterId: diagnostics.chapterId, queued: continuityQueued });
  if (event) return workflowProgressBlockFromEvent(event);
  const currentStep = diagnostics.canApprove ? 4 : diagnostics.hasDraft ? 2 : 1;
  return {
    id: "inspector-artifact-progress",
    type: "workflow_progress",
    source: "backend",
    event_id: "artifact-progress-snapshot",
    chapter_id: diagnostics.chapterId,
    job_id: null,
    workflow_name: "Artifact Readiness",
    status: diagnostics.canApprove ? "complete" : "running",
    current_step: currentStep,
    total_steps: 4,
    current_step_label: diagnostics.canApprove ? "Ready for review" : diagnostics.gateLabel,
    steps: [
      { label: "Chapter selected", status: diagnostics.hasChapter ? "complete" : "pending" },
      { label: "Draft artifact", status: diagnostics.hasDraft ? "complete" : "pending" },
      { label: "Continuity validation", status: diagnostics.canApprove ? "complete" : "pending" },
      { label: "Reviewer approval", status: diagnostics.canApprove ? "active" : "pending" },
    ],
  };
}

function buildArtifactPreviewBlock(diagnostics: ArtifactInspectorDiagnostics): Extract<TimelineBlock, { type: "artifact_preview" }> {
  return {
    id: "inspector-artifact-preview",
    type: "artifact_preview",
    source: "backend",
    artifact_id: "current-draft",
    artifact_type: "draft",
    title: diagnostics.hasChapter ? diagnostics.chapterTitle : "No chapter selected",
    status: diagnostics.hasDraft ? "draft" : "failed",
    description: diagnostics.hasDraft ? "Draft content opens in the artifact/document workspace." : "Create or select a draft before artifact actions are available.",
    word_count: diagnostics.hasDraft ? diagnostics.draftWordCount : null,
    beat_count: null,
    preview_lines: [
      diagnostics.hasDraft ? `${diagnostics.draftWordCount} words available` : "No draft artifact available",
      diagnostics.gateDetail,
      diagnostics.currentVersionNo !== null ? `Current version v${diagnostics.currentVersionNo} · ${diagnostics.currentVersionKind ?? "unknown"}` : "No current scene version",
    ],
    actions: diagnostics.hasDraft ? ["open_draft", "review_continuity", "edit_in_document"] : ["create_draft"],
  };
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

function TabPreview({
  tab,
  readiness,
  diagnostics,
  continuityQueued,
}: {
  tab: WriteInspectorMode;
  readiness: ContextReadiness;
  diagnostics: ArtifactInspectorDiagnostics;
  continuityQueued: boolean;
}) {
  if (tab === "progress") return <WorkflowProgressBlockView block={buildWorkflowBlock(diagnostics, continuityQueued)} density="detail" />;
  if (tab === "context") return <ContextDigestBlockView block={buildContextDigestBlock(readiness, diagnostics, continuityQueued)} />;
  if (tab === "artifacts") return <ArtifactPreviewBlockView block={buildArtifactPreviewBlock(diagnostics)} density="detail" />;
  if (tab === "memory") return <MemoryPreview diagnostics={diagnostics} />;
  return null;
}

export default function ArtifactInspectorRail({ readiness, continuityQueued, diagnostics, mode, onModeChange }: ArtifactInspectorRailProps) {
  const [inspectorWidth, setInspectorWidth] = useState(308);
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
        {inspectorTabs.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={tab.mode === mode}
            className={tab.mode === mode ? "shell-link shell-link--active px-2 py-1 text-xs" : "shell-link px-2 py-1 text-xs"}
            onClick={() => onModeChange(tab.mode)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <TabPreview tab={mode} readiness={readiness} diagnostics={diagnostics} continuityQueued={continuityQueued} />
    </aside>
  );
}
