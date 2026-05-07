import Link from "next/link";
import { useMemo, useState } from "react";
import ArtifactInspectorRail, { type ArtifactInspectorDiagnostics } from "@/features/scenes/components/writeTab/ArtifactInspectorRail";
import type { ContextReadiness } from "@/features/scenes/components/writeTab/types";

type ArtifactMode = "read" | "edit" | "analysis" | "review" | "approve";

type ArtifactSurfaceProps = {
  storySlug: string;
  chapterId: string;
  chapterTitle: string;
  draftKey: string;
  draftText: string;
  hasChapter: boolean;
  readiness: ContextReadiness;
  continuityQueued: boolean;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
  onSaveDraft: (text: string) => Promise<void>;
  isVisible: boolean;
};

type ApprovalGate = {
  label: string;
  detail: string;
  tone: "locked" | "running" | "ready";
  canApprove: boolean;
};

const artifactTabs: Array<{ mode: ArtifactMode; label: string }> = [
  { mode: "read", label: "Read" },
  { mode: "edit", label: "Edit" },
  { mode: "analysis", label: "Analyze" },
  { mode: "review", label: "Review" },
  { mode: "approve", label: "Approve" },
];

function approvalGate(args: { hasChapter: boolean; hasDraft: boolean; continuityQueued: boolean; readiness: ContextReadiness }): ApprovalGate {
  if (!args.hasChapter) {
    return { label: "No chapter", detail: "Select or create a chapter before approval.", tone: "locked", canApprove: false };
  }
  if (!args.hasDraft) {
    return { label: "No draft", detail: "Create or paste draft prose before approval.", tone: "locked", canApprove: false };
  }
  if (args.readiness === "blocked") {
    return { label: "Blocked", detail: "Context readiness is blocked. Resolve issues before approval.", tone: "locked", canApprove: false };
  }
  if (args.continuityQueued) {
    return { label: "Validation running", detail: "Continuity validation is in progress. Approval unlocks after a clean result.", tone: "running", canApprove: false };
  }
  if (args.readiness === "proceed") {
    return { label: "Ready for approval", detail: "Context is clean and the draft can move to reviewer approval.", tone: "ready", canApprove: true };
  }
  return { label: "Needs validation", detail: "Run continuity and review context warnings before approval.", tone: "locked", canApprove: false };
}

function artifactKindLabel(mode: ArtifactMode): string {
  if (mode === "analysis") return "Analysis Artifact";
  if (mode === "review") return "Review Artifact";
  if (mode === "approve") return "Approval Gate";
  return "Document Artifact";
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildInspectorDiagnostics(args: {
  activeMode: ArtifactMode;
  chapterId: string;
  chapterTitle: string;
  draftText: string;
  gate: ApprovalGate;
  hasChapter: boolean;
  hasDraft: boolean;
}): ArtifactInspectorDiagnostics {
  return {
    activeMode: artifactKindLabel(args.activeMode),
    chapterId: args.chapterId || "none",
    chapterTitle: args.chapterTitle,
    hasChapter: args.hasChapter,
    hasDraft: args.hasDraft,
    draftWordCount: wordCount(args.draftText),
    gateLabel: args.gate.label,
    gateDetail: args.gate.detail,
    canApprove: args.gate.canApprove,
  };
}

function ArtifactHeader({
  chapterTitle,
  hasDraft,
  continuityQueued,
  activeMode,
  gate,
  onQueueContinuity,
}: {
  chapterTitle: string;
  hasDraft: boolean;
  continuityQueued: boolean;
  activeMode: ArtifactMode;
  gate: ApprovalGate;
  onQueueContinuity: () => void;
}) {
  const canRunReadiness = hasDraft && !continuityQueued;

  return (
    <header className="artifact-header">
      <div>
        <div className="artifact-kicker">{artifactKindLabel(activeMode)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <h2>{chapterTitle}</h2>
          <span className="status-pill status-pill--drafting">{hasDraft ? "Draft" : "No Draft"}</span>
          <span className={`status-pill ${gate.tone === "ready" ? "status-pill--clean" : gate.tone === "running" ? "status-pill--partial" : "status-pill--locked"}`}>
            {gate.label}
          </span>
        </div>
        <div className="muted mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span>{hasDraft ? "Draft artifact loaded" : "Waiting for artifact"}</span>
          <span>{continuityQueued ? "Validation queued" : gate.detail}</span>
        </div>
      </div>
      <div className="artifact-actions">
        <button type="button" className="primary-action px-3 py-2 text-xs" disabled={!canRunReadiness} onClick={onQueueContinuity} title={hasDraft ? gate.detail : "Create a draft before checking readiness."}>
          {continuityQueued ? "Continuity running" : "Run continuity check"}
        </button>
        <button type="button" className="locked-action px-3 py-2 text-xs" disabled title="Approval is handled through the review workspace until durable approval state is connected.">
          {gate.canApprove ? "Review required" : "Approval locked"}
        </button>
      </div>
    </header>
  );
}

function ArtifactTabs({ activeMode, onActiveModeChange }: { activeMode: ArtifactMode; onActiveModeChange: (mode: ArtifactMode) => void }) {
  return (
    <div className="artifact-tabs" role="tablist" aria-label="Artifact modes">
      {artifactTabs.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          aria-selected={tab.mode === activeMode}
          className={tab.mode === activeMode ? "shell-link shell-link--active px-3 py-1 text-xs" : "shell-link px-3 py-1 text-xs"}
          onClick={() => onActiveModeChange(tab.mode)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function EmptyArtifact({ hasChapter, onOpenAutoWrite }: { hasChapter: boolean; onOpenAutoWrite: () => void }) {
  return (
    <div className="artifact-empty">
      <div>
        <div className="artifact-empty__title">{hasChapter ? "No draft artifact yet" : "No chapter selected"}</div>
        <p>
          {hasChapter
            ? "Create a draft or paste prose before reviewing, validating, or approving this chapter."
            : "Choose a chapter, create one, or ask Novel Lab what to write next."}
        </p>
      </div>
      <div className="artifact-empty__actions">
        <button type="button" className="primary-action px-4 py-2 text-sm" onClick={onOpenAutoWrite} disabled={!hasChapter}>
          Create draft
        </button>
      </div>
    </div>
  );
}

function ReadArtifact({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="document-artifact p-4">
      <div className="grid gap-4">
        {paragraphs.slice(0, 8).map((paragraph, index) => (
          <p key={`${paragraph.slice(0, 16)}-${index}`} className="text-sm leading-7 text-[var(--text-primary)]">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

function DocumentArtifact({ initialText, onSaveDraft }: { initialText: string; onSaveDraft: (text: string) => Promise<void> }) {
  const [draftText, setDraftText] = useState(initialText);
  const paragraphs = useMemo(() => draftText.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean), [draftText]);

  return (
    <div className="document-artifact">
      <textarea className="document-editor" value={draftText} onChange={(event) => setDraftText(event.target.value)} aria-label="Editable chapter draft artifact" />
      <div className="document-preview" aria-hidden>
        {paragraphs.slice(0, 6).map((paragraph, index) => (
          <div key={`${paragraph.slice(0, 16)}-${index}`} className={`document-block ${index === 1 ? "document-block--selected" : ""}`}>
            <span className="document-handle">::</span>
            <p>{paragraph}</p>
            {index === 2 ? <span className="document-comment">comment</span> : null}
            {index === 1 ? <span className="mini-toolbar">Rewrite · Expand · Analyze</span> : null}
          </div>
        ))}
      </div>
      <div className="document-footer">
        <button type="button" className="shell-link px-3 py-1.5 text-xs" onClick={() => void onSaveDraft(draftText)}>
          Save draft
        </button>
        <span className="muted text-xs">Draft text remains non-canon until approval.</span>
      </div>
    </div>
  );
}

function AnalysisArtifact({ readiness, continuityQueued, onQueueContinuity }: { readiness: ContextReadiness; continuityQueued: boolean; onQueueContinuity: () => void }) {
  return (
    <div className="document-artifact p-4">
      <div className="grid gap-3 text-sm">
        <div className="font-semibold">Readiness: {readiness}</div>
        <p className="muted text-xs">
          {continuityQueued ? "Continuity validation is currently running for this artifact." : "Continuity validation has not been queued for the current artifact state."}
        </p>
        <button type="button" className="primary-action w-fit px-3 py-2 text-xs" onClick={onQueueContinuity}>
          {continuityQueued ? "Continuity running" : "Run continuity check"}
        </button>
      </div>
    </div>
  );
}

function ReviewArtifact({ storySlug, chapterId }: { storySlug: string; chapterId: string }) {
  return (
    <div className="document-artifact p-4">
      <div className="grid gap-3 text-sm">
        <div className="font-semibold">Review handoff</div>
        <p className="muted text-xs">Chapter review requests and reviewer scoring live in the story review workspace.</p>
        <Link href={`/stories/${encodeURIComponent(storySlug)}/reviews`} className="shell-link w-fit px-3 py-2 text-xs">
          Open reviews
        </Link>
        {chapterId ? <span className="muted text-xs">Active chapter: {chapterId}</span> : null}
      </div>
    </div>
  );
}

function ApproveArtifact({
  gate,
  storySlug,
  chapterId,
}: {
  gate: ApprovalGate;
  storySlug: string;
  chapterId: string;
}) {
  return (
    <div className="document-artifact p-4">
      <div className="grid gap-3 text-sm">
        <div className="font-semibold">{gate.label}</div>
        <p className="muted text-xs">{gate.detail}</p>
        <button type="button" className="locked-action w-fit px-3 py-2 text-xs" disabled title="Approval is handled through the review workspace until durable approval state is connected.">
          {gate.canApprove ? "Ready for review" : "Approval locked"}
        </button>
        <Link href={`/stories/${encodeURIComponent(storySlug)}/reviews`} className="shell-link w-fit px-3 py-2 text-xs">
          Open reviews
        </Link>
        {chapterId ? <span className="muted text-xs">Active chapter: {chapterId}</span> : null}
      </div>
    </div>
  );
}

function ArtifactModePanel({
  mode,
  draftText,
  storySlug,
  chapterId,
  readiness,
  continuityQueued,
  gate,
  onQueueContinuity,
  onSaveDraft,
}: {
  mode: ArtifactMode;
  draftText: string;
  storySlug: string;
  chapterId: string;
  readiness: ContextReadiness;
  continuityQueued: boolean;
  gate: ApprovalGate;
  onQueueContinuity: () => void;
  onSaveDraft: (text: string) => Promise<void>;
}) {
  const paragraphs = useMemo(() => draftText.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean), [draftText]);

  if (mode === "read") return <ReadArtifact paragraphs={paragraphs} />;
  if (mode === "analysis") return <AnalysisArtifact readiness={readiness} continuityQueued={continuityQueued} onQueueContinuity={onQueueContinuity} />;
  if (mode === "review") return <ReviewArtifact storySlug={storySlug} chapterId={chapterId} />;
  if (mode === "approve") {
    return (
      <ApproveArtifact
        gate={gate}
        storySlug={storySlug}
        chapterId={chapterId}
      />
    );
  }
  return <DocumentArtifact initialText={draftText} onSaveDraft={onSaveDraft} />;
}

export default function ArtifactSurface(props: ArtifactSurfaceProps) {
  const [activeMode, setActiveMode] = useState<ArtifactMode>("edit");
  const hasDraft = props.draftText.trim().length > 0;
  const gate = approvalGate({
    hasChapter: props.hasChapter,
    hasDraft,
    continuityQueued: props.continuityQueued,
    readiness: props.readiness,
  });
  const inspectorDiagnostics = buildInspectorDiagnostics({
    activeMode,
    chapterId: props.chapterId,
    chapterTitle: props.chapterTitle,
    draftText: props.draftText,
    gate,
    hasChapter: props.hasChapter,
    hasDraft,
  });

  return (
    <section className="artifact-workspace" aria-label="Active artifact workspace">
      {props.isVisible ? (
        <div className="artifact-main">
          <ArtifactHeader
            chapterTitle={props.chapterTitle}
            hasDraft={hasDraft}
            continuityQueued={props.continuityQueued}
            activeMode={activeMode}
            gate={gate}
            onQueueContinuity={props.onQueueContinuity}
          />
          {hasDraft ? <ArtifactTabs activeMode={activeMode} onActiveModeChange={setActiveMode} /> : null}
          {hasDraft ? (
            <ArtifactModePanel
              key={props.draftKey}
              mode={activeMode}
              draftText={props.draftText}
              storySlug={props.storySlug}
              chapterId={props.chapterId}
              readiness={props.readiness}
              continuityQueued={props.continuityQueued}
              gate={gate}
              onQueueContinuity={props.onQueueContinuity}
              onSaveDraft={props.onSaveDraft}
            />
          ) : (
            <EmptyArtifact hasChapter={props.hasChapter} onOpenAutoWrite={props.onOpenAutoWrite} />
          )}
        </div>
      ) : (
        <ArtifactInspectorRail readiness={props.readiness} continuityQueued={props.continuityQueued} diagnostics={inspectorDiagnostics} />
      )}
    </section>
  );
}
