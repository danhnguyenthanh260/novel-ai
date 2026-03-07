import { useCallback } from "react";
import type { RefObject } from "react";
import {
  MAX_MUSE_CHAPTER_BYTES,
  parseMuseChatIdeas,
  parseMuseLockedBlocks,
  readMuseHistory,
  toUtf8Bytes,
  writeMuseHistory,
  type MuseChatBeat,
  type MuseChatScope,
  type MuseCompressedSummary,
  type MuseTargetRange,
} from "@/features/scenes/components/draftRunner/shared";

export function useDraftMuseChatActions(params: {
  text: string;
  setText: (value: string | ((prev: string) => string)) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  isSceneLocked: boolean;
  museChatEnabled: boolean;
  museHistoryKey: string;
  storySlug: string;
  sceneId: string;
  writingLanguage: string;
  chatBusy: boolean;
  chatScope: MuseChatScope;
  chatTargetRange: MuseTargetRange;
  chatIdeasDraft: string;
  chatContextDraft: string;
  chatCompressed: MuseCompressedSummary | null;
  chatLockedBlocks: string[];
  chatBeats: MuseChatBeat[];
  chatProse: string;
  setChatPhase: (value: "idle" | "compressing" | "ready_to_synthesize" | "synthesizing" | "review" | "writing") => void;
  setChatError: (value: string | null) => void;
  setChatCompressed: (value: MuseCompressedSummary | null) => void;
  setChatLockedBlocks: (value: string[]) => void;
  setChatIntent: (value: string) => void;
  setChatMacroAnchor: (value: string) => void;
  setChatBeats: (value: MuseChatBeat[]) => void;
  setChatQuestions: (value: string[]) => void;
  setChatProse: (value: string) => void;
}) {
  const {
    text,
    setText,
    textRef,
    isSceneLocked,
    museChatEnabled,
    museHistoryKey,
    storySlug,
    sceneId,
    writingLanguage,
    chatBusy,
    chatScope,
    chatTargetRange,
    chatIdeasDraft,
    chatContextDraft,
    chatCompressed,
    chatLockedBlocks,
    chatBeats,
    chatProse,
    setChatPhase,
    setChatError,
    setChatCompressed,
    setChatLockedBlocks,
    setChatIntent,
    setChatMacroAnchor,
    setChatBeats,
    setChatQuestions,
    setChatProse,
  } = params;

  const readEditorSelection = useCallback(() => {
    const el = textRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const hasSelection = end > start;
    return {
      start,
      end,
      hasSelection,
      selection: hasSelection ? text.slice(start, end) : "",
      tail: text.slice(Math.max(0, text.length - 450)),
    };
  }, [text, textRef]);

  const runMuseChatCompress = useCallback(async () => {
    if (!museChatEnabled || chatBusy || chatScope !== "chapter") return;
    const { stripped, blocks } = parseMuseLockedBlocks(text);
    if (!stripped.trim()) {
      setChatError("Chapter text is empty after removing locked blocks.");
      return;
    }
    if (toUtf8Bytes(stripped) > MAX_MUSE_CHAPTER_BYTES) {
      setChatError("MUSE_PAYLOAD_TOO_LARGE");
      return;
    }
    setChatPhase("compressing");
    setChatError(null);
    setChatCompressed(null);
    setChatLockedBlocks(blocks);
    setChatIntent("");
    setChatMacroAnchor("");
    setChatBeats([]);
    setChatQuestions([]);
    setChatProse("");
    try {
      const history = readMuseHistory(museHistoryKey);
      const res = await fetch("/api/muse/chat/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storySlug,
          sceneId: Number(sceneId),
          scope: "chapter",
          chapter_text: stripped,
          history,
          locked_blocks: blocks,
          writing_language: writingLanguage,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_CHAT_COMPRESS_FAILED_${res.status}`);
      const item = json?.item as MuseCompressedSummary | null;
      if (!item?.core_thesis) throw new Error("MUSE_CHAT_COMPRESS_EMPTY");
      setChatCompressed(item);
      setChatPhase("ready_to_synthesize");
    } catch (e: unknown) {
      setChatPhase("idle");
      setChatError(e instanceof Error ? e.message : "MUSE_CHAT_COMPRESS_FAILED");
    }
  }, [chatBusy, chatScope, museChatEnabled, museHistoryKey, sceneId, setChatBeats, setChatCompressed, setChatError, setChatIntent, setChatLockedBlocks, setChatMacroAnchor, setChatPhase, setChatProse, setChatQuestions, storySlug, text, writingLanguage]);

  const runMuseChatSynthesis = useCallback(async () => {
    if (!museChatEnabled || chatBusy) return;
    const ideas = parseMuseChatIdeas(chatIdeasDraft);
    if (ideas.length === 0) {
      setChatError("Please provide at least one idea.");
      return;
    }

    const focus = readEditorSelection();
    if (chatScope === "selection" && !focus.hasSelection) {
      setChatError("SELECTION_REQUIRED");
      return;
    }
    if (chatScope === "chapter" && !chatCompressed) {
      setChatError("MUSE_COMPRESS_REQUIRED");
      return;
    }

    const history = readMuseHistory(museHistoryKey);
    setChatPhase("synthesizing");
    setChatError(null);
    setChatIntent("");
    setChatMacroAnchor("");
    setChatBeats([]);
    setChatQuestions([]);
    setChatProse("");
    try {
      const res = await fetch("/api/muse/chat/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storySlug,
          sceneId: Number(sceneId),
          scope: chatScope,
          ideas,
          history,
          compressed: chatScope === "chapter" ? chatCompressed : null,
          context: {
            selection: focus.selection,
            tail: chatScope === "scene" ? focus.tail : "",
            context: chatContextDraft,
          },
          writing_language: writingLanguage,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_CHAT_SYNTH_FAILED_${res.status}`);
      const item = json?.item as { intent?: string; macro_anchor?: string; beats?: MuseChatBeat[]; questions_for_user?: string[] } | undefined;
      const beats = Array.isArray(item?.beats) ? item.beats : [];
      if (beats.length === 0) throw new Error("MUSE_CHAT_SYNTH_EMPTY");
      setChatIntent(typeof item?.intent === "string" ? item.intent : "");
      setChatMacroAnchor(typeof item?.macro_anchor === "string" ? item.macro_anchor : "");
      setChatBeats(beats);
      setChatQuestions(Array.isArray(item?.questions_for_user) ? item.questions_for_user : []);
      setChatPhase("review");
    } catch (e: unknown) {
      setChatPhase(chatScope === "chapter" && chatCompressed ? "ready_to_synthesize" : "idle");
      setChatError(e instanceof Error ? e.message : "MUSE_CHAT_SYNTH_FAILED");
    }
  }, [chatBusy, chatCompressed, chatContextDraft, chatIdeasDraft, chatScope, museChatEnabled, museHistoryKey, readEditorSelection, sceneId, setChatBeats, setChatError, setChatIntent, setChatMacroAnchor, setChatPhase, setChatProse, setChatQuestions, storySlug, writingLanguage]);

  const runMuseChatProse = useCallback(async () => {
    if (!museChatEnabled || chatBusy || chatBeats.length === 0) return;
    const focus = readEditorSelection();
    if (chatScope === "chapter" && !chatCompressed) {
      setChatError("MUSE_COMPRESS_REQUIRED");
      return;
    }
    if (chatTargetRange === "rewrite_scene" && !focus.hasSelection) {
      setChatError("SELECTION_REQUIRED_FOR_REWRITE");
      return;
    }
    const history = readMuseHistory(museHistoryKey);

    setChatPhase("writing");
    setChatError(null);
    setChatProse("");
    try {
      const res = await fetch("/api/muse/chat/prose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storySlug,
          sceneId: Number(sceneId),
          scope: chatScope,
          target_range: chatTargetRange,
          approved_beats: chatBeats,
          compressed: chatScope === "chapter" ? chatCompressed : null,
          history,
          locked_spans_present: chatLockedBlocks.length > 0,
          context: {
            selection: focus.selection,
            tail: chatScope === "scene" ? focus.tail : "",
            context: chatContextDraft,
          },
          writing_language: writingLanguage,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_CHAT_PROSE_FAILED_${res.status}`);
      const prose = typeof json?.prose === "string" ? json.prose.trim() : "";
      if (!prose) throw new Error("MUSE_CHAT_PROSE_EMPTY");
      setChatProse(prose);
      writeMuseHistory(museHistoryKey, prose);
      setChatPhase("review");
    } catch (e: unknown) {
      setChatPhase("review");
      setChatError(e instanceof Error ? e.message : "MUSE_CHAT_PROSE_FAILED");
    }
  }, [chatBeats, chatBusy, chatCompressed, chatContextDraft, chatLockedBlocks, chatScope, chatTargetRange, museChatEnabled, museHistoryKey, readEditorSelection, sceneId, setChatError, setChatPhase, setChatProse, storySlug, writingLanguage]);

  const acceptMuseChatProse = useCallback(() => {
    const prose = chatProse.trim();
    if (!prose || isSceneLocked) return;
    const el = textRef.current;
    if (!el) {
      setText((prev) => `${prev}${prev.endsWith("\n") ? "" : "\n"}${prose}`);
      setChatPhase("review");
      return;
    }

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (chatTargetRange === "rewrite_scene") {
      if (end <= start) {
        setChatError("SELECTION_REQUIRED_FOR_REWRITE");
        return;
      }
      const nextValue = `${text.slice(0, start)}${prose}${text.slice(end)}`;
      setText(nextValue);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + prose.length;
        el.setSelectionRange(pos, pos);
      });
      setChatPhase("review");
      return;
    }

    const insertAt = end;
    const prefix = insertAt > 0 && !text.slice(0, insertAt).endsWith("\n") ? "\n" : "";
    const nextValue = `${text.slice(0, insertAt)}${prefix}${prose}${text.slice(insertAt)}`;
    setText(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      const pos = insertAt + prefix.length + prose.length;
      el.setSelectionRange(pos, pos);
    });
    setChatPhase("review");
  }, [chatProse, chatTargetRange, isSceneLocked, setChatError, setChatPhase, setText, text, textRef]);

  return {
    runMuseChatCompress,
    runMuseChatSynthesis,
    runMuseChatProse,
    acceptMuseChatProse,
  };
}
