import React from "react";
import type { CommandId, ComposerState } from "@/features/scenes/components/writeTab/types";

export type ChatCommandOption = {
  id: CommandId;
  description: string;
  group: "primary" | "more";
  status: "ready" | "blocked";
  blockedReason?: string;
};

type CommandFormDraft = {
  goal: string;
  mode: "plan_first" | "direct" | "research_first";
  wordTarget: number;
  target: "source" | "context" | "characters" | "memory";
  depth: "quick" | "deep";
};

type ChatComposerProps = {
  value: string;
  menuOpen: boolean;
  commands: ChatCommandOption[];
  onValueChange: (value: string) => void;
  onMenuOpenChange: (value: boolean) => void;
  onSubmitCommand: (command: CommandId, goal: string) => void;
  onSubmitMessage: (message: string) => void;
  mode: "chat" | "brainstorm";
};

const defaultDraft: CommandFormDraft = {
  goal: "",
  mode: "plan_first",
  wordTarget: 1500,
  target: "source",
  depth: "quick",
};

function commandLabel(command: CommandId): string {
  return command.replace("/", "");
}

function composerState(value: string, menuOpen: boolean, activeCommand: CommandId | null): ComposerState {
  if (activeCommand) return "command_form_active";
  if (menuOpen || value.trimStart().startsWith("/")) return "slash_command_menu";
  if (value.length > 0) return "typing";
  return "idle";
}

function statusClass(status: ChatCommandOption["status"]): string {
  return status === "ready" ? "status-pill status-pill--clean" : "status-pill status-pill--blocked";
}

function SlashCommandMenu({
  commands,
  filter,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  commands: ChatCommandOption[];
  filter: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (command: ChatCommandOption) => void;
}) {
  const normalizedFilter = filter.trimStart().replace(/^\/+/, "").toLowerCase();
  const filteredCommands = commands.filter((command) => command.id.toLowerCase().includes(normalizedFilter));

  return (
    <div className="slash-menu" role="menu" aria-label="Slash commands">
      <div className="slash-menu__section">Commands</div>
      {filteredCommands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          className={`slash-menu-row ${activeIndex === index ? "slash-menu-row--active" : ""}`}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(command)}
        >
          <span className="font-mono text-xs">{command.id}</span>
          <span className="slash-menu-row__detail">
            <span>{command.description}</span>
            <span className={statusClass(command.status)}>{command.status.toUpperCase()}</span>
          </span>
        </button>
      ))}
      {filteredCommands.length === 0 ? <div className="slash-menu__empty">No command matches this input.</div> : null}
    </div>
  );
}

function CommandForm({
  command,
  draft,
  onDraftChange,
  onCancel,
  onSubmit,
}: {
  command: CommandId;
  draft: CommandFormDraft;
  onDraftChange: (draft: CommandFormDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const isGoalCommand = command === "/write chapter" || command === "/plan" || command === "/research";
  const isAnalyze = command === "/analyze chapter" || command === "/extract memory";

  return (
    <form
      className="command-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="command-form__header">
        <span className="font-mono text-xs">{command}</span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {isGoalCommand ? (
        <>
          <label>
            <span>Goal</span>
            <input value={draft.goal} onChange={(event) => onDraftChange({ ...draft, goal: event.target.value })} placeholder="What should this chapter accomplish?" />
          </label>
          {command === "/write chapter" ? (
            <div className="command-form__grid">
              <label>
                <span>Mode</span>
                <select value={draft.mode} onChange={(event) => onDraftChange({ ...draft, mode: event.target.value as CommandFormDraft["mode"] })}>
                  <option value="plan_first">Plan first</option>
                  <option value="direct">Direct</option>
                  <option value="research_first">Research first</option>
                </select>
              </label>
              <label>
                <span>Word target</span>
                <input type="number" min={300} max={10000} step={100} value={draft.wordTarget} onChange={(event) => onDraftChange({ ...draft, wordTarget: Number(event.target.value) })} />
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {isAnalyze ? (
        <div className="command-form__grid">
          <label>
            <span>Target</span>
            <select value={draft.target} onChange={(event) => onDraftChange({ ...draft, target: event.target.value as CommandFormDraft["target"] })}>
              <option value="source">Source</option>
              <option value="context">Context</option>
              <option value="characters">Characters</option>
              <option value="memory">Memory</option>
            </select>
          </label>
          <label>
            <span>Depth</span>
            <select value={draft.depth} onChange={(event) => onDraftChange({ ...draft, depth: event.target.value as CommandFormDraft["depth"] })}>
              <option value="quick">Quick</option>
              <option value="deep">Deep</option>
            </select>
          </label>
        </div>
      ) : null}

      {!isGoalCommand && !isAnalyze ? <p>Run preflight for {commandLabel(command)} using the current story and chapter context.</p> : null}

      <div className="command-form__actions">
        <button type="submit" className="primary-action px-3 py-2 text-xs">
          Run preflight
        </button>
      </div>
    </form>
  );
}

export default function ChatComposer({ value, menuOpen, commands, onValueChange, onMenuOpenChange, onSubmitCommand, onSubmitMessage, mode }: ChatComposerProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [activeCommand, setActiveCommand] = React.useState<CommandId | null>(null);
  const [draft, setDraft] = React.useState<CommandFormDraft>(defaultDraft);
  const state = composerState(value, menuOpen, activeCommand);
  const filteredCommands = commands.filter((command) => command.id.toLowerCase().includes(value.trimStart().replace(/^\/+/, "").toLowerCase()));

  React.useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  const selectCommand = (command: ChatCommandOption) => {
    onValueChange(`${command.id} `);
    onMenuOpenChange(false);
    if (command.status === "blocked") {
      onSubmitCommand(command.id, "");
      setActiveCommand(null);
      return;
    }
    setDraft(defaultDraft);
    setActiveCommand(command.id);
  };

  const submitActiveCommand = (command: CommandId, goal: string) => {
    onValueChange(goal ? `${command} ${goal}` : `${command} `);
    onSubmitCommand(command, goal);
    setActiveCommand(null);
  };

  return (
    <div className="work-composer-wrap" data-composer-state={state}>
      {state === "slash_command_menu" ? (
        <SlashCommandMenu commands={commands} filter={value} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} onSelect={selectCommand} />
      ) : null}

      {state === "command_form_active" && activeCommand ? (
        <CommandForm
          command={activeCommand}
          draft={draft}
          onDraftChange={setDraft}
          onCancel={() => {
            setActiveCommand(null);
            onValueChange("");
          }}
          onSubmit={() => submitActiveCommand(activeCommand, draft.goal)}
        />
      ) : (
        <form
          className="work-composer"
          onSubmit={(event) => {
            event.preventDefault();
            const text = value.trim();
            if (!text) return;
            if (state === "slash_command_menu" || text.startsWith("/")) {
              const selected = filteredCommands[activeIndex] ?? commands.find((command) => text.startsWith(command.id));
              if (selected) selectCommand(selected);
              return;
            }
            onSubmitMessage(text);
          }}
          onKeyDown={(event) => {
            if (state !== "slash_command_menu") return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((activeIndex + 1) % Math.max(filteredCommands.length, 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(activeIndex === 0 ? Math.max(filteredCommands.length - 1, 0) : activeIndex - 1);
            }
            if (event.key === "Escape") {
              onMenuOpenChange(false);
              onValueChange("");
            }
          }}
        >
          <button type="button" className="work-composer__menu" aria-label="Open command menu" onClick={() => onMenuOpenChange(!menuOpen)}>
            /
          </button>
          <input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="Type a message or / for commands" aria-label="Studio chat composer" />
          <button type="submit" className="primary-action px-3 py-2 text-xs" title={state === "slash_command_menu" ? "Run preflight" : "Send message"}>
            {state === "slash_command_menu" ? "Run" : mode === "brainstorm" ? "Send" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
