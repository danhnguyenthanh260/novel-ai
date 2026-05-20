import type { ArtifactCardAction, ArtifactStatus, ArtifactType } from "@/features/scenes/components/writeTab/types";

export type ArtifactCardProps = {
  type: ArtifactType;
  status: ArtifactStatus;
  title: string;
  wordCount?: number | null;
  actions: ArtifactCardAction[];
  onOpen?: () => void;
  onAction?: (actionId: string) => void;
};

function artifactTypeLabel(type: ArtifactType): string {
  if (type === "generated") return "Generated";
  return type.slice(0, 1).toUpperCase() + type.slice(1);
}

function artifactStatusLabel(status: ArtifactStatus): string {
  return status.replaceAll("_", " ");
}

export default function ArtifactCard({ type, status, title, wordCount, actions, onOpen, onAction }: ArtifactCardProps) {
  return (
    <article className="artifact-card" data-artifact-card data-artifact-type={type} data-artifact-status={status}>
      <div className="artifact-card__topline">
        <span className="artifact-card__type">{artifactTypeLabel(type)}</span>
        <span className={`artifact-card__status artifact-card__status--${status}`}>{artifactStatusLabel(status)}</span>
      </div>
      <h2>{title}</h2>
      {typeof wordCount === "number" ? <div className="artifact-card__meta">{wordCount.toLocaleString()} words</div> : null}
      <div className="artifact-card__actions">
        {onOpen ? (
          <button type="button" onClick={onOpen}>
            Open
          </button>
        ) : null}
        {actions.map((action) => action.href ? (
          <a key={action.id} href={action.href} aria-disabled={action.disabled}>
            {action.label}
          </a>
        ) : (
          <button key={action.id} type="button" disabled={action.disabled} onClick={() => onAction?.(action.id)}>
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}
