import type {
  AssistantConversationListItem,
  AssistantConversationScope,
} from "@/features/scenes/components/writeTab/chatOrchestration/useAssistantConversations";

type ConversationHistoryPanelProps = {
  conversations: AssistantConversationListItem[];
  activeConversationId: string | null;
  scope: AssistantConversationScope;
  loading: boolean;
  error: string | null;
  onScopeChange: (scope: AssistantConversationScope) => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
};

function labelForConversation(item: AssistantConversationListItem): string {
  return item.title?.trim() || item.last_message_preview?.trim() || "Untitled chat";
}

function formatUpdatedAt(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "";
  return time.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ConversationHistoryPanel({
  conversations,
  activeConversationId,
  scope,
  loading,
  error,
  onScopeChange,
  onNewChat,
  onSelectConversation,
}: ConversationHistoryPanelProps) {
  return (
    <section className="conversation-history" aria-label="Assistant conversation history">
      <div className="conversation-history__toolbar">
        <div className="conversation-history__title">Chats</div>
        <button type="button" onClick={onNewChat}>New chat</button>
      </div>
      <div className="conversation-history__filters" role="group" aria-label="Conversation scope">
        <button type="button" className={scope === "current_chapter" ? "is-active" : ""} onClick={() => onScopeChange("current_chapter")}>
          Current chapter
        </button>
        <button type="button" className={scope === "all_story" ? "is-active" : ""} onClick={() => onScopeChange("all_story")}>
          All story
        </button>
      </div>
      <div className="conversation-history__list">
        {conversations.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`conversation-history__item ${item.id === activeConversationId ? "is-active" : ""}`}
            onClick={() => onSelectConversation(item.id)}
          >
            <span>{labelForConversation(item)}</span>
            <small>{formatUpdatedAt(item.updated_at)}</small>
          </button>
        ))}
        {!loading && conversations.length === 0 ? <div className="conversation-history__empty">No saved chats yet.</div> : null}
        {loading ? <div className="conversation-history__empty">Loading chats...</div> : null}
        {error ? <div className="conversation-history__error">{error}</div> : null}
      </div>
    </section>
  );
}
