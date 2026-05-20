import Link from "next/link";
import { useMemo, useState } from "react";
import ArtifactInspectorRail, { type ArtifactInspectorDiagnostics } from "@/features/scenes/components/writeTab/ArtifactInspectorRail";
import type { AnalysisSnapshot, ContextReadiness, MemorySnapshot, WriteInspectorMode } from "@/features/scenes/components/writeTab/types";

type ArtifactMode = "read" | "edit" | "analysis" | "review" | "approve";

type ArtifactSurfaceProps = {
  storySlug: string;
  chapterId: string;
  chapterTitle: string;
  currentVersionNo: number | null;
  currentVersionKind: string | null;
  draftKey: string;
  draftText: string;
  hasChapter: boolean;
  readiness: ContextReadiness;
  continuityQueued: boolean;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
  onSaveDraft: (text: string) => Promise<void>;
  isVisible: boolean;
  inspectorMode: WriteInspectorMode;
  analysisSnapshot: AnalysisSnapshot | null;
  memorySnapshot: MemorySnapshot | null;
  onInspectorModeChange: (mode: WriteInspectorMode) => void;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
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

function searchMatchCount(text: string, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  return text.toLowerCase().split(needle).length - 1;
}

function highlightSearch(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const index = lowerText.indexOf(lowerNeedle);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

function buildInspectorDiagnostics(args: {
  activeMode: ArtifactMode;
  chapterId: string;
  chapterTitle: string;
  currentVersionNo: number | null;
  currentVersionKind: string | null;
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
    currentVersionNo: args.currentVersionNo,
    currentVersionKind: args.currentVersionKind,
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
  collapsed,
  searchQuery,
  searchMatches,
  onQueueContinuity,
  onCollapsedChange,
  onSearchQueryChange,
  onCloseDrawer,
}: {
  chapterTitle: string;
  hasDraft: boolean;
  continuityQueued: boolean;
  activeMode: ArtifactMode;
  gate: ApprovalGate;
  collapsed: boolean;
  searchQuery: string;
  searchMatches: number;
  onQueueContinuity: () => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onCloseDrawer: () => void;
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
        <label className="artifact-search">
          <span>Find</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search artifact"
            aria-label="Search artifact text"
          />
          <small>{searchQuery.trim() ? `${searchMatches} matches` : "No query"}</small>
        </label>
        <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => onCollapsedChange(!collapsed)}>
          {collapsed ? "Expand" : "Collapse"}
        </button>
        <button type="button" className="artifact-drawer-close shell-link px-3 py-2 text-xs" onClick={onCloseDrawer}>
          Close
        </button>
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

function ReadArtifact({ paragraphs, searchQuery }: { paragraphs: string[]; searchQuery: string }) {
  return (
    <div className="document-artifact p-4">
      <div className="grid gap-4">
        {paragraphs.slice(0, 8).map((paragraph, index) => (
          <p key={`${paragraph.slice(0, 16)}-${index}`} className="text-sm leading-7 text-[var(--text-primary)]">
            {highlightSearch(paragraph, searchQuery)}
          </p>
        ))}
      </div>
    </div>
  );
}

function DocumentArtifact({ initialText, searchQuery, onSaveDraft }: { initialText: string; searchQuery: string; onSaveDraft: (text: string) => Promise<void> }) {
  const [draftText, setDraftText] = useState(initialText);
  const paragraphs = useMemo(() => draftText.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean), [draftText]);

  return (
    <div className="document-artifact">
      <textarea className="document-editor" value={draftText} onChange={(event) => setDraftText(event.target.value)} aria-label="Editable chapter draft artifact" />
      <div className="document-preview" aria-hidden>
        {paragraphs.slice(0, 6).map((paragraph, index) => (
          <div key={`${paragraph.slice(0, 16)}-${index}`} className={`document-block ${index === 1 ? "document-block--selected" : ""}`}>
            <span className="document-handle">::</span>
            <p>{highlightSearch(paragraph, searchQuery)}</p>
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
          Open full reviews workspace
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
  hasReadableArtifact,
}: {
  gate: ApprovalGate;
  storySlug: string;
  chapterId: string;
  hasReadableArtifact: boolean;
}) {
  const readerHref = hasReadableArtifact ? `/read/${encodeURIComponent(storySlug)}/${encodeURIComponent(chapterId)}` : null;

  return (
    <div className="document-artifact p-4">
      <div className="grid gap-3 text-sm">
        <div className="font-semibold">{gate.label}</div>
        <p className="muted text-xs">{gate.detail}</p>
        <button type="button" className="locked-action w-fit px-3 py-2 text-xs" disabled title="Approval is handled through the review workspace until durable approval state is connected.">
          {gate.canApprove ? "Ready for review" : "Approval locked"}
        </button>
        <Link href={`/stories/${encodeURIComponent(storySlug)}/reviews`} className="shell-link w-fit px-3 py-2 text-xs">
          Open full reviews workspace
        </Link>
        {readerHref ? (
          <Link href={readerHref} className="shell-link w-fit px-3 py-2 text-xs">
            Reader preview
          </Link>
        ) : (
          <button type="button" className="shell-link w-fit px-3 py-2 text-xs" disabled title="Create a readable chapter draft before opening reader preview.">
            Reader preview unavailable
          </button>
        )}
        <button type="button" className="locked-action w-fit px-3 py-2 text-xs" disabled title="Publish preparation needs a durable approval and publishing workflow before it can be enabled.">
          Publish unavailable
        </button>
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
  searchQuery,
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
  searchQuery: string;
}) {
  const paragraphs = useMemo(() => draftText.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean), [draftText]);

  if (mode === "read") return <ReadArtifact paragraphs={paragraphs} searchQuery={searchQuery} />;
  if (mode === "analysis") return <AnalysisArtifact readiness={readiness} continuityQueued={continuityQueued} onQueueContinuity={onQueueContinuity} />;
  if (mode === "review") return <ReviewArtifact storySlug={storySlug} chapterId={chapterId} />;
  if (mode === "approve") {
    return (
      <ApproveArtifact
        gate={gate}
        storySlug={storySlug}
        chapterId={chapterId}
        hasReadableArtifact={draftText.trim().length > 0 && Boolean(chapterId)}
      />
    );
  }
  return <DocumentArtifact initialText={draftText} searchQuery={searchQuery} onSaveDraft={onSaveDraft} />;
}

export default function ArtifactSurface(props: ArtifactSurfaceProps) {
  const [activeMode, setActiveMode] = useState<ArtifactMode>("edit");
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const hasDraft = props.draftText.trim().length > 0;
  const matches = useMemo(() => searchMatchCount(props.draftText, searchQuery), [props.draftText, searchQuery]);
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
    currentVersionNo: props.currentVersionNo,
    currentVersionKind: props.currentVersionKind,
    draftText: props.draftText,
    gate,
    hasChapter: props.hasChapter,
    hasDraft,
  });

  return (
    <section className={`artifact-workspace ${props.drawerOpen ? "artifact-workspace--drawer-open" : ""}`} aria-label="Active artifact workspace" data-drawer-open={props.drawerOpen}>
      {props.isVisible ? (
        <div className="artifact-main">
          <ArtifactHeader
            chapterTitle={props.chapterTitle}
            hasDraft={hasDraft}
            continuityQueued={props.continuityQueued}
            activeMode={activeMode}
            gate={gate}
            collapsed={collapsed}
            searchQuery={searchQuery}
            searchMatches={matches}
            onQueueContinuity={props.onQueueContinuity}
            onCollapsedChange={setCollapsed}
            onSearchQueryChange={setSearchQuery}
            onCloseDrawer={() => props.onDrawerOpenChange(false)}
          />
          {collapsed ? (
            <div className="artifact-collapsed">
              <strong>{props.chapterTitle}</strong>
              <span>{hasDraft ? `${wordCount(props.draftText).toLocaleString()} words` : "No draft artifact"}</span>
              <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => setCollapsed(false)}>
                Expand
              </button>
            </div>
          ) : null}
          {!collapsed && hasDraft ? <ArtifactTabs activeMode={activeMode} onActiveModeChange={setActiveMode} /> : null}
          {!collapsed && hasDraft ? (
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
              searchQuery={searchQuery}
            />
          ) : !collapsed ? (
            <EmptyArtifact hasChapter={props.hasChapter} onOpenAutoWrite={props.onOpenAutoWrite} />
          ) : null}
        </div>
      ) : (
        <ArtifactInspectorRail
          readiness={props.readiness}
          continuityQueued={props.continuityQueued}
          diagnostics={inspectorDiagnostics}
          mode={props.inspectorMode}
          analysisSnapshot={props.analysisSnapshot}
          memorySnapshot={props.memorySnapshot}
          onModeChange={props.onInspectorModeChange}
        />
      )}
    </section>
  );
}
