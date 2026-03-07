import { QuickAssistPanel } from "@/features/scenes/components/draftRunner/panels/QuickAssistPanel";
import { ChatAssistPanel } from "@/features/scenes/components/draftRunner/panels/ChatAssistPanel";
import type { DraftAssistPanelProps } from "@/features/scenes/components/draftRunner/panels/assistTypes";

export function DraftAssistPanel(props: DraftAssistPanelProps) {
  const { assistMode, setAssistMode, museChatEnabled } = props;

  return (
    <section className="surface-card p-2 text-sm">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="muted">Ghost Muse</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`shell-link px-2 py-1 ${assistMode === "quick" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setAssistMode("quick")}
          >
            Quick
          </button>
          {museChatEnabled ? (
            <button
              type="button"
              className={`shell-link px-2 py-1 ${assistMode === "chat" ? "border-[#3f6b90]" : ""}`}
              onClick={() => setAssistMode("chat")}
            >
              Chat
            </button>
          ) : null}
        </div>
      </div>

      {assistMode === "quick" ? <QuickAssistPanel {...props} /> : <ChatAssistPanel {...props} />}
    </section>
  );
}
