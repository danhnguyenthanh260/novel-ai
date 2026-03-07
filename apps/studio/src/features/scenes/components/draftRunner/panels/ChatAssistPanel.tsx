import type { ChatAssistProps } from "@/features/scenes/components/draftRunner/panels/assistTypes";
import type { MuseChatScope, MuseTargetRange } from "@/features/scenes/components/draftRunner/shared";

export function ChatAssistPanel(props: ChatAssistProps) {
  const {
    chatPhase,
    chatScope,
    onChatScopeChange,
    chatTargetRange,
    setChatTargetRange,
    chatIdeasDraft,
    setChatIdeasDraft,
    chatContextDraft,
    setChatContextDraft,
    chatCompressed,
    chapterPayloadMaxKb,
    chatBusy,
    runMuseChatCompress,
    runMuseChatSynthesis,
    runMuseChatProse,
    chatBeats,
    chatError,
    chatMacroAnchor,
    chatIntent,
    chatQuestions,
    chatProse,
    isSceneLocked,
    acceptMuseChatProse,
    clearChatState,
  } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="muted">Muse Chat</span>
        <span className="status-pill status-pill--other">{chatPhase}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-xs">
          <span className="muted">Scope</span>
          <select
            className="shell-control px-2 py-1"
            value={chatScope}
            onChange={(e) => onChatScopeChange(e.target.value as MuseChatScope)}
          >
            <option value="selection">Selection</option>
            <option value="scene">Scene</option>
            <option value="chapter">Chapter</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="muted">Target range</span>
          <select
            className="shell-control px-2 py-1"
            value={chatTargetRange}
            onChange={(e) => setChatTargetRange(e.target.value as MuseTargetRange)}
          >
            <option value="patch_short">Patch short (120-250)</option>
            <option value="medium">Medium (300-500)</option>
            <option value="rewrite_scene">Rewrite scene (700-1200)</option>
          </select>
        </label>
      </div>
      <textarea
        className="shell-control min-h-[88px] w-full p-2 text-sm leading-6"
        value={chatIdeasDraft}
        onChange={(e) => setChatIdeasDraft(e.target.value)}
        placeholder={"Idea bullets (one per line)\n- Character secret leaks\n- Political pressure escalates\n- End with costly choice"}
      />
      <textarea
        className="shell-control min-h-[70px] w-full p-2 text-xs leading-5"
        value={chatContextDraft}
        onChange={(e) => setChatContextDraft(e.target.value)}
        placeholder="Optional extra context"
      />
      {chatScope === "chapter" ? (
        <div className="shell-control p-2 text-xs">
          <div className="muted">
            Chapter mode uses full editor text (excluding [[LOCK]]...[[/LOCK]]). Max payload {chapterPayloadMaxKb}KB.
          </div>
          {chatCompressed ? (
            <div className="mt-1 text-emerald-300">Compressed summary ready.</div>
          ) : (
            <div className="mt-1 text-amber-300">Compress is required before synthesize.</div>
          )}
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-xs">
        {chatScope === "chapter" ? (
          <button
            type="button"
            className="shell-link px-2 py-1 disabled:opacity-40"
            disabled={chatBusy}
            onClick={() => runMuseChatCompress().catch(() => undefined)}
          >
            {chatPhase === "compressing" ? "Compressing..." : "Compress"}
          </button>
        ) : null}
        <button
          type="button"
          className="shell-link px-2 py-1 disabled:opacity-40"
          disabled={chatBusy || (chatScope === "chapter" && !chatCompressed)}
          onClick={() => runMuseChatSynthesis().catch(() => undefined)}
        >
          {chatPhase === "synthesizing" ? "Synthesizing..." : "Synthesize"}
        </button>
        <button
          type="button"
          className="shell-link px-2 py-1 disabled:opacity-40"
          disabled={chatBusy || chatBeats.length === 0 || (chatScope === "chapter" && !chatCompressed)}
          onClick={() => runMuseChatProse().catch(() => undefined)}
        >
          {chatPhase === "writing" ? "Writing..." : "Approve & Write"}
        </button>
      </div>
      {chatError ? <div className="text-xs text-[#ff8f8f]">{chatError}</div> : null}
      {chatMacroAnchor ? <div className="shell-control p-2 text-xs"><span className="muted">Macro anchor:</span> {chatMacroAnchor}</div> : null}
      {chatCompressed ? (
        <div className="shell-control max-h-[180px] space-y-1 overflow-auto p-2 text-xs">
          <div><span className="muted">Core thesis:</span> {chatCompressed.core_thesis}</div>
          {chatCompressed.constraints_for_next_step.length > 0 ? (
            <div><span className="muted">Constraints:</span> {chatCompressed.constraints_for_next_step.join(" | ")}</div>
          ) : null}
        </div>
      ) : null}
      {chatIntent ? <div className="shell-control p-2 text-xs"><span className="muted">Intent:</span> {chatIntent}</div> : null}
      {chatBeats.length > 0 ? (
        <div className="shell-control max-h-[220px] space-y-2 overflow-auto p-2 text-xs">
          {chatBeats.map((beat) => (
            <div key={beat.id} className="surface-card space-y-1 p-2">
              <div className="font-medium">{beat.id}</div>
              <div><span className="muted">Goal:</span> {beat.goal}</div>
              <div><span className="muted">Conflict:</span> {beat.conflict}</div>
              <div><span className="muted">Turn:</span> {beat.turn}</div>
            </div>
          ))}
        </div>
      ) : null}
      {chatQuestions.length > 0 ? (
        <div className="shell-control p-2 text-xs">
          <div className="muted mb-1">Questions</div>
          <ul className="list-disc space-y-1 pl-5">
            {chatQuestions.map((q, idx) => (
              <li key={`chat-q-${idx}`} className="break-words whitespace-pre-wrap">
                {q}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="shell-control max-h-[260px] min-h-[100px] overflow-auto p-2 text-sm leading-6">
        <div className="break-words whitespace-pre-wrap">{chatProse || "No prose yet."}</div>
      </div>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          className="shell-link px-2 py-1 disabled:opacity-40"
          disabled={!chatProse.trim() || isSceneLocked}
          onClick={acceptMuseChatProse}
        >
          Accept into editor
        </button>
        <button
          type="button"
          className="shell-link px-2 py-1 disabled:opacity-40"
          disabled={chatBusy}
          onClick={clearChatState}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
