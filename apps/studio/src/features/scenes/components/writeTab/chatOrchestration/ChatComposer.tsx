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
  attachmentName: string | null;
};

type ChatComposerProps = {
  value: string;
  menuOpen: boolean;
  commands: ChatCommandOption[];
  onValueChange: (value: string) => void;
  onMenuOpenChange: (value: boolean) => void;
  onSubmitCommand: (command: CommandId, goal: string) => void;
  onSubmitMessage: (message: string) => void;
  onCreateSourceArtifact: (text: string) => void;
};

export const LONG_INPUT_CHAR_THRESHOLD = 8000;
export const LONG_INPUT_LINE_THRESHOLD = 120;

const defaultDraft: CommandFormDraft = {
  goal: "",
  mode: "plan_first",
  wordTarget: 1500,
  target: "source",
  depth: "quick",
  attachmentName: null,
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

function longInputReason(text: string): string | null {
  if (text.length >= LONG_INPUT_CHAR_THRESHOLD) return `${text.length.toLocaleString()} characters`;
  const lineCount = text.split(/\r\n|\r|\n/).length;
  if (lineCount >= LONG_INPUT_LINE_THRESHOLD) return `${lineCount.toLocaleString()} lines`;
  return null;
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
  const isIngest = command === "/ingest";
  const readIngestFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    onDraftChange({ ...draft, goal: text, attachmentName: file.name });
  };

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

      {isIngest ? (
        <>
          <label>
            <span>Source URL or text</span>
            <textarea
              value={draft.goal}
              onChange={(event) => onDraftChange({ ...draft, goal: event.target.value, attachmentName: null })}
              placeholder="Paste source text or a source URL"
              rows={4}
            />
          </label>
          <label>
            <span>Source file</span>
            <input
              aria-label="Attach source file"
              type="file"
              accept=".txt,.md,.markdown,.text"
              onChange={(event) => void readIngestFile(event.currentTarget.files?.[0])}
            />
          </label>
          {draft.attachmentName ? <p>Attached: {draft.attachmentName}</p> : null}
        </>
      ) : null}

      {!isGoalCommand && !isAnalyze && !isIngest ? <p>Run preflight for {commandLabel(command)} using the current story and chapter context.</p> : null}

      <div className="command-form__actions">
        <button type="submit" className="primary-action px-3 py-2 text-xs">
          Run preflight
        </button>
      </div>
    </form>
  );
}

function LongInputConfirm({
  reason,
  onCreate,
  onKeepEditing,
}: {
  reason: string;
  onCreate: () => void;
  onKeepEditing: () => void;
}) {
  return (
    <div className="long-input-confirm" role="alertdialog" aria-label="Long input confirmation">
      <div>
        <strong>Create source artifact from pasted text?</strong>
        <p>{reason} is too large for a normal chat message.</p>
      </div>
      <div className="long-input-confirm__actions">
        <button type="button" className="primary-action px-3 py-2 text-xs" onClick={onCreate}>
          Create source artifact
        </button>
        <button type="button" className="shell-link px-3 py-2 text-xs" onClick={onKeepEditing}>
          Keep editing
        </button>
      </div>
    </div>
  );
}

export default function ChatComposer({ value, menuOpen, commands, onValueChange, onMenuOpenChange, onSubmitCommand, onSubmitMessage, onCreateSourceArtifact }: ChatComposerProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [activeCommand, setActiveCommand] = React.useState<CommandId | null>(null);
  const [draft, setDraft] = React.useState<CommandFormDraft>(defaultDraft);
  const [pendingLongInput, setPendingLongInput] = React.useState<string | null>(null);
  const state = composerState(value, menuOpen, activeCommand);
  const filteredCommands = commands.filter((command) => command.id.toLowerCase().includes(value.trimStart().replace(/^\/+/, "").toLowerCase()));
  const pendingReason = pendingLongInput ? longInputReason(pendingLongInput) : null;

  React.useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  const selectCommand = (command: ChatCommandOption, initialGoal = "") => {
    onValueChange(initialGoal ? `${command.id} ${initialGoal}` : `${command.id} `);
    onMenuOpenChange(false);
    if (command.status === "blocked") {
      onSubmitCommand(command.id, "");
      setActiveCommand(null);
      return;
    }
    setDraft({ ...defaultDraft, goal: initialGoal });
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

      {pendingLongInput && pendingReason ? (
        <LongInputConfirm
          reason={pendingReason}
          onCreate={() => {
            onCreateSourceArtifact(pendingLongInput);
            setPendingLongInput(null);
            onValueChange("");
          }}
          onKeepEditing={() => setPendingLongInput(null)}
        />
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
              if (selected) selectCommand(selected, text.startsWith(selected.id) ? text.slice(selected.id.length).trim() : "");
              return;
            }
            if (longInputReason(text)) {
              setPendingLongInput(text);
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
            if (event.key === "Enter" && !event.shiftKey && state === "slash_command_menu") {
              event.preventDefault();
              const selected = filteredCommands[activeIndex];
              if (selected) selectCommand(selected);
            }
          }}
        >
          <button type="button" className="work-composer__menu" aria-label="Open command menu" onClick={() => onMenuOpenChange(!menuOpen)}>
            /
          </button>
          <textarea
            data-testid="chat-composer-input"
            value={value}
            onChange={(event) => {
              onValueChange(event.target.value);
              if (pendingLongInput && !longInputReason(event.target.value)) setPendingLongInput(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || state === "slash_command_menu") return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            rows={1}
            placeholder="Message or / for commands"
            aria-label="Studio chat composer"
          />
          <button data-testid="chat-send-btn" type="submit" className="primary-action px-3 py-2 text-xs" title={state === "slash_command_menu" ? "Run preflight" : "Send message"}>
            {state === "slash_command_menu" ? "Run" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
