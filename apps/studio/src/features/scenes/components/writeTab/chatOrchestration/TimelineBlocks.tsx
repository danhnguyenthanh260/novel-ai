import ReadinessBriefing from "@/features/scenes/components/writeTab/chatOrchestration/ReadinessBriefing";
import type { RecoveryChip, TimelineBlock, WorkflowStepStatus } from "@/features/scenes/components/writeTab/types";

type TimelineBlocksProps = {
  blocks: TimelineBlock[];
  onChip: (chip: RecoveryChip) => void;
};

function workflowMarker(status: WorkflowStepStatus): string {
  if (status === "complete") return "✓";
  if (status === "active") return "↻";
  if (status === "failed") return "✗";
  return "○";
}

function TextBlock({ block }: { block: Extract<TimelineBlock, { type: "text_message" }> }) {
  return (
    <div className={`work-message work-message--${block.source} work-message--${block.tone ?? "ready"}`}>
      <div className="work-message__label">{block.label}</div>
      <div className={block.source === "user" ? "font-mono text-xs" : "text-sm"}>{block.text}</div>
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

function WorkflowProgress({ block }: { block: Extract<TimelineBlock, { type: "workflow_progress" }> }) {
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
      <div className="timeline-step-list">
        {block.steps.map((step) => (
          <div key={step.label} className={`timeline-step timeline-step--${step.status}`}>
            <span aria-hidden>{workflowMarker(step.status)}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
      <div className="timeline-card__actions">
        <button type="button">Show details</button>
        <button type="button">Cancel</button>
      </div>
    </article>
  );
}

function ArtifactPreview({ block }: { block: Extract<TimelineBlock, { type: "artifact_preview" }> }) {
  const meta =
    block.artifact_type === "draft"
      ? `AI draft · Not approved${block.word_count ? ` · ${block.word_count.toLocaleString()} words` : ""}`
      : block.beat_count
        ? `${block.beat_count} beats · ${block.status.replace("_", " ")}`
        : block.status.replace("_", " ");

  return (
    <article className="timeline-card timeline-card--artifact">
      <div className="timeline-card__kicker">{block.artifact_type.toUpperCase()}</div>
      <h2>{block.title}</h2>
      <div className="timeline-card__meta">{meta}</div>
      <div className="timeline-preview-lines">
        {block.preview_lines.slice(0, 3).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
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

function ContextDigest({ block }: { block: Extract<TimelineBlock, { type: "context_digest" }> }) {
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
    </article>
  );
}

export default function TimelineBlocks({ blocks, onChip }: TimelineBlocksProps) {
  return (
    <>
      {blocks.map((block) => {
        if (block.type === "text_message") return <TextBlock key={block.id} block={block} />;
        if (block.type === "readiness_card") return <ReadinessBriefing key={block.id} briefing={block.briefing} onChip={onChip} />;
        if (block.type === "inline_choice_chips") return <ChoiceChipsBlock key={block.id} block={block} onChip={onChip} />;
        if (block.type === "workflow_progress") return <WorkflowProgress key={block.id} block={block} />;
        if (block.type === "artifact_preview") return <ArtifactPreview key={block.id} block={block} />;
        if (block.type === "approval_gate") return <ApprovalGate key={block.id} block={block} />;
        if (block.type === "failure_recovery") return <FailureRecovery key={block.id} block={block} />;
        return <ContextDigest key={block.id} block={block} />;
      })}
    </>
  );
}
