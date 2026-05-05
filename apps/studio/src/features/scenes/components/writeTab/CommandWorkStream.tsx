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

type CommandOption = {
  id: CommandId;
  description: string;
};

type CommandMenuItem = CommandOption | { id: "More"; description: "" };

const primaryCommands: CommandOption[] = [
  { id: "/write chapter", description: "Create or continue the active chapter draft" },
  { id: "/analyze chapter", description: "Inspect continuity, context, and risks" },
  { id: "/rewrite selection", description: "Rewrite selected prose in the active artifact" },
  { id: "/continue from cursor", description: "Continue from the document cursor" },
  { id: "/check continuity", description: "Find canon, timeline, and reveal issues" },
];

const moreCommands: CommandOption[] = [
  { id: "/extract memory", description: "Preview draft-only memory candidates" },
  { id: "/review chapter", description: "Open review checklist and scoring" },
  { id: "/approve draft", description: "Locked until validation passes" },
  { id: "/publish preview", description: "Preview approved reader-facing output" },
];

const moreMenuItem: CommandMenuItem = { id: "More", description: "" };
const allAvailableCommands: CommandMenuItem[] = [...primaryCommands, moreMenuItem, ...moreCommands];

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

function buildTasks({ chapterId, hasDraft, continuityQueued }: Pick<CommandWorkStreamProps, "chapterId" | "hasDraft" | "continuityQueued">): CommandTaskCard[] {
  const chapterCommand = chapterId ? `/write chapter ${chapterId}` : "/write chapter";

  return [
    {
      id: "draft",
      command: chapterCommand,
      title: hasDraft ? "Draft artifact is open" : "No draft artifact yet",
      status: chapterId ? "completed" : "blocked",
      detail: chapterId
        ? "Novel Lab will keep generated prose out of the command stream. The editable artifact lives on the right."
        : "Choose or create a chapter, then run a writing command.",
      cta: hasDraft ? "Review artifact" : "Create draft",
    },
    {
      id: "continuity",
      command: "/check continuity",
      title: continuityQueued ? "Continuity check queued" : "Continuity validation is waiting",
      status: continuityQueued ? "running" : "idle",
      detail: continuityQueued
        ? "Checking canon, timeline anchors, and forbidden reveal constraints."
        : "Run validation after the document edit pass. Approval remains locked until this completes.",
      cta: continuityQueued ? "Open progress" : "Run check",
    },
  ];
}

function getMaxCommandIndex(isMoreOpen: boolean): number {
  return isMoreOpen ? primaryCommands.length + moreCommands.length : primaryCommands.length;
}

function handleCommandSubmit(value: string, onQueueContinuity: () => void, onOpenAutoWrite: () => void) {
  if (value.includes("/check continuity")) onQueueContinuity();
  if (value.includes("/write chapter")) onOpenAutoWrite();
}

function handleSlashMenuKeyDown({
  event,
  showSlashMenu,
  activeIndex,
  maxIndex,
  onActiveIndexChange,
  onMoreOpenChange,
  onSelect,
  onClose,
}: {
  event: React.KeyboardEvent;
  showSlashMenu: boolean;
  activeIndex: number;
  maxIndex: number;
  onActiveIndexChange: (value: number) => void;
  onMoreOpenChange: (value: boolean) => void;
  onSelect: (command: string) => void;
  onClose: () => void;
}) {
  if (!showSlashMenu) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    const nextIndex = (activeIndex + 1) % (maxIndex + 1);
    onActiveIndexChange(nextIndex);
    if (nextIndex > primaryCommands.length) onMoreOpenChange(true);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    onActiveIndexChange(activeIndex === 0 ? maxIndex : activeIndex - 1);
    return;
  }
  if (event.key === "Enter" && activeIndex >= 0) {
    event.preventDefault();
    onSelect(allAvailableCommands[activeIndex].id);
    return;
  }
  if (event.key === "Escape") onClose();
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
  const maxIndex = getMaxCommandIndex(isMoreOpen);
  const tasks = buildTasks(props);

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
    handleSlashMenuKeyDown({
      event: e,
      showSlashMenu,
      activeIndex,
      maxIndex,
      onActiveIndexChange: setActiveIndex,
      onMoreOpenChange: setIsMoreOpen,
      onSelect: handleSelect,
      onClose: () => props.onCommandMenuOpenChange(false),
    });
  };

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
            handleCommandSubmit(props.composerValue, props.onQueueContinuity, props.onOpenAutoWrite);
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
