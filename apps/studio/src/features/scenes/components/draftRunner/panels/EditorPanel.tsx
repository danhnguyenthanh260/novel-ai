import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { Preferences, WriteViewMode } from "@/features/scenes/components/draftRunner/shared";

export function DraftEditorPanel(props: {
  writeViewMode: WriteViewMode;
  setWriteViewMode: Dispatch<SetStateAction<WriteViewMode>>;
  showWriteTools: boolean;
  setShowWriteTools: Dispatch<SetStateAction<boolean>>;
  showWriteMore: boolean;
  setShowWriteMore: Dispatch<SetStateAction<boolean>>;
  isSceneLocked: boolean;
  applyWrap: (prefix: string, suffix: string, fallbackText: string) => void;
  applyLinePrefix: (marker: string) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  prefs: Preferences;
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  renderPreview: (value: string) => ReactNode;
  bufferState: "idle" | "pending" | "saved";
  dirty: boolean;
}) {
  const {
    writeViewMode,
    setWriteViewMode,
    showWriteTools,
    setShowWriteTools,
    showWriteMore,
    setShowWriteMore,
    isSceneLocked,
    applyWrap,
    applyLinePrefix,
    textRef,
    prefs,
    text,
    setText,
    renderPreview,
    bufferState,
    dirty,
  } = props;

  return (
    <section className="surface-card flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex items-center justify-between text-xs">
        <div className="muted">Writing mode</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`shell-link px-2 py-1 ${writeViewMode === "edit" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setWriteViewMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={`shell-link px-2 py-1 ${writeViewMode === "split" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setWriteViewMode("split")}
          >
            Split
          </button>
          <button
            type="button"
            className={`shell-link px-2 py-1 ${writeViewMode === "preview" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setWriteViewMode("preview")}
          >
            Preview
          </button>
        </div>
      </div>
      {writeViewMode !== "preview" ? (
        <div className="surface-card relative flex flex-wrap items-center gap-2 p-2 text-xs">
          <button type="button" className="shell-link px-2 py-1" onClick={() => setShowWriteTools((v) => !v)}>
            {showWriteTools ? "Hide tools" : "Show tools"}
          </button>
          {showWriteTools ? (
            <>
              <button type="button" className="shell-link px-2 py-1" disabled={isSceneLocked} onClick={() => applyWrap("**", "**", "bold")}>
                B
              </button>
              <button type="button" className="shell-link px-2 py-1" disabled={isSceneLocked} onClick={() => applyWrap("*", "*", "italic")}>
                I
              </button>
              <button type="button" className="shell-link px-2 py-1" disabled={isSceneLocked} onClick={() => applyWrap("# ", "", "Heading")}>
                H1
              </button>
              <button type="button" className="shell-link px-2 py-1" disabled={isSceneLocked} onClick={() => applyLinePrefix("- ")}>
                List
              </button>
              <button type="button" className="shell-link px-2 py-1" onClick={() => setShowWriteMore((v) => !v)}>
                More
              </button>
              {showWriteMore ? (
                <div className="surface-card absolute right-2 top-10 z-20 flex flex-col gap-1 p-2">
                  <button type="button" className="shell-link px-2 py-1 text-xs" disabled={isSceneLocked} onClick={() => applyWrap("## ", "", "Subheading")}>
                    H2
                  </button>
                  <button type="button" className="shell-link px-2 py-1 text-xs" disabled={isSceneLocked} onClick={() => applyLinePrefix("> ")}>
                    Quote
                  </button>
                  <button type="button" className="shell-link px-2 py-1 text-xs" disabled={isSceneLocked} onClick={() => applyWrap("```\n", "\n```", "code block")}>
                    Code
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <div className={`grid min-h-0 flex-1 gap-2 ${writeViewMode === "split" ? "md:grid-cols-2" : "grid-cols-1"}`}>
        {writeViewMode !== "preview" ? (
          <textarea
            ref={textRef}
            className="shell-control min-h-0 w-full flex-1 p-3 leading-7 text-[#e8edf2] outline-none"
            style={{ fontSize: `${prefs.editorFontSize}px` }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write without distractions..."
            readOnly={isSceneLocked}
          />
        ) : null}
        {writeViewMode !== "edit" ? (
          <div className="shell-control min-h-0 overflow-auto p-3" style={{ fontSize: `${prefs.editorFontSize}px` }}>
            {renderPreview(text)}
          </div>
        ) : null}
      </div>
      <div className="muted flex items-center justify-between text-xs">
        <div>
          Autosave: {bufferState} {dirty ? "| dirty" : "| clean"}
        </div>
        <div>Shortcut: Ctrl/Cmd + Shift + E for Ghost Expand</div>
      </div>
    </section>
  );
}
