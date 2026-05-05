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
  const allCommands = [...primaryCommands, ...moreCommands].map((command) => command.id);
  const normalized = value.trimStart();
  return allCommands.find((command) => normalized.startsWith(command)) ?? null;
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

      if (command === "/publish preview") {
        if (!args.chapterId) {
          setCommandResult(commandUnavailable(command, "Choose a chapter before opening the reader preview."));
          return;
        }
        router.push(`/read/${encodeURIComponent(args.storySlug)}/${encodeURIComponent(args.chapterId)}`);
        setCommandResult({
          tone: "ready",
          title: "Opening reader preview",
          detail: "Reader preview opens for the active chapter. Publish controls remain outside this command surface.",
        });
        return;
      }

      const detail =
        command === "/rewrite selection"
          ? "Selection-backed rewriting is not wired in the Novel Lab artifact surface yet."
          : command === "/continue from cursor"
            ? "Cursor-backed continuation is not wired in the Novel Lab artifact surface yet."
            : "Approval gates are not connected to durable review state yet.";
      setCommandResult(commandUnavailable(command, detail));
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
