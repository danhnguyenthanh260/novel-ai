import React from "react";
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

function SlashCommandMenu({ 
  onSelect, 
  activeIndex, 
  isMoreOpen, 
  onToggleMore 
}: { 
  onSelect: (command: string) => void;
  activeIndex: number;
  isMoreOpen: boolean;
  onToggleMore: () => void;
}) {
  const allCommands = [...primaryCommands, { id: "More" as any, description: "" }, ...moreCommands];
  
  return (
    <div className="slash-menu" role="menu" aria-label="Slash commands">
      <div className="slash-menu__section">Primary commands</div>
      {primaryCommands.map((command, idx) => (
        <button 
          key={command.id} 
          type="button" 
          className={`slash-menu-row ${activeIndex === idx ? "slash-menu-row--active" : ""}`}
          onClick={() => onSelect(command.id)}
        >
          <span className="font-mono text-xs">{command.id}</span>
          <span className="muted text-xs">{command.description}</span>
        </button>
      ))}
      
      <div className={`slash-menu-more ${isMoreOpen ? "slash-menu-more--open" : ""}`}>
        <button 
          type="button"
          className={`w-full text-left px-2 py-1.5 text-xs text-secondary hover:text-primary transition-colors flex items-center gap-2 ${activeIndex === primaryCommands.length ? "bg-hover text-primary rounded" : ""}`}
          onClick={onToggleMore}
        >
          <span>{isMoreOpen ? "▾" : "▸"} More</span>
        </button>
        
        {isMoreOpen && (
          <div className="mt-1 space-y-1">
            {moreCommands.map((command, idx) => {
              const globalIdx = primaryCommands.length + 1 + idx;
              return (
                <button 
                  key={command.id} 
                  type="button" 
                  className={`slash-menu-row slash-menu-row--muted ${activeIndex === globalIdx ? "slash-menu-row--active" : ""}`}
                  onClick={() => onSelect(command.id)}
                >
                  <span className="font-mono text-xs">{command.id}</span>
                  <span className="muted text-xs">{command.description}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
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
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isMoreOpen, setIsMoreOpen] = React.useState(false);
  
  const showSlashMenu = props.commandMenuOpen || props.composerValue.trimStart().startsWith("/");
  const chapterCommand = props.chapterId ? `/write chapter ${props.chapterId}` : "/write chapter";
  
  const allAvailableCommands = [...primaryCommands, { id: "More", description: "" }, ...moreCommands];
  const maxIndex = isMoreOpen ? primaryCommands.length + moreCommands.length : primaryCommands.length;

  const handleSelect = (command: string) => {
    if (command === "More") {
      setIsMoreOpen(!isMoreOpen);
      return;
    }
    props.onComposerValueChange(`${command} `);
    props.onCommandMenuOpenChange(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSlashMenu) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (activeIndex + 1) % (maxIndex + 1);
      setActiveIndex(nextIndex);
      if (nextIndex > primaryCommands.length) setIsMoreOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const nextIndex = activeIndex === 0 ? maxIndex : activeIndex - 1;
      setActiveIndex(nextIndex);
      if (nextIndex <= primaryCommands.length && nextIndex > 0) {
        // keep current more state or close if moving back to top? 
        // User choice, but let's keep it simple.
      }
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const selected = allAvailableCommands[activeIndex];
      handleSelect(selected.id);
    } else if (e.key === "Escape") {
      props.onCommandMenuOpenChange(false);
    }
  };

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
          <h1 className="text-xl font-bold">Write and validate</h1>
          <p className="text-xs muted">Give Novel Lab a command, then review the resulting artifact on the right.</p>
        </div>

        {props.composerValue && (
          <div className="work-message work-message--user mb-4">
            <div className="work-message__label">You</div>
            <div className="font-mono text-xs">{props.composerValue}</div>
          </div>
        )}

        <div className="work-task-list">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </div>

      <div className="work-composer-wrap">
        {showSlashMenu ? (
          <SlashCommandMenu
            activeIndex={activeIndex}
            isMoreOpen={isMoreOpen}
            onToggleMore={() => setIsMoreOpen(!isMoreOpen)}
            onSelect={handleSelect}
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
            onKeyDown={handleKeyDown}
            placeholder="Ask Novel Lab to write, analyze, revise..."
            aria-label="Novel Lab command composer"
          />
          <button 
            type="submit" 
            className="primary-action p-2 rounded-full aspect-square flex items-center justify-center"
            title="Run Command"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              <path d="M5 3v4" />
              <path d="M19 17v4" />
              <path d="M3 5h4" />
              <path d="M17 19h4" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}
