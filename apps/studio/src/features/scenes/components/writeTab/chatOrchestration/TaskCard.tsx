import type { CommandId, CommandTaskCard } from "@/features/scenes/components/writeTab/types";

type TaskCardProps = {
  task: CommandTaskCard;
  onRunCommand: (command: CommandId) => void;
};

function statusLabel(status: CommandTaskCard["status"]): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "blocked") return "Blocked";
  return "Ready";
}

export default function TaskCard({ task, onRunCommand }: TaskCardProps) {
  return (
    <article className={`work-task-card work-task-card--${task.status}`}>
      <div className="work-task-card__meta">
        <span className="font-mono text-xs">{task.command}</span>
        <span>{statusLabel(task.status)}</span>
      </div>
      <div className="work-task-card__title">{task.title}</div>
      <p>{task.detail}</p>
      {task.cta && task.ctaCommand ? (
        <button type="button" onClick={() => task.ctaCommand && onRunCommand(task.ctaCommand)}>
          {task.cta}
        </button>
      ) : null}
    </article>
  );
}
