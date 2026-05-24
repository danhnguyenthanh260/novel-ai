import React from "react";
import type { ChatScope, TimelineBlock } from "@/features/scenes/components/writeTab/types";
import {
  defaultConversationState,
  isTimelineBlock,
  normalizeConversationState,
  persistedBlockPayload,
  type AssistantConversationState,
} from "@/features/scenes/components/writeTab/chatOrchestration/conversationPersistence";


export type AssistantConversationScope = "current_chapter" | "all_story";

export type AssistantConversationListItem = {
  id: string;
  chapter_id: string | null;
  title: string | null;
  summary: string | null;
  status: "active" | "archived";
  state_json: Partial<AssistantConversationState>;
  updated_at: string;
  last_message_preview: string | null;
};

type AssistantConversationMessage = {
  block: unknown;
};

async function jsonOrError(res: Response): Promise<Record<string, unknown>> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = typeof json?.error === "string" ? json.error : `REQUEST_FAILED_${res.status}`;
    throw new Error(error);
  }
  return json as Record<string, unknown>;
}

function conversationWorkspace(scope: ChatScope): "write_assistant" | "story" {
  return scope === "story" ? "story" : "write_assistant";
}

function scopedChapterId(scope: ChatScope, chapterId: string): string {
  return scope === "story" ? "" : chapterId;
}

// Conversation orchestration keeps list/load/create/append state colocated so restored chat state stays coherent.
// eslint-disable-next-line max-lines-per-function
export function useAssistantConversations(args: { storySlug: string; chapterId: string; chatScope: ChatScope }) {
  const [scope, setScope] = React.useState<AssistantConversationScope>("current_chapter");
  const [items, setItems] = React.useState<AssistantConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [conversationBlocks, setConversationBlocks] = React.useState<TimelineBlock[]>([]);
  const [conversationState, setConversationState] = React.useState<AssistantConversationState>(defaultConversationState);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const creatingRef = React.useRef<Promise<string> | null>(null);
  const activeIdRef = React.useRef<string | null>(null);
  const itemsRef = React.useRef<AssistantConversationListItem[]>([]);
  const appendQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const conversationsUrl = React.useCallback(() => {
    const chapterId = scopedChapterId(args.chatScope, args.chapterId);
    const qs = new URLSearchParams({ scope, workspace: conversationWorkspace(args.chatScope) });
    if (chapterId) qs.set("chapter_id", chapterId);
    return `/api/stories/${encodeURIComponent(args.storySlug)}/assistant/conversations?${qs.toString()}`;
  }, [args.chapterId, args.chatScope, args.storySlug, scope]);

  const loadConversation = React.useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(args.storySlug)}/assistant/conversations/${conversationId}/messages`, { cache: "no-store" });
      const json = await jsonOrError(res);
      const rows = Array.isArray(json.items) ? json.items as AssistantConversationMessage[] : [];
      const found = itemsRef.current.find((item) => item.id === conversationId);
      const restoredState = normalizeConversationState(found?.state_json);
      activeIdRef.current = conversationId;
      setActiveConversationId(conversationId);
      setConversationBlocks(rows.map((row) => row.block).filter(isTimelineBlock).map((block) => {
        if (block.type !== "choice_group") return block;
        const selectedIds = restoredState.choiceSelections[block.id] ?? [];
        return {
          ...block,
          choices: block.choices.map((choice) => ({
            ...choice,
            selected: selectedIds.includes(choice.id),
            disabled: selectedIds.length > 0 && !selectedIds.includes(choice.id),
          })),
        };
      }));
      setConversationState(restoredState);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "LOAD_CONVERSATION_FAILED");
    } finally {
      setLoading(false);
    }
  }, [args.storySlug]);

  const reloadConversations = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(conversationsUrl(), { cache: "no-store" });
      const json = await jsonOrError(res);
      const nextItems = Array.isArray(json.items) ? json.items as AssistantConversationListItem[] : [];
      itemsRef.current = nextItems;
      setItems(nextItems);
      const selected = activeIdRef.current && nextItems.some((item) => item.id === activeIdRef.current)
        ? activeIdRef.current
        : nextItems[0]?.id ?? null;
      if (!selected) {
        setActiveConversationId(null);
        setConversationBlocks([]);
        setConversationState(defaultConversationState);
        return;
      }
      await loadConversation(selected);
    } catch (e: unknown) {
      setItems([]);
      setActiveConversationId(null);
      setConversationBlocks([]);
      setConversationState(defaultConversationState);
      setError(e instanceof Error ? e.message : "LIST_CONVERSATIONS_FAILED");
    } finally {
      setLoading(false);
    }
  }, [conversationsUrl, loadConversation]);

  React.useEffect(() => {
    activeIdRef.current = null;
    void reloadConversations();
  }, [reloadConversations]);

  const createConversation = React.useCallback(async (): Promise<string> => {
    if (creatingRef.current) return creatingRef.current;
    creatingRef.current = (async () => {
      const res = await fetch(`/api/stories/${encodeURIComponent(args.storySlug)}/assistant/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: conversationWorkspace(args.chatScope),
          chapter_id: scopedChapterId(args.chatScope, args.chapterId) || null,
          state_json: defaultConversationState,
        }),
      });
      const json = await jsonOrError(res);
      const item = json.item as AssistantConversationListItem;
      activeIdRef.current = item.id;
      setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
      setActiveConversationId(item.id);
      setConversationBlocks([]);
      setConversationState(defaultConversationState);
      return item.id;
    })();
    try {
      return await creatingRef.current;
    } finally {
      creatingRef.current = null;
    }
  }, [args.chapterId, args.chatScope, args.storySlug]);

  const startNewConversation = React.useCallback(async () => {
    setConversationBlocks([]);
    setConversationState(defaultConversationState);
    await createConversation();
  }, [createConversation]);

  const ensureConversation = React.useCallback(async () => activeIdRef.current ?? createConversation(), [createConversation]);

  const appendBlock = React.useCallback(async (block: TimelineBlock) => {
    appendQueueRef.current = appendQueueRef.current.catch(() => undefined).then(async () => {
      const conversationId = await ensureConversation();
      setConversationBlocks((current) => current.some((existing) => existing.id === block.id) ? current : [...current, block]);
      const payload = persistedBlockPayload(block);
      const res = await fetch(`/api/stories/${encodeURIComponent(args.storySlug)}/assistant/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await jsonOrError(res);
      setError(null);
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "APPEND_MESSAGE_FAILED");
    });
    return appendQueueRef.current;
  }, [args.storySlug, ensureConversation]);

  const persistConversationState = React.useCallback(async (state: AssistantConversationState) => {
    setConversationState(state);
    const conversationId = activeIdRef.current;
    if (!conversationId) return;
    await fetch(`/api/stories/${encodeURIComponent(args.storySlug)}/assistant/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state_json: state }),
    }).then(jsonOrError).catch(() => undefined);
  }, [args.storySlug]);

  const selectChoice = React.useCallback(async (choiceGroupId: string, choiceId: string) => {
    const nextState = {
      ...conversationState,
      choiceSelections: {
        ...conversationState.choiceSelections,
        [choiceGroupId]: [choiceId],
      },
    };
    setConversationBlocks((current) => current.map((block) => {
      if (block.type !== "choice_group" || block.id !== choiceGroupId) return block;
      return {
        ...block,
        choices: block.choices.map((choice) => ({
          ...choice,
          selected: choice.id === choiceId,
          disabled: choice.id !== choiceId,
        })),
      };
    }));
    await persistConversationState(nextState);
  }, [conversationState, persistConversationState]);

  return {
    scope,
    setScope,
    conversations: items,
    activeConversationId,
    conversationBlocks,
    conversationState,
    loading,
    error,
    loadConversation,
    startNewConversation,
    appendBlock,
    persistConversationState,
    selectChoice,
  };
}
