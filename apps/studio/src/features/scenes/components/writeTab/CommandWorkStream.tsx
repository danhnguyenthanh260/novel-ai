import React from "react";
import { useRouter } from "next/navigation";
import type { CommandId, CommandTaskCard } from "@/features/scenes/components/writeTab/types";

type CommandWorkStreamProps = {
  storySlug: string;
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
  visible: boolean;
};

type CommandMenuItem = CommandOption | { id: "More"; description: "" };

type CommandResult = {
  tone: "ready" | "blocked" | "running";
  title: string;
  detail: string;
};

type CommandRunnerArgs = {
  storySlug: string;
  chapterId: string;
  onOpenAutoWrite: () => void;
  onQueueContinuity: () => void;
};

type CommandGroup = "primary" | "more" | "hidden";

type CommandDefinition = CommandOption & {
  group: CommandGroup;
  unavailableDetail?: string;
};

const commandDefinitions: CommandDefinition[] = [
  { id: "/write chapter", description: "Create or continue the active chapter draft", group: "primary", visible: true },
  { id: "/analyze chapter", description: "Open chapter analysis and memory diagnostics", group: "primary", visible: true },
  { id: "/check continuity", description: "Queue canon, timeline, and reveal validation", group: "primary", visible: true },
  { id: "/extract memory", description: "Open story memory extraction and conflict review", group: "more", visible: true },
  { id: "/review chapter", description: "Open review checklist and scoring", group: "more", visible: true },
  {
    id: "/rewrite selection",
    description: "Rewrite selected prose in the active artifact",
    group: "hidden",
    visible: false,
    unavailableDetail: "Selection-backed rewriting is not wired in the Novel Lab artifact surface yet.",
  },
  {
    id: "/continue from cursor",
    description: "Continue from the document cursor",
    group: "hidden",
    visible: false,
    unavailableDetail: "Cursor-backed continuation is not wired in the Novel Lab artifact surface yet.",
  },
  {
    id: "/approve draft",
    description: "Approve the active draft",
    group: "hidden",
    visible: false,
    unavailableDetail: "Approval gates are not connected to durable review state from the command surface yet.",
  },
  {
    id: "/publish preview",
    description: "Preview approved reader-facing output",
    group: "hidden",
    visible: false,
    unavailableDetail: "Publish preview remains owned by the artifact approval surface until publish workflow state is durable.",
  },
];

const primaryCommands = commandDefinitions.filter((command) => command.visible && command.group === "primary");
const moreCommands = commandDefinitions.filter((command) => command.visible && command.group === "more");

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
          <span>{isMoreOpen ? "Less" : "More"}</span>
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
  return [
    {
      id: "draft",
      command: "/write chapter",
      title: hasDraft ? "Draft artifact is open" : "No draft artifact yet",
      status: chapterId ? "completed" : "blocked",
      detail: chapterId
        ? "Novel Lab will keep generated prose out of the command stream. The editable artifact lives on the right."
        : "Choose or create a chapter, then run a writing command.",
      cta: hasDraft ? "Review artifact" : "Create draft",
      ctaCommand: "/write chapter",
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
      ctaCommand: "/check continuity",
    },
  ];
}

function getMaxCommandIndex(isMoreOpen: boolean): number {
  return isMoreOpen ? primaryCommands.length + moreCommands.length : primaryCommands.length;
}

function commandFromValue(value: string): CommandId | null {
  const normalized = value.trimStart();
  return commandDefinitions.find((command) => normalized.startsWith(command.id))?.id ?? null;
}

function commandDefinition(command: CommandId): CommandDefinition | null {
  return commandDefinitions.find((item) => item.id === command) ?? null;
}

function commandLabel(command: CommandId): string {
  if (command === "/write chapter") return "Write chapter";
  if (command === "/analyze chapter") return "Analyze chapter";
  if (command === "/rewrite selection") return "Rewrite selection";
  if (command === "/continue from cursor") return "Continue from cursor";
  if (command === "/check continuity") return "Check continuity";
  if (command === "/extract memory") return "Extract memory";
  if (command === "/review chapter") return "Review chapter";
  if (command === "/approve draft") return "Approve draft";
  if (command === "/publish preview") return "Publish preview";
  return command;
}

function commandUnavailable(command: CommandId, detail: string): CommandResult {
  return {
    tone: "blocked",
    title: `${commandLabel(command)} unavailable`,
    detail,
  };
}

function useCommandRunner(args: CommandRunnerArgs) {
  const router = useRouter();
  const [commandResult, setCommandResult] = React.useState<CommandResult | null>(null);

  const runCommand = React.useCallback(
    (command: CommandId) => {
      const definition = commandDefinition(command);
      if (definition?.visible === false) {
        setCommandResult(commandUnavailable(command, definition.unavailableDetail ?? "This command is not available from the current workspace."));
        return;
      }

      const storyBase = `/stories/${encodeURIComponent(args.storySlug)}`;
      if (command === "/write chapter") {
        if (!args.chapterId) {
          setCommandResult(commandUnavailable(command, "Choose or create a chapter before opening AutoWrite."));
          return;
        }
        args.onOpenAutoWrite();
        setCommandResult({
          tone: "running",
          title: "AutoWrite opened",
          detail: `Chapter ${args.chapterId} is ready for a writing run.`,
        });
        return;
      }

      if (command === "/check continuity") {
        if (!args.chapterId) {
          setCommandResult(commandUnavailable(command, "Choose or create a chapter before checking continuity."));
          return;
        }
        args.onQueueContinuity();
        setCommandResult({
          tone: "running",
          title: "Continuity check queued",
          detail: "Canon, timeline, and reveal constraints are now marked for validation in the artifact workspace.",
        });
        return;
      }

      if (command === "/analyze chapter") {
        router.push(`${storyBase}/analysis`);
        setCommandResult({
          tone: "ready",
          title: "Opening analysis",
          detail: "The analysis workspace owns chapter, arc, saga, and core lore diagnostics.",
        });
        return;
      }

      if (command === "/extract memory") {
        router.push(`${storyBase}/memory`);
        setCommandResult({
          tone: "ready",
          title: "Opening memory hub",
          detail: "Memory extraction and conflict review continue in the story memory workspace.",
        });
        return;
      }

      if (command === "/review chapter") {
        router.push(`${storyBase}/reviews`);
        setCommandResult({
          tone: "ready",
          title: "Opening reviews",
          detail: "Chapter review requests, scoring, and responses live in the review workspace.",
        });
        return;
      }

      setCommandResult(commandUnavailable(command, "This command is not wired to a safe workflow action yet."));
    },
    [args, router]
  );

  return { commandResult, runCommand, setCommandResult };
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

function TaskCard({ task, onRunCommand }: { task: CommandTaskCard; onRunCommand: (command: CommandId) => void }) {
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

export default function CommandWorkStream(props: CommandWorkStreamProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isMoreOpen, setIsMoreOpen] = React.useState(false);
  const { commandResult, runCommand, setCommandResult } = useCommandRunner({
    storySlug: props.storySlug,
    chapterId: props.chapterId,
    onOpenAutoWrite: props.onOpenAutoWrite,
    onQueueContinuity: props.onQueueContinuity,
  });
  
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
            <TaskCard key={task.id} task={task} onRunCommand={runCommand} />
          ))}
        </div>

        {commandResult ? (
          <div className={`work-message mt-4 work-message--${commandResult.tone === "blocked" ? "user" : "assistant"}`}>
            <div className="work-message__label">{commandResult.tone === "blocked" ? "Blocked" : "Novel Lab"}</div>
            <div className="text-sm font-semibold">{commandResult.title}</div>
            <div className="muted mt-1 text-xs">{commandResult.detail}</div>
          </div>
        ) : null}
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
            const command = commandFromValue(props.composerValue);
            if (!command) {
              setCommandResult({
                tone: "blocked",
                title: "Unknown command",
                detail: "Choose a command from the slash menu before submitting.",
              });
              return;
            }
            runCommand(command);
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
            className="primary-action px-3 py-2 text-xs"
            title="Run Command"
          >
            Run
          </button>
        </form>
      </div>
    </section>
  );
}
