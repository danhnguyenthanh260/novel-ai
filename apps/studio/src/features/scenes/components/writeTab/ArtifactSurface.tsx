import { useMemo, useState } from "react";
import ArtifactInspectorRail from "@/features/scenes/components/writeTab/ArtifactInspectorRail";
import type { ArtifactKind, ContextReadiness } from "@/features/scenes/components/writeTab/types";

type ArtifactSurfaceProps = {
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

function artifactKindLabel(kind: ArtifactKind): string {
  if (kind === "document") return "Document Artifact";
  if (kind === "analysis") return "Analysis Artifact";
  if (kind === "review") return "Review Artifact";
  if (kind === "memory") return "Memory Candidates";
  if (kind === "publish_preview") return "Publish Preview";
  return "Operations Artifact";
}

function ArtifactHeader({
  chapterTitle,
  hasDraft,
  continuityQueued,
  onQueueContinuity,
}: {
  chapterTitle: string;
  hasDraft: boolean;
  continuityQueued: boolean;
  onQueueContinuity: () => void;
}) {
  return (
    <header className="artifact-header">
      <div>
        <div className="artifact-kicker">{artifactKindLabel("document")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <h2>{chapterTitle}</h2>
          <span className="status-pill status-pill--drafting">{hasDraft ? "Draft" : "No Draft"}</span>
        </div>
        <div className="muted mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span>rev_003</span>
          <span>{hasDraft ? "Saved 18s ago" : "Waiting for artifact"}</span>
        </div>
      </div>
      <div className="artifact-actions">
        <button type="button" className="primary-action px-3 py-2 text-xs" onClick={onQueueContinuity}>
          {continuityQueued ? "Continuity running" : "Run continuity check"}
        </button>
        <button type="button" className="locked-action px-3 py-2 text-xs" disabled title="Requires continuity validation">
          Approve revision
        </button>
      </div>
    </header>
  );
}

function ArtifactTabs() {
  return (
    <div className="artifact-tabs" role="tablist" aria-label="Artifact modes">
      {["Read", "Edit", "Analyze", "Review", "Approve"].map((tab) => (
        <button key={tab} type="button" className={tab === "Edit" ? "shell-link shell-link--active px-3 py-1 text-xs" : "shell-link px-3 py-1 text-xs"}>
          {tab}
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
        <button type="button" className="shell-link px-4 py-2 text-sm">
          Run readiness check
        </button>
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

export default function ArtifactSurface(props: ArtifactSurfaceProps) {
  const hasDraft = props.draftText.trim().length > 0;

  return (
    <section className="artifact-workspace" aria-label="Active artifact workspace">
      {props.isVisible ? (
        <div className="artifact-main">
          <ArtifactHeader
            chapterTitle={props.chapterTitle}
            hasDraft={hasDraft}
            continuityQueued={props.continuityQueued}
            onQueueContinuity={props.onQueueContinuity}
          />
          {hasDraft ? <ArtifactTabs /> : null}
          {hasDraft ? (
            <DocumentArtifact key={props.draftKey} initialText={props.draftText} onSaveDraft={props.onSaveDraft} />
          ) : (
            <EmptyArtifact hasChapter={props.hasChapter} onOpenAutoWrite={props.onOpenAutoWrite} />
          )}
        </div>
      ) : (
        <ArtifactInspectorRail readiness={props.readiness} continuityQueued={props.continuityQueued} />
      )}
    </section>
  );
}
