import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useStory } from "@/features/story/StoryContext";
import { apiBase } from "@/lib/apiBase";
import { buildHeaderContext, buildSeedPrompt, chooseSceneId } from "@/features/scenes/components/writeTab/actions";
import type { CurrentVersion, DockTab, SceneItem } from "@/features/scenes/components/writeTab/types";

type UseWriteTabStateResult = {
  scenes: SceneItem[];
  chapterIds: string[];
  sceneId: string;
  setSceneId: (value: string) => void;
  scene: SceneItem | null;
  current: CurrentVersion | null;
  loadingScenes: boolean;
  loadingDetail: boolean;
  error: string | null;
  dockTab: DockTab;
  setDockTab: (value: DockTab) => void;
  ghostSuggestionReady: boolean;
  setGhostSuggestionReady: (value: boolean) => void;
  seedPrompt: string;
  reloadDetail: () => Promise<void>;
  // New Chapter-level additions
  selectedChapterId: string;
  setSelectedChapterId: (id: string) => void;
  viewMode: "scene" | "chapter";
  chapterScenes: any[];
  stagingData: { user_prose: string; llm_prose: string; status: string } | null;
  loadingChapter: boolean;
  createNewChapter: () => Promise<void>;
  unlockScene: () => Promise<void>;
  reloadScenesList: () => Promise<void>;
  showAutoWrite: boolean;
  setShowAutoWrite: (v: boolean) => void;
  pendingChapterProse: { id: string; prose: string } | null;
  setPendingChapterProse: (v: { id: string; prose: string } | null) => void;
  handleAutoWriteComplete: (prose: string) => Promise<void>;
  saveChapterDraft: (prose: string) => Promise<void>;
  resplitChapter: (prose: string) => Promise<void>;
  v3Draft: { full_text: string; status: string; virtual_scenes: any[] } | null;
};

export function useWriteTabState(storySlug: string): UseWriteTabStateResult {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { setStorySlug, setHeaderContext, clearHeaderContext } = useStory();

  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [sceneId, setSceneId] = useState<string>("");

  // Initialize from URL
  const initialChapterId = params.get("chapter_id") || "";
  const [selectedChapterId, setSelectedChapterId] = useState<string>(initialChapterId);
  const [viewMode, setViewMode] = useState<"scene" | "chapter">("scene");
  const [chapterScenes, setChapterScenes] = useState<any[]>([]);
  const [loadingChapter, setLoadingChapter] = useState(false);

  const [scene, setScene] = useState<SceneItem | null>(null);
  const [current, setCurrent] = useState<CurrentVersion | null>(null);
  const [loadingScenes, setLoadingScenes] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dockTab, setDockTab] = useState<DockTab>("actions");
  const [ghostSuggestionReady, setGhostSuggestionReady] = useState(false);
  const [showAutoWrite, setShowAutoWrite] = useState(false);
  const [pendingChapterProse, setPendingChapterProse] = useState<{ id: string, prose: string } | null>(null);
  const [stagingData, setStagingData] = useState<{ user_prose: string; llm_prose: string; status: string } | null>(null);
  const [v3Draft, setV3Draft] = useState<{ full_text: string; status: string; virtual_scenes: any[] } | null>(null);

  const listUrl = useMemo(() => `${apiBase(storySlug)}/scenes`, [storySlug]);
  const detailUrl = useMemo(
    () => (sceneId ? `${apiBase(storySlug)}/scenes/${sceneId}/versions` : ""),
    [sceneId, storySlug]
  );

  useEffect(() => {
    setStorySlug(storySlug);
  }, [setStorySlug, storySlug]);

  useEffect(
    () => () => {
      clearHeaderContext();
    },
    [clearHeaderContext]
  );

  const reloadScenesList = useCallback(async () => {
    setLoadingScenes(true);
    setError(null);
    try {
      const [scenesRes, chaptersRes] = await Promise.all([
        fetch(listUrl, { cache: "no-store" }),
        fetch(`/api/stories/${storySlug}/chapters`, { cache: "no-store" }),
      ]);
      const [scenesJson, chaptersJson] = await Promise.all([scenesRes.json(), chaptersRes.json()]);
      if (!scenesRes.ok) throw new Error(scenesJson?.error ?? `GET_SCENES_FAILED_${scenesRes.status}`);
      if (!chaptersRes.ok) throw new Error(chaptersJson?.error ?? `GET_CHAPTERS_FAILED_${chaptersRes.status}`);
      const items = Array.isArray(scenesJson?.items) ? (scenesJson.items as SceneItem[]) : [];
      const chapterItems = Array.isArray(chaptersJson?.items) ? chaptersJson.items : [];
      const chapterList = chapterItems
        .map((x: any) => (typeof x?.chapter_id === "string" ? x.chapter_id.trim() : ""))
        .filter(Boolean);
      setScenes(items);
      setChapterIds(chapterList);
      const urlSceneId = params.get("scene_id");
      if (urlSceneId) {
        setSceneId(urlSceneId);
        setViewMode("scene");
      } else if (selectedChapterId) {
        // KEEP current chapter if we already have one
        setSelectedChapterId(selectedChapterId);
        setViewMode("chapter");
        setSceneId("");
      } else if (chapterList.length > 0) {
        // Default only if nothing is selected
        const firstChapter = chapterList[0];
        setSelectedChapterId(firstChapter);
        // Sync URL for default
        const nextParams = new URLSearchParams(params.toString());
        nextParams.set("chapter_id", firstChapter);
        router.replace(`${pathname}?${nextParams.toString()}`);
        setViewMode("chapter");
        setSceneId("");
      }
    } catch (e: unknown) {
      setScenes([]);
      setChapterIds([]);
      setError(e instanceof Error ? e.message : "GET_SCENES_FAILED");
    } finally {
      setLoadingScenes(false);
    }
  }, [listUrl, params, sceneId, selectedChapterId, storySlug]);

  useEffect(() => {
    reloadScenesList();
  }, [reloadScenesList]);

  const reloadDetail = useCallback(async () => {
    if (!detailUrl) {
      setScene(null);
      setCurrent(null);
      return;
    }

    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(detailUrl, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `GET_SCENE_FAILED_${res.status}`);
      setScene((json?.scene as SceneItem) ?? null);
      setCurrent((json?.current as CurrentVersion) ?? null);
      setViewMode("scene");
    } catch (e: unknown) {
      setScene(null);
      setCurrent(null);
      setError(e instanceof Error ? e.message : "GET_SCENE_FAILED");
    } finally {
      setLoadingDetail(false);
    }
  }, [detailUrl]);

  useEffect(() => {
    reloadDetail().catch(() => undefined);
  }, [reloadDetail]);

  const fetchChapterFull = useCallback(async (chapterId: string) => {
    setLoadingChapter(true);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storySlug}/chapters/${chapterId}/full`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "GET_CHAPTER_FULL_FAILED");
      setChapterScenes(json.items || []);
      setStagingData(json.staging || null);
      setV3Draft(json.v3_draft || null);
      setViewMode("chapter");
      // Pick first scene's label for header if available
      if (json.items?.[0]) {
        setHeaderContext({
          chapterLabel: chapterId,
          sceneLabel: "FULL CHAPTER READ",
          sceneStatus: "READ_ONLY",
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "GET_CHAPTER_FULL_FAILED");
    } finally {
      setLoadingChapter(false);
    }
  }, [storySlug, setHeaderContext]);

  useEffect(() => {
    if (selectedChapterId) {
      // Logic: Only clear pending prose if it's NOT for this chapter.
      // Since fetchChapterFull is called on select, we usually want to clear it
      // EXCEPT when we just generated it.
      // We'll trust handleAutoWriteComplete to set it, and only clear it here
      // if we are explicitly loading a DIFFERENT chapter.
      fetchChapterFull(selectedChapterId);
    }
  }, [selectedChapterId, fetchChapterFull]);

  useEffect(() => {
    if (viewMode === "scene" && scene) {
      setHeaderContext(buildHeaderContext(scene));
    }
  }, [scene, viewMode, setHeaderContext]);

  useEffect(() => {
    setGhostSuggestionReady(false);
  }, [sceneId]);

  const seedPrompt = useMemo(() => buildSeedPrompt(scene), [scene]);

  const createNewChapter = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storySlug}/chapters`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "CREATE_CHAPTER_FAILED");
      await reloadScenesList();
      if (json.chapter_id) {
        setSelectedChapterId(json.chapter_id);
        setPendingChapterProse(null);
        setStagingData(null);
        setV3Draft(null);
        setViewMode("chapter");
      } else if (json.scene_id) {
        setSceneId(String(json.scene_id));
        setViewMode("scene");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "CREATE_CHAPTER_FAILED");
    }
  };

  const unlockScene = async () => {
    if (!sceneId) return;
    setError(null);
    try {
      const res = await fetch(`${apiBase(storySlug)}/scenes/unlock`, {
        method: "POST",
        body: JSON.stringify({ scene_id: sceneId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "UNLOCK_FAILED");
      await reloadDetail();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "UNLOCK_FAILED");
    }
  };

  const handleAutoWriteComplete = async (prose: string) => {
    // 1. Trigger splitting logic (To be implemented in Step 5)
    console.log("AutoWrite Complete. Prose length:", prose.length);
    setShowAutoWrite(false);
    if (selectedChapterId) {
      setPendingChapterProse({ id: selectedChapterId, prose });
      await fetchChapterFull(selectedChapterId);
    }
    // Reload chapter list to ensure consistency
    await reloadScenesList();
  };

  const saveChapterDraft = async (prose: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storySlug}/chapters/${selectedChapterId}/stage`, {
        method: "POST",
        body: JSON.stringify({ prose }),
      });
      if (!res.ok) throw new Error("SAVE_DRAFT_FAILED");
      await fetchChapterFull(selectedChapterId);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const resplitChapter = async (prose: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/stories/${storySlug}/chapters/${selectedChapterId}/resplit`, {
        method: "POST",
        body: JSON.stringify({ prose }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "RESPLIT_FAILED");
      setPendingChapterProse(null);
      await reloadScenesList();
      await fetchChapterFull(selectedChapterId);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return {
    scenes,
    chapterIds,
    sceneId,
    setSceneId,
    scene,
    current,
    loadingScenes,
    loadingDetail,
    error,
    dockTab,
    setDockTab,
    ghostSuggestionReady,
    setGhostSuggestionReady,
    seedPrompt,
    reloadDetail,
    selectedChapterId,
    setSelectedChapterId: (id: string) => {
      if (id !== selectedChapterId) {
        setPendingChapterProse(null);
        // Sync with URL
        const nextParams = new URLSearchParams(params.toString());
        if (id) nextParams.set("chapter_id", id);
        else nextParams.delete("chapter_id");
        router.push(`${pathname}?${nextParams.toString()}`);
      }
      setSelectedChapterId(id);
    },
    viewMode,
    chapterScenes,
    stagingData,
    loadingChapter,
    createNewChapter,
    unlockScene,
    reloadScenesList,
    showAutoWrite,
    setShowAutoWrite,
    pendingChapterProse,
    setPendingChapterProse,
    handleAutoWriteComplete,
    saveChapterDraft,
    resplitChapter,
    v3Draft,
  };
}
