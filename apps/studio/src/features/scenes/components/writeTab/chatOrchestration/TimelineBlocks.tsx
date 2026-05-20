"use client";

import React from "react";
import ArtifactCard from "@/features/scenes/components/writeTab/artifacts/ArtifactCard";
import { choiceSelectionFromBlock } from "@/features/scenes/components/writeTab/chatOrchestration/choiceGroups";
import ReadinessBriefing from "@/features/scenes/components/writeTab/chatOrchestration/ReadinessBriefing";
import type { ArtifactCardAction, ArtifactStatus, ArtifactType, ChoiceGroupChoice, RecoveryChip, TimelineBlock, WorkflowStepStatus } from "@/features/scenes/components/writeTab/types";
import type { StructuredChoiceSelection } from "@/features/scenes/components/writeTab/chatOrchestration/choiceGroups";

type TimelineBlocksProps = {
  blocks: TimelineBlock[];
  onChip: (chip: RecoveryChip) => void;
  onChoice: (selection: StructuredChoiceSelection) => void;
  onOpenArtifact?: (block: Extract<TimelineBlock, { type: "artifact_preview" }>) => void;
  onArtifactAction?: (block: Extract<TimelineBlock, { type: "artifact_preview" }>, actionId: string) => void;
};

function workflowMarker(status: WorkflowStepStatus): string {
  if (status === "complete") return "✓";
  if (status === "active") return "↻";
  if (status === "failed") return "✗";
  return "○";
}

function copyMessageText(text: string, onCopied: () => void): void {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(text).then(onCopied).catch(() => undefined);
}

function TextBlock({ block }: { block: Extract<TimelineBlock, { type: "text_message" }> }) {
  const [copied, setCopied] = React.useState(false);
  const copyText = () => copyMessageText(block.text, () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1100);
  });
  return (
    <div className={`work-message work-message--${block.source} work-message--${block.tone ?? "ready"}`}>
      <div className="work-message__label">{block.label}</div>
      <div className="work-message__body">
        {block.pending ? (
          <span className="thinking-dots" aria-label="Thinking">
            <span />
            <span />
            <span />
          </span>
        ) : (
          block.text
        )}
      </div>
      {!block.pending ? (
        <div className="work-message__actions" aria-label="Message actions">
          <button type="button" onClick={copyText}>{copied ? "Copied" : "Copy"}</button>
          <button type="button" title={block.source === "user" ? "Message options" : "Assistant options"}>...</button>
        </div>
      ) : null}
    </div>
  );
}

function ChoiceChipsBlock({ block, onChip }: { block: Extract<TimelineBlock, { type: "inline_choice_chips" }>; onChip: (chip: RecoveryChip) => void }) {
  return (
    <div className="timeline-chip-row" aria-label="Suggested next actions">
      {block.chips.map((chip) => (
        <button key={`${chip.action}-${chip.label}`} type="button" onClick={() => onChip(chip)}>
          {chip.label}
        </button>
      ))}
    </div>
  );
}

function ChoiceGroup({
  block,
  onChoice,
}: {
  block: Extract<TimelineBlock, { type: "choice_group" }>;
  onChoice: (block: Extract<TimelineBlock, { type: "choice_group" }>, choice: ChoiceGroupChoice) => void;
}) {
  const selectedIds = block.choices.filter((choice) => choice.selected).map((choice) => choice.id);
  const hasSelection = selectedIds.length > 0;
  return (
    <article className="choice-group-card" aria-label={block.prompt}>
      <div className="choice-group-card__prompt">{block.prompt}</div>
      <div className={`choice-group-card__choices choice-group-card__choices--${block.selectionMode}`}>
        {block.choices.map((choice) => {
          const selected = Boolean(choice.selected);
          const disabled = Boolean(choice.disabled || (hasSelection && block.selectionMode === "single"));
          return (
            <button
              key={choice.id}
              type="button"
              className={`choice-option ${selected ? "choice-option--selected" : ""}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChoice(block, choice)}
            >
              <span className="choice-option__marker">{selected ? "✓" : block.selectionMode === "multiple" ? "□" : "○"}</span>
              <span>
                <strong>{choice.label}</strong>
                {choice.description ? <small>{choice.description}</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

export function WorkflowProgressBlockView({
  block,
  density = "compact",
}: {
  block: Extract<TimelineBlock, { type: "workflow_progress" }>;
  density?: "compact" | "detail";
}) {
  const progress = Math.max(8, Math.round((block.current_step / Math.max(block.total_steps, 1)) * 100));
  return (
    <article className={`timeline-card timeline-card--workflow timeline-card--${block.status}`}>
      <div className="timeline-card__header">
        <div>
          <div className="timeline-card__kicker">{block.workflow_name}</div>
          <h2>
            Step {block.current_step} of {block.total_steps} - {block.current_step_label}
          </h2>
        </div>
        <span className="status-pill status-pill--partial">{block.status.toUpperCase()}</span>
      </div>
      <div className="context-progress-container !m-0 !max-w-none">
        <div className="context-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      {density === "detail" ? (
        <div className="timeline-step-list">
          {block.steps.map((step) => (
            <div key={step.label} className={`timeline-step timeline-step--${step.status}`}>
              <span aria-hidden>{workflowMarker(step.status)}</span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {density === "detail" ? (
        <div className="timeline-card__actions">
          <button type="button">Open operations</button>
          <button type="button">Cancel</button>
        </div>
      ) : null}
      {block.action_links?.length ? (
        <div className="timeline-card__actions">
          {block.action_links.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ArtifactPreviewBlockView({
  block,
  density = "compact",
  onOpen,
  onAction,
}: {
  block: Extract<TimelineBlock, { type: "artifact_preview" }>;
  density?: "compact" | "detail";
  onOpen?: () => void;
  onAction?: (actionId: string) => void;
}) {
  const actions: ArtifactCardAction[] = [
    ...block.actions.map((action) => ({ id: action, label: action.replaceAll("_", " ") })),
    ...(block.action_links ?? []).map((link) => ({ id: link.href, label: link.label, href: link.href })),
  ];
  const meta =
    block.artifact_type === "draft"
      ? `AI draft · Not approved${block.word_count ? ` · ${block.word_count.toLocaleString()} words` : ""}`
      : block.beat_count
        ? `${block.beat_count} beats · ${block.status.replace("_", " ")}`
        : block.status.replace("_", " ");
  const description = block.description ?? block.preview_lines[0] ?? "Open the artifact surface for full content.";

  return (
    <article className="timeline-card timeline-card--artifact">
      <ArtifactCard
        type={timelineArtifactType(block.artifact_type)}
        status={timelineArtifactStatus(block.status)}
        title={block.title}
        wordCount={block.word_count}
        actions={actions}
        onOpen={onOpen}
        onAction={onAction}
      />
      <div className="timeline-card__meta">{meta}</div>
      <p className="timeline-card__description">{description}</p>
      {density === "detail" ? (
        <div className="timeline-preview-lines">
          {block.preview_lines.slice(0, 3).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function timelineArtifactType(type: Extract<TimelineBlock, { type: "artifact_preview" }>["artifact_type"]): ArtifactType {
  if (type === "analysis") return "analysis";
  if (type === "review") return "review";
  if (type === "memory") return "memory";
  if (type === "source" || type === "research") return "source";
  if (type === "progress") return "progress";
  return "generated";
}

function timelineArtifactStatus(status: Extract<TimelineBlock, { type: "artifact_preview" }>["status"]): ArtifactStatus {
  if (status === "needs_approval") return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "applied") return "applied";
  if (status === "failed" || status === "superseded") return "stale";
  return "draft";
}

function ApprovalGate({ block }: { block: Extract<TimelineBlock, { type: "approval_gate" }> }) {
  return (
    <article className="timeline-card timeline-card--approval">
      <div className="timeline-card__kicker">Approval required</div>
      <h2>{block.gate_type.replaceAll("_", " ")}</h2>
      <p>{block.description}</p>
      <div className="timeline-card__actions">
        {block.actions.map((action) => (
          <button key={action} type="button">
            {action.replaceAll("_", " ")}
          </button>
        ))}
      </div>
    </article>
  );
}

function FailureRecovery({ block }: { block: Extract<TimelineBlock, { type: "failure_recovery" }> }) {
  return (
    <article className="timeline-card timeline-card--failure">
      <div className="timeline-card__kicker">{block.workflow_name} stopped</div>
      <h2>{block.stopped_at_step}</h2>
      <p>{block.plain_reason}</p>
      {block.draft_preserved ? <div className="timeline-card__meta">Draft preserved</div> : null}
      <div className="timeline-card__actions">
        {block.actions.map((action) => (
          <button key={action} type="button">
            {action.replaceAll("_", " ")}
          </button>
        ))}
      </div>
    </article>
  );
}

export function ContextDigestBlockView({ block }: { block: Extract<TimelineBlock, { type: "context_digest" }> }) {
  return (
    <article className="timeline-card timeline-card--digest">
      <div className="timeline-card__kicker">Context digest</div>
      <h2>{block.title}</h2>
      <div className="context-digest-grid">
        <div>
          <strong>Included</strong>
          {(block.included.length ? block.included : ["Nothing included yet"]).map((item) => (
            <span key={item}>✓ {item}</span>
          ))}
        </div>
        <div>
          <strong>Missing</strong>
          {(block.missing.length ? block.missing : ["No missing context"]).map((item) => (
            <span key={item}>✗ {item}</span>
          ))}
        </div>
      </div>
      {block.conflicts.length ? <p>{block.conflicts.join("; ")}</p> : null}
      {block.action_links?.length ? (
        <div className="timeline-card__actions">
          {block.action_links.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function TimelineBlocks({ blocks, onChip, onChoice, onOpenArtifact, onArtifactAction }: TimelineBlocksProps) {
  return (
    <>
      {blocks.map((block) => {
        if (block.type === "text_message") return <TextBlock key={block.id} block={block} />;
        if (block.type === "readiness_card") return <ReadinessBriefing key={block.id} briefing={block.briefing} onChip={onChip} />;
        if (block.type === "inline_choice_chips") return <ChoiceChipsBlock key={block.id} block={block} onChip={onChip} />;
        if (block.type === "choice_group") return <ChoiceGroup key={block.id} block={block} onChoice={(choiceBlock, choice) => onChoice(choiceSelectionFromBlock(choiceBlock, choice))} />;
        if (block.type === "workflow_progress") return <WorkflowProgressBlockView key={block.id} block={block} />;
        if (block.type === "artifact_preview") return <ArtifactPreviewBlockView key={block.id} block={block} onOpen={onOpenArtifact ? () => onOpenArtifact(block) : undefined} onAction={onArtifactAction ? (actionId) => onArtifactAction(block, actionId) : undefined} />;
        if (block.type === "approval_gate") return <ApprovalGate key={block.id} block={block} />;
        if (block.type === "failure_recovery") return <FailureRecovery key={block.id} block={block} />;
        return <ContextDigestBlockView key={block.id} block={block} />;
      })}
    </>
  );
}
