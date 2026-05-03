import type { CommandId, CommandTaskCard } from "@/features/scenes/components/writeTab/types";

type CommandWorkStreamProps = {
  chapterId: string;
  hasDraft: boolean;
  continuityQueued: boolean;
  composerValue: string;
  commandMenuOpen: boolean;
  onComposerValueChange: (value: string) => void;
  onCommandMenuOpenChange: (value: boolean) => void;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
};

const primaryCommands: Array<{ id: CommandId; description: string }> = [
  { id: "/write chapter", description: "Create or continue the active chapter draft" },
  { id: "/analyze chapter", description: "Inspect continuity, context, and risks" },
  { id: "/rewrite selection", description: "Rewrite selected prose in the active artifact" },
  { id: "/continue from cursor", description: "Continue from the document cursor" },
  { id: "/check continuity", description: "Find canon, timeline, and reveal issues" },
];

const moreCommands: Array<{ id: CommandId; description: string }> = [
  { id: "/extract memory", description: "Preview draft-only memory candidates" },
  { id: "/review chapter", description: "Open review checklist and scoring" },
  { id: "/approve draft", description: "Locked until validation passes" },
  { id: "/publish preview", description: "Preview approved reader-facing output" },
];

function statusLabel(status: CommandTaskCard["status"]): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "blocked") return "Blocked";
  return "Ready";
}

function SlashCommandMenu({ onSelect }: { onSelect: (command: string) => void }) {
  return (
    <div className="slash-menu" role="menu" aria-label="Slash commands">
      <div className="slash-menu__section">Primary commands</div>
      {primaryCommands.map((command) => (
        <button key={command.id} type="button" className="slash-menu-row" onClick={() => onSelect(command.id)}>
          <span className="font-mono text-xs">{command.id}</span>
          <span className="muted text-xs">{command.description}</span>
        </button>
      ))}
      <details className="slash-menu-more">
        <summary>More</summary>
        <div className="mt-1 space-y-1">
          {moreCommands.map((command) => (
            <button key={command.id} type="button" className="slash-menu-row slash-menu-row--muted" onClick={() => onSelect(command.id)}>
              <span className="font-mono text-xs">{command.id}</span>
              <span className="muted text-xs">{command.description}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function TaskCard({ task }: { task: CommandTaskCard }) {
  return (
    <article className={`work-task-card work-task-card--${task.status}`}>
      <div className="work-task-card__meta">
        <span className="font-mono text-xs">{task.command}</span>
        <span>{statusLabel(task.status)}</span>
      </div>
      <div className="work-task-card__title">{task.title}</div>
      <p>{task.detail}</p>
      {task.cta ? <button type="button">{task.cta}</button> : null}
    </article>
  );
}

export default function CommandWorkStream(props: CommandWorkStreamProps) {
  const showSlashMenu = props.commandMenuOpen || props.composerValue.trimStart().startsWith("/");
  const chapterCommand = props.chapterId ? `/write chapter ${props.chapterId}` : "/write chapter";
  const tasks: CommandTaskCard[] = [
    {
      id: "draft",
      command: chapterCommand,
      title: props.hasDraft ? "Draft artifact is open" : "No draft artifact yet",
      status: props.chapterId ? "completed" : "blocked",
      detail: props.chapterId
        ? "Novel Lab will keep generated prose out of the command stream. The editable artifact lives on the right."
        : "Choose or create a chapter, then run a writing command.",
      cta: props.hasDraft ? "Review artifact" : "Create draft",
    },
    {
      id: "continuity",
      command: "/check continuity",
      title: props.continuityQueued ? "Continuity check queued" : "Continuity validation is waiting",
      status: props.continuityQueued ? "running" : "idle",
      detail: props.continuityQueued
        ? "Checking canon, timeline anchors, and forbidden reveal constraints."
        : "Run validation after the document edit pass. Approval remains locked until this completes.",
      cta: props.continuityQueued ? "Open progress" : "Run check",
    },
  ];

  return (
    <section className="work-stream" aria-label="Command work stream">
      <div className="work-stream__scroll">
        <div className="work-stream__intro">
          <div className="work-stream__eyebrow">Current work</div>
          <h1>Write and validate this chapter</h1>
          <p>Give Novel Lab a command, then review the resulting artifact on the right.</p>
        </div>

        <div className="work-message work-message--user">
          <div className="work-message__label">You</div>
          <div className="font-mono text-sm">{chapterCommand} with slow tension and no full reveal</div>
        </div>

        <div className="work-task-list">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </div>

      <div className="work-composer-wrap">
        {showSlashMenu ? (
          <SlashCommandMenu
            onSelect={(command) => {
              props.onComposerValueChange(`${command} `);
              props.onCommandMenuOpenChange(false);
            }}
          />
        ) : null}
        <form
          className="work-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (props.composerValue.includes("/check continuity")) props.onQueueContinuity();
            if (props.composerValue.includes("/write chapter")) props.onOpenAutoWrite();
          }}
        >
          <button
            type="button"
            className="work-composer__menu"
            aria-label="Open command menu"
            onClick={() => props.onCommandMenuOpenChange(!props.commandMenuOpen)}
          >
            /
          </button>
          <input
            value={props.composerValue}
            onChange={(event) => props.onComposerValueChange(event.target.value)}
            placeholder="Ask Novel Lab to write, analyze, revise..."
            aria-label="Novel Lab command composer"
          />
          <button type="submit" className="primary-action px-4 py-2 text-sm">
            Run
          </button>
        </form>
      </div>
    </section>
  );
}
