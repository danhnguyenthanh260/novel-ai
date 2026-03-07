import { useCallback, useEffect, useMemo, useState } from "react";
import { apiBase } from "@/lib/apiBase";
import { buildDraftKey } from "@/features/muse/components/museAnalysis/utils";
import type { MuseAnalysisItem, MuseAnalysisMode, SceneItem } from "@/features/muse/components/museAnalysis/types";

type UseMuseAnalysisStateResult = {
  mode: MuseAnalysisMode;
  setMode: (value: MuseAnalysisMode) => void;
  sceneFilter: string;
  setSceneFilter: (value: string) => void;
  draft: string;
  setDraft: (value: string) => void;
  debouncedDraft: string;
  scenes: SceneItem[];
  items: MuseAnalysisItem[];
  selectedId: string | null;
  setSelectedId: (value: string | null) => void;
  selectedItem: MuseAnalysisItem | null;
  loadingScenes: boolean;
  loadingList: boolean;
  saving: boolean;
  deletingId: string | null;
  error: string | null;
  flash: string | null;
  canSave: boolean;
  loadList: () => Promise<void>;
  saveReport: () => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
};

function useDraftPersistence(draft: string, setDraft: (value: string) => void, draftKey: string, setDebouncedDraft: (value: string) => void) {
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDraft(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, setDebouncedDraft]);

  useEffect(() => {
    setDraft(localStorage.getItem(draftKey) ?? "");
  }, [draftKey, setDraft]);

  useEffect(() => {
    localStorage.setItem(draftKey, draft);
  }, [draft, draftKey]);
}

function useScenesLoader(scenesApi: string, setScenes: (value: SceneItem[]) => void, setLoadingScenes: (value: boolean) => void) {
  useEffect(() => {
    let dead = false;
    const run = async () => {
      setLoadingScenes(true);
      try {
        const res = await fetch(scenesApi, { cache: "no-store" });
        const json = await res.json();
        const loaded = Array.isArray(json?.items) ? (json.items as SceneItem[]) : [];
        if (!dead) setScenes(loaded);
      } catch {
        if (!dead) setScenes([]);
      } finally {
        if (!dead) setLoadingScenes(false);
      }
    };
    run();
    return () => {
      dead = true;
    };
  }, [scenesApi, setLoadingScenes, setScenes]);
}

function useMuseListLoader(args: {
  base: string;
  sceneFilter: string;
  setError: (value: string | null) => void;
}) {
  const { base, sceneFilter, setError } = args;
  const [items, setItems] = useState<MuseAnalysisItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const qs = sceneFilter ? `?scene_id=${encodeURIComponent(sceneFilter)}&limit=20` : "?limit=20";
      const res = await fetch(`${base}${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_ANALYSIS_GET_FAILED_${res.status}`);
      const loaded = Array.isArray(json?.items) ? (json.items as MuseAnalysisItem[]) : [];
      setItems(loaded);
      setSelectedId((prev) => (prev && loaded.some((x) => x.id === prev) ? prev : loaded[0]?.id ?? null));
    } catch (e: unknown) {
      setItems([]);
      setSelectedId(null);
      setError(e instanceof Error ? e.message : "MUSE_ANALYSIS_GET_FAILED");
    } finally {
      setLoadingList(false);
    }
  }, [base, sceneFilter, setError]);

  useEffect(() => {
    loadList().catch(() => undefined);
  }, [loadList]);

  return { items, selectedId, setSelectedId, loadingList, loadList };
}

function useMuseReportActions(args: {
  base: string;
  canSave: boolean;
  draft: string;
  sceneFilter: string;
  loadList: () => Promise<void>;
  setDraft: (value: string) => void;
  setError: (value: string | null) => void;
  setFlash: (value: string | null) => void;
}) {
  const { base, canSave, draft, sceneFilter, loadList, setDraft, setError, setFlash } = args;
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const saveReport = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const payload = {
        raw_content_md: draft.trim(),
        scene_id: sceneFilter ? Number(sceneFilter) : null,
        created_by: "ui",
      };
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_ANALYSIS_SAVE_FAILED_${res.status}`);
      setFlash("Report saved.");
      setDraft("");
      await loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "MUSE_ANALYSIS_SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  }, [base, canSave, draft, loadList, sceneFilter, setDraft, setError, setFlash]);

  const deleteReport = useCallback(
    async (id: string) => {
      const ok = window.confirm("Delete this report?");
      if (!ok) return;
      setDeletingId(id);
      setError(null);
      setFlash(null);
      try {
        const res = await fetch(`${base}/${id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `MUSE_ANALYSIS_DELETE_FAILED_${res.status}`);
        setFlash("Report deleted.");
        await loadList();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "MUSE_ANALYSIS_DELETE_FAILED");
      } finally {
        setDeletingId(null);
      }
    },
    [base, loadList, setError, setFlash]
  );

  return { saving, deletingId, saveReport, deleteReport };
}

export function useMuseAnalysisState(storySlug: string): UseMuseAnalysisStateResult {
  const base = useMemo(() => `${apiBase(storySlug)}/muse/analysis`, [storySlug]);
  const scenesApi = useMemo(() => `${apiBase(storySlug)}/scenes`, [storySlug]);
  const [mode, setMode] = useState<MuseAnalysisMode>("edit");
  const [sceneFilter, setSceneFilter] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [debouncedDraft, setDebouncedDraft] = useState<string>("");
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [loadingScenes, setLoadingScenes] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const draftKey = useMemo(() => buildDraftKey(storySlug, sceneFilter), [sceneFilter, storySlug]);
  useDraftPersistence(draft, setDraft, draftKey, setDebouncedDraft);
  useScenesLoader(scenesApi, setScenes, setLoadingScenes);

  const { items, selectedId, setSelectedId, loadingList, loadList } = useMuseListLoader({
    base,
    sceneFilter,
    setError,
  });
  const canSave = draft.trim().length > 0;
  const { saving, deletingId, saveReport, deleteReport } = useMuseReportActions({
    base,
    canSave,
    draft,
    sceneFilter,
    loadList,
    setDraft,
    setError,
    setFlash,
  });
  const selectedItem = selectedId ? items.find((x) => x.id === selectedId) ?? null : null;

  return {
    mode,
    setMode,
    sceneFilter,
    setSceneFilter,
    draft,
    setDraft,
    debouncedDraft,
    scenes,
    items,
    selectedId,
    setSelectedId,
    selectedItem,
    loadingScenes,
    loadingList,
    saving,
    deletingId,
    error,
    flash,
    canSave: canSave && !saving,
    loadList,
    saveReport,
    deleteReport,
  };
}
