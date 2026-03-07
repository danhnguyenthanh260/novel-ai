"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type HeaderContext = {
  chapterLabel: string | null;
  sceneLabel: string | null;
  sceneStatus: string | null;
};

type StoryContextValue = {
  storySlug: string;
  setStorySlug: (slug: string) => void;
  writingLanguage: "en" | "vi";
  setWritingLanguage: (lang: "en" | "vi") => void;
  headerContext: HeaderContext;
  setHeaderContext: (next: HeaderContext) => void;
  clearHeaderContext: () => void;
  headerBusy: boolean;
  headerBusyLabel: string | null;
  runHeaderAction: <T>(label: string, action: () => Promise<T>) => Promise<T>;
};

const StoryContext = createContext<StoryContextValue | undefined>(undefined);

const STORAGE_KEY = "storySlug";
const LANGUAGE_KEY = "writingLanguage";

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [storySlug, setStorySlugState] = useState("default");
  const [writingLanguage, setWritingLanguageState] = useState<"en" | "vi">("en");
  const [headerContext, setHeaderContextState] = useState<HeaderContext>({
    chapterLabel: null,
    sceneLabel: null,
    sceneStatus: null,
  });
  const [headerBusyMap, setHeaderBusyMap] = useState<Record<number, string>>({});
  const busySeqRef = useRef(0);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) setStorySlugState(saved.trim());
      const savedLang = window.localStorage.getItem(LANGUAGE_KEY);
      if (savedLang === "vi") setWritingLanguageState("vi");
    } catch {}
  }, []);

  const setStorySlug = useCallback((slug: string) => {
    const next = slug.trim() || "default";
    setStorySlugState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const setWritingLanguage = useCallback((lang: "en" | "vi") => {
    const next = lang === "vi" ? "vi" : "en";
    setWritingLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_KEY, next);
    } catch {}
  }, []);

  const setHeaderContext = useCallback((next: HeaderContext) => {
    setHeaderContextState((prev) => {
      if (
        prev.chapterLabel === next.chapterLabel &&
        prev.sceneLabel === next.sceneLabel &&
        prev.sceneStatus === next.sceneStatus
      ) {
        return prev;
      }
      return {
        chapterLabel: next.chapterLabel,
        sceneLabel: next.sceneLabel,
        sceneStatus: next.sceneStatus,
      };
    });
  }, []);

  const clearHeaderContext = useCallback(() => {
    setHeaderContextState((prev) => {
      if (prev.chapterLabel === null && prev.sceneLabel === null && prev.sceneStatus === null) {
        return prev;
      }
      return {
        chapterLabel: null,
        sceneLabel: null,
        sceneStatus: null,
      };
    });
  }, []);

  const runHeaderAction = useCallback(async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
    const id = ++busySeqRef.current;
    setHeaderBusyMap((prev) => ({ ...prev, [id]: label }));
    try {
      return await action();
    } finally {
      setHeaderBusyMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  const busyLabels = Object.values(headerBusyMap);
  const headerBusy = busyLabels.length > 0;
  const headerBusyLabel = headerBusy ? busyLabels[busyLabels.length - 1] : null;

  const value = useMemo(
    () => ({
      storySlug,
      setStorySlug,
      writingLanguage,
      setWritingLanguage,
      headerContext,
      setHeaderContext,
      clearHeaderContext,
      headerBusy,
      headerBusyLabel,
      runHeaderAction,
    }),
    [
      storySlug,
      setStorySlug,
      writingLanguage,
      setWritingLanguage,
      headerContext,
      setHeaderContext,
      clearHeaderContext,
      headerBusy,
      headerBusyLabel,
      runHeaderAction,
    ]
  );
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory(): StoryContextValue {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error("useStory must be used inside StoryProvider");
  return ctx;
}
