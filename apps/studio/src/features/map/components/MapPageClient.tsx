
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiBase } from "@/lib/apiBase";
import { useStory } from "@/features/story/StoryContext";

type MapCard = {
  id: number;
  chapter_id: string;
  idx: number;
  title: string | null;
  status: string;
  workunit_id: string | null;
  sequence_no: number;
  act_label: string | null;
  arc_id: number | null;
  arc_name: string | null;
  beat_count: number;
  thread_coverage_count: number;
  thread_types: string[];
  thread_ids: number[];
  is_orphan: boolean;
};

type MapChapter = {
  chapter_id: string;
  scenes: MapCard[];
};

type ArcItem = {
  id: number;
  name: string;
};

type ThreadItem = {
  id: number;
  name: string;
  slug?: string;
  type: "plot_line" | "character_arc";
};

type Beat = {
  id: number;
  beat_idx: number;
  goal: string;
  conflict: string;
  outcome: string;
  pov: string;
  thread_ids: number[];
  arc_id: number | null;
  notes_json: Record<string, unknown>;
};

type SceneDetail = {
  scene: MapCard & { sequence_no: number };
  beats: Beat[];
  arcs: ArcItem[];
  threads: ThreadItem[];
  map_locked: boolean;
};

type MapState = {
  active_version_id: number | null;
  working_version_id: number | null;
};

type MetricsPayload = {
  coverage: {
    total_scenes: number;
    scenes_with_beats: number;
    pct: number;
  };
  by_chapter: Array<{
    chapter_id: string;
    total_scenes: number;
    scenes_with_beats: number;
    orphan_scenes: number;
  }>;
  thread_orphan_n: number;
  threads_overdue: Array<{
    thread_id: number;
    slug?: string;
    name?: string;
    gap: number;
    threshold: number;
    last_seen_scene_pos?: number | null;
  }>;
};

export default function MapPageClient({ storySlug }: { storySlug: string }) {
  const { setStorySlug, setHeaderContext, clearHeaderContext } = useStory();
  const [chapters, setChapters] = useState<MapChapter[]>([]);
  const [arcs, setArcs] = useState<ArcItem[]>([]);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [mapLocked, setMapLocked] = useState(false);
  const [mapState, setMapState] = useState<MapState>({ active_version_id: null, working_version_id: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [actFilter, setActFilter] = useState("");
  const [arcFilter, setArcFilter] = useState("");
  const [threadTypeFilter, setThreadTypeFilter] = useState("");
  const [threadFilter, setThreadFilter] = useState("");
  const [orphanOnly, setOrphanOnly] = useState(false);

  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);
  const [sceneDetail, setSceneDetail] = useState<SceneDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showMetrics, setShowMetrics] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importFileName, setImportFileName] = useState("");
  const [importPayload, setImportPayload] = useState<Record<string, unknown> | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const base = apiBase(storySlug);

  const loadMap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/map?include_meta=1`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `MAP_GET_FAILED_${res.status}`);
      setChapters(Array.isArray(json?.chapters) ? (json.chapters as MapChapter[]) : []);
      setArcs(Array.isArray(json?.arcs) ? (json.arcs as ArcItem[]) : []);
      setThreads(Array.isArray(json?.threads) ? (json.threads as ThreadItem[]) : []);
      setMapLocked(Boolean(json?.map_locked));
      setMapState({
        active_version_id: Number(json?.state?.active_version_id || 0) || null,
        working_version_id: Number(json?.state?.working_version_id || 0) || null,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "MAP_GET_FAILED");
    } finally {
      setLoading(false);
    }
  }, [base]);

  const loadScene = useCallback(
    async (sceneId: number) => {
      setDrawerLoading(true);
      setError(null);
      try {
        const res = await fetch(`${base}/map/scenes/${sceneId}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `MAP_SCENE_GET_FAILED_${res.status}`);
        setSceneDetail({
          scene: json.scene,
          beats: Array.isArray(json.beats) ? json.beats : [],
          arcs: Array.isArray(json.arcs) ? json.arcs : [],
          threads: Array.isArray(json.threads) ? json.threads : [],
          map_locked: Boolean(json.map_locked),
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "MAP_SCENE_GET_FAILED");
      } finally {
        setDrawerLoading(false);
      }
    },
    [base]
  );

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch(`${base}/map/metrics`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `MAP_METRICS_FAILED_${res.status}`);
      setMetrics({
        coverage: json.coverage,
        by_chapter: Array.isArray(json.by_chapter) ? json.by_chapter : [],
        thread_orphan_n: Number(json.thread_orphan_n ?? 5),
        threads_overdue: Array.isArray(json.threads_overdue) ? json.threads_overdue : [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "MAP_METRICS_FAILED");
    } finally {
      setMetricsLoading(false);
    }
  }, [base]);

  useEffect(() => {
    setStorySlug(storySlug);
  }, [setStorySlug, storySlug]);

  useEffect(() => {
    return () => {
      clearHeaderContext();
    };
  }, [clearHeaderContext]);

  useEffect(() => {
    loadMap().catch(() => undefined);
  }, [loadMap]);

  useEffect(() => {
    if (activeSceneId === null) {
      setSceneDetail(null);
      return;
    }
    loadScene(activeSceneId).catch(() => undefined);
  }, [activeSceneId, loadScene]);

  useEffect(() => {
    if (!sceneDetail) {
      setHeaderContext({
        chapterLabel: null,
        sceneLabel: null,
        sceneStatus: null,
      });
      return;
    }
    setHeaderContext({
      chapterLabel: sceneDetail.scene.chapter_id || null,
      sceneLabel: sceneDetail.scene.title
        ? `${sceneDetail.scene.title} (#${sceneDetail.scene.sequence_no})`
        : `#${sceneDetail.scene.sequence_no}`,
      sceneStatus: sceneDetail.scene.status || null,
    });
  }, [sceneDetail, setHeaderContext]);

  const allActs = useMemo(() => {
    const set = new Set<string>();
    for (const chapter of chapters) for (const card of chapter.scenes) if (card.act_label) set.add(card.act_label);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [chapters]);

  const visibleChapters = useMemo(() => {
    return chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.filter((card) => {
        if (actFilter && card.act_label !== actFilter) return false;
        if (arcFilter && String(card.arc_id ?? "") !== arcFilter) return false;
        if (threadTypeFilter && !card.thread_types.includes(threadTypeFilter)) return false;
        if (threadFilter && !card.thread_ids.includes(Number(threadFilter))) return false;
        if (orphanOnly && !card.is_orphan) return false;
        return true;
      }),
    }));
  }, [chapters, actFilter, arcFilter, threadTypeFilter, threadFilter, orphanOnly]);

  const isDraft = mapState.working_version_id !== null && mapState.working_version_id !== mapState.active_version_id;

  async function withBusy<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function patchSceneMeta(patch: Record<string, unknown>) {
    if (!sceneDetail || mapLocked || sceneDetail.map_locked || busy) return;
    await withBusy(async () => {
      const res = await fetch(`${base}/map/scenes/${sceneDetail.scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `SCENE_PATCH_FAILED_${res.status}`);
      await Promise.all([loadMap(), loadScene(sceneDetail.scene.id)]);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "SCENE_PATCH_FAILED"));
  }

  async function addBeat() {
    if (!sceneDetail || mapLocked || sceneDetail.map_locked || busy) return;
    await withBusy(async () => {
      const res = await fetch(`${base}/map/scenes/${sceneDetail.scene.id}/beats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: "", conflict: "", outcome: "", pov: "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `BEAT_CREATE_FAILED_${res.status}`);
      await Promise.all([loadMap(), loadScene(sceneDetail.scene.id)]);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "BEAT_CREATE_FAILED"));
  }

  async function patchBeat(beatId: number, patch: Record<string, unknown>) {
    if (mapLocked || sceneDetail?.map_locked || busy) return;
    await withBusy(async () => {
      const res = await fetch(`${base}/map/beats/${beatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `BEAT_PATCH_FAILED_${res.status}`);
      if (sceneDetail) await Promise.all([loadMap(), loadScene(sceneDetail.scene.id)]);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "BEAT_PATCH_FAILED"));
  }

  async function deleteBeat(beatId: number) {
    if (!sceneDetail || mapLocked || sceneDetail.map_locked || busy) return;
    await withBusy(async () => {
      const res = await fetch(`${base}/map/beats/${beatId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `BEAT_DELETE_FAILED_${res.status}`);
      await Promise.all([loadMap(), loadScene(sceneDetail.scene.id)]);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "BEAT_DELETE_FAILED"));
  }

  async function moveBeat(beatId: number, direction: -1 | 1) {
    if (!sceneDetail || mapLocked || sceneDetail.map_locked || busy) return;
    const ids = sceneDetail.beats.map((b) => b.id);
    const idx = ids.indexOf(beatId);
    if (idx < 0) return;
    const next = idx + direction;
    if (next < 0 || next >= ids.length) return;
    const reordered = [...ids];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];

    await withBusy(async () => {
      const res = await fetch(`${base}/map/scenes/${sceneDetail.scene.id}/beats/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beat_ids: reordered }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `BEAT_REORDER_FAILED_${res.status}`);
      await Promise.all([loadMap(), loadScene(sceneDetail.scene.id)]);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "BEAT_REORDER_FAILED"));
  }

  async function runValidate() {
    await withBusy(async () => {
      const res = await fetch(`${base}/map/validate`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `MAP_VALIDATE_FAILED_${res.status}`);
      const s = json?.summary ?? {};
      setFlash(
        `Structure: sequence=${Number(s.sequence_issues_count ?? 0)}, orphan_scenes=${Number(s.orphan_scenes_count ?? 0)}, orphan_threads=${Number(
          s.orphan_threads_count ?? 0
        )}`
      );
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "MAP_VALIDATE_FAILED"));
  }

  async function checkoutMap() {
    if (mapLocked) return;
    await withBusy(async () => {
      const res = await fetch(`${base}/map/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "ui checkout", created_by: "ui" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `MAP_CHECKOUT_FAILED_${res.status}`);
      await loadMap();
      if (activeSceneId) await loadScene(activeSceneId);
      setFlash("Checked out new working draft.");
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "MAP_CHECKOUT_FAILED"));
  }

  async function commitMap() {
    if (mapLocked) return;
    await withBusy(async () => {
      const res = await fetch(`${base}/map/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "ui commit", created_by: "ui" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `MAP_COMMIT_FAILED_${res.status}`);
      await loadMap();
      if (activeSceneId) await loadScene(activeSceneId);
      if (showMetrics) await loadMetrics();
      setFlash("Committed map snapshot. New working draft created.");
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "MAP_COMMIT_FAILED"));
  }

  async function exportMap() {
    await withBusy(async () => {
      const res = await fetch(`${base}/map/export`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `MAP_EXPORT_FAILED_${res.status}`);
      const data = json?.payload ?? {};
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${storySlug}.map.latest.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFlash("Export complete.");
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Export failed"));
  }

  function onChooseImportFile(file: File | null) {
    setImportPayload(null);
    setImportFileName("");
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "{}");
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID");
        setImportPayload(parsed as Record<string, unknown>);
      } catch {
        setError("Invalid map file");
      }
    };
    reader.readAsText(file);
  }

  async function executeImport() {
    if (mapLocked || !importPayload || confirmText !== "REPLACE") return;
    await withBusy(async () => {
      if (!mapState.working_version_id) {
        const checkoutRes = await fetch(`${base}/map/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: "auto checkout before import", created_by: "ui" }),
        });
        const checkoutJson = await checkoutRes.json();
        if (!checkoutRes.ok) throw new Error(checkoutJson?.error ?? `MAP_CHECKOUT_FAILED_${checkoutRes.status}`);
      }

      const res = await fetch(`${base}/map/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: importPayload, created_by: "ui" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `MAP_IMPORT_FAILED_${res.status}`);

      await loadMap();
      if (activeSceneId) await loadScene(activeSceneId);
      if (showMetrics) await loadMetrics();

      setShowImportModal(false);
      setImportStep(1);
      setConfirmText("");
      setImportPayload(null);
      setImportFileName("");
      setFlash("Imported into draft map (not committed).");
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "Import failed";
      if (msg.includes("MAP_LOCKED")) setError("Map locked");
      else if (msg.includes("INVALID_PAYLOAD") || msg.includes("INVALID")) setError("Invalid map file");
      else setError(msg || "Import failed");
    });
  }

  return (
    <main className="space-y-4 p-2 md:p-4">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Map Board</h1>
          <div className="muted text-sm">Chapter-first structure planner</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="shell-link px-2 py-1 text-sm" disabled={busy} onClick={runValidate}>
            Check Structure
          </button>
          <button type="button" className="shell-link px-2 py-1 text-sm" disabled={busy || mapLocked} onClick={checkoutMap}>
            Checkout
          </button>
          <button type="button" className="shell-link px-2 py-1 text-sm" disabled={busy || mapLocked || !mapState.working_version_id} onClick={commitMap}>
            Commit
          </button>
          <button type="button" className="shell-link px-2 py-1 text-sm" disabled={busy} onClick={exportMap}>
            Export
          </button>
          <button
            type="button"
            className="shell-link px-2 py-1 text-sm"
            disabled={busy || mapLocked}
            onClick={() => {
              setShowImportModal(true);
              setImportStep(1);
              setConfirmText("");
              setImportPayload(null);
              setImportFileName("");
            }}
          >
            Import
          </button>
          <button
            type="button"
            className="shell-link px-2 py-1 text-sm"
            disabled={busy}
            onClick={() => {
              const next = !showMetrics;
              setShowMetrics(next);
              if (next) {
                setActiveSceneId(null);
                loadMetrics().catch(() => undefined);
              }
            }}
          >
            Metrics
          </button>
          <div className={`status-pill ${mapLocked ? "status-pill--locked" : isDraft ? "status-pill--drafting" : "status-pill--other"}`}>
            {mapLocked ? "Locked (read-only)" : isDraft ? "DRAFT" : "COMMITTED"}
          </div>
        </div>
      </div>

      {flash && <div className="text-sm text-emerald-300">{flash}</div>}
      {error && <div className="text-sm text-[#ff8f8f]">{error}</div>}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        <aside className="hidden space-y-3 xl:block">
          <section className="surface-card grid gap-2 p-3">
            <select className="shell-control px-2 py-1 text-sm" value={actFilter} onChange={(e) => setActFilter(e.target.value)}>
              <option value="">All acts</option>
              {allActs.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
            <select className="shell-control px-2 py-1 text-sm" value={arcFilter} onChange={(e) => setArcFilter(e.target.value)}>
              <option value="">All arcs</option>
              {arcs.map((arc) => (
                <option key={arc.id} value={String(arc.id)}>
                  {arc.name}
                </option>
              ))}
            </select>
            <select className="shell-control px-2 py-1 text-sm" value={threadTypeFilter} onChange={(e) => setThreadTypeFilter(e.target.value)}>
              <option value="">All thread types</option>
              <option value="plot_line">plot_line</option>
              <option value="character_arc">character_arc</option>
            </select>
            <select className="shell-control px-2 py-1 text-sm" value={threadFilter} onChange={(e) => setThreadFilter(e.target.value)}>
              <option value="">All threads</option>
              {threads.map((thread) => (
                <option key={thread.id} value={String(thread.id)}>
                  {thread.name}
                </option>
              ))}
            </select>
            <label className="muted flex items-center gap-2 text-sm">
              <input type="checkbox" checked={orphanOnly} onChange={(e) => setOrphanOnly(e.target.checked)} />
              only orphan scenes
            </label>
          </section>
          <section className="surface-card p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Chapters</div>
            <div className="space-y-2">
              {visibleChapters.map((chapter) => (
                <div key={chapter.chapter_id} className="shell-control p-2 text-sm">
                  <div className="font-medium">{chapter.chapter_id}</div>
                  <div className="muted text-xs">{chapter.scenes.length} scenes</div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="md:col-start-1 xl:col-start-2">
          {loading ? (
            <div className="muted text-sm">Loading map...</div>
          ) : (
            <section className="overflow-x-auto">
              <div className="flex min-w-max gap-3 pb-2">
                {visibleChapters.map((chapter) => (
                  <div key={chapter.chapter_id} className="surface-card w-[300px] p-3">
                    <div className="mb-2 text-sm font-semibold">{chapter.chapter_id}</div>
                    <div className="space-y-2">
                      {chapter.scenes.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            setShowMetrics(false);
                            setActiveSceneId(card.id);
                          }}
                          className="surface-card w-full p-2 text-left text-sm transition hover:-translate-y-0.5 hover:border-[#34506d]"
                        >
                          <div className="font-medium">
                            #{card.idx} {card.title || card.workunit_id || `scene-${card.id}`}
                          </div>
                          <div className="muted mt-1 text-xs">
                            seq={card.sequence_no} | beats={card.beat_count} | threads={card.thread_coverage_count}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs">
                            <span className={`status-pill ${card.status === "LOCKED" ? "status-pill--locked" : "status-pill--other"}`}>
                              {card.status}
                            </span>
                            {card.act_label && <span className="status-pill status-pill--other">{card.act_label}</span>}
                            {card.arc_name && <span className="status-pill status-pill--drafting">{card.arc_name}</span>}
                            {card.is_orphan && <span className="status-pill border-[#6f3a3a] bg-[#3b1a1a] text-[#ff8f8f]">orphan</span>}
                          </div>
                        </button>
                      ))}
                      {chapter.scenes.length === 0 && <div className="muted text-xs">No scenes by current filters.</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>

      {showMetrics && (
        <section className="surface-card md:col-start-2 xl:col-start-3 max-h-[calc(100vh-12rem)] overflow-y-auto p-3 text-[#e8edf2]">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">Metrics</div>
            <div className="flex gap-2">
              <button type="button" className="shell-link px-2 py-1 text-sm" disabled={busy || metricsLoading} onClick={() => loadMetrics().catch(() => undefined)}>
                Refresh
              </button>
              <button type="button" className="shell-link px-2 py-1 text-sm" onClick={() => setShowMetrics(false)}>
                Close
              </button>
            </div>
          </div>

          {metricsLoading || !metrics ? (
            <div className="muted text-sm">Loading metrics...</div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="surface-card p-3">
                <div className="font-medium">Coverage</div>
                <div className="muted mt-1">
                  {metrics.coverage.scenes_with_beats}/{metrics.coverage.total_scenes} scenes with beats ({metrics.coverage.pct}%)
                </div>
              </div>

              <div className="surface-card p-3">
                <div className="mb-2 font-medium">By Chapter</div>
                <div className="space-y-1">
                  {metrics.by_chapter.map((row) => (
                    <div key={row.chapter_id} className="flex items-center justify-between">
                      <span>{row.chapter_id}</span>
                      <span className="muted">
                        {row.scenes_with_beats}/{row.total_scenes} (orphan {row.orphan_scenes})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="surface-card p-3">
                <div className="mb-2 font-medium">Threads Overdue (N={metrics.thread_orphan_n})</div>
                <div className="space-y-1">
                  {metrics.threads_overdue.map((row) => (
                    <button
                      key={`${row.thread_id}-${row.slug ?? ""}`}
                      type="button"
                      className="surface-card w-full px-2 py-1 text-left transition hover:-translate-y-0.5 hover:border-[#34506d]"
                      onClick={() => {
                        setThreadFilter(String(row.thread_id));
                        setShowMetrics(false);
                      }}
                    >
                      <div className="font-medium">{row.name ?? row.slug ?? `thread-${row.thread_id}`}</div>
                      <div className="muted text-xs">gap={row.gap}, threshold={row.threshold}</div>
                    </button>
                  ))}
                  {metrics.threads_overdue.length === 0 && <div className="muted">No overdue threads.</div>}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeSceneId !== null && (
        <section className="surface-card md:col-start-2 xl:col-start-3 max-h-[calc(100vh-12rem)] overflow-y-auto p-3 text-[#e8edf2]">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">Scene Drawer</div>
            <button type="button" className="shell-link px-2 py-1 text-sm" onClick={() => setActiveSceneId(null)}>
              Close
            </button>
          </div>

          {drawerLoading || !sceneDetail ? (
            <div className="muted text-sm">Loading scene...</div>
          ) : (
            <div className="space-y-4">
              <div className="surface-card grid gap-2 p-3 text-sm md:grid-cols-2">
                <div>chapter: {sceneDetail.scene.chapter_id}</div>
                <label className="grid gap-1">
                  <span>Sequence</span>
                  <input
                    className="shell-control px-2 py-1"
                    type="number"
                    defaultValue={sceneDetail.scene.sequence_no}
                    disabled={mapLocked || sceneDetail.map_locked || busy}
                    onBlur={(e) => patchSceneMeta({ sequence_no: Number(e.target.value) })}
                  />
                </label>
                <label className="grid gap-1">
                  <span>Act Label</span>
                  <input
                    className="shell-control px-2 py-1"
                    defaultValue={sceneDetail.scene.act_label ?? ""}
                    disabled={mapLocked || sceneDetail.map_locked || busy}
                    onBlur={(e) => patchSceneMeta({ act_label: e.target.value || null })}
                  />
                </label>
                <label className="grid gap-1">
                  <span>Arc</span>
                  <select
                    className="shell-control px-2 py-1"
                    defaultValue={String(sceneDetail.scene.arc_id ?? "")}
                    disabled={mapLocked || sceneDetail.map_locked || busy}
                    onChange={(e) => patchSceneMeta({ arc_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">None</option>
                    {sceneDetail.arcs.map((arc) => (
                      <option key={arc.id} value={String(arc.id)}>
                        {arc.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div className="font-medium">Beats</div>
                <button
                  type="button"
                  className="shell-link px-2 py-1 text-sm"
                  disabled={mapLocked || sceneDetail.map_locked || busy}
                  onClick={addBeat}
                >
                  + Add beat
                </button>
              </div>

              <div className="space-y-3">
                {sceneDetail.beats.map((beat) => (
                  <div key={beat.id} className="surface-card p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-medium">Beat {beat.beat_idx}</div>
                      <div className="flex gap-1">
                        <button type="button" className="shell-link px-2 py-1" disabled={busy || mapLocked || sceneDetail.map_locked} onClick={() => moveBeat(beat.id, -1)}>Up</button>
                        <button type="button" className="shell-link px-2 py-1" disabled={busy || mapLocked || sceneDetail.map_locked} onClick={() => moveBeat(beat.id, 1)}>Down</button>
                        <button type="button" className="rounded border border-[#6f3a3a] bg-[#3b1a1a] px-2 py-1 text-[#ff8f8f]" disabled={busy || mapLocked || sceneDetail.map_locked} onClick={() => deleteBeat(beat.id)}>Delete</button>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <input className="shell-control px-2 py-1" defaultValue={beat.goal} placeholder="goal" disabled={busy || mapLocked || sceneDetail.map_locked} onBlur={(e) => patchBeat(beat.id, { goal: e.target.value })} />
                      <input className="shell-control px-2 py-1" defaultValue={beat.conflict} placeholder="conflict" disabled={busy || mapLocked || sceneDetail.map_locked} onBlur={(e) => patchBeat(beat.id, { conflict: e.target.value })} />
                      <input className="shell-control px-2 py-1" defaultValue={beat.outcome} placeholder="outcome" disabled={busy || mapLocked || sceneDetail.map_locked} onBlur={(e) => patchBeat(beat.id, { outcome: e.target.value })} />
                      <input className="shell-control px-2 py-1" defaultValue={beat.pov} placeholder="pov" disabled={busy || mapLocked || sceneDetail.map_locked} onBlur={(e) => patchBeat(beat.id, { pov: e.target.value })} />
                      <label className="grid gap-1">
                        <span className="muted text-xs">Threads</span>
                        <select
                          className="shell-control min-h-24 px-2 py-1"
                          multiple
                          defaultValue={beat.thread_ids.map((id) => String(id))}
                          disabled={busy || mapLocked || sceneDetail.map_locked}
                          onBlur={(e) => {
                            const threadIds = [...e.currentTarget.selectedOptions].map((opt) => Number(opt.value));
                            patchBeat(beat.id, { thread_ids: threadIds });
                          }}
                        >
                          {sceneDetail.threads.map((thread) => (
                            <option key={thread.id} value={String(thread.id)}>
                              {thread.name} ({thread.type})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="muted text-xs">Notes (JSON)</span>
                        <textarea
                          className="shell-control min-h-20 px-2 py-1 font-mono text-xs"
                          defaultValue={JSON.stringify(beat.notes_json ?? {}, null, 2)}
                          disabled={busy || mapLocked || sceneDetail.map_locked}
                          onBlur={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value || "{}");
                              patchBeat(beat.id, { notes_json: parsed });
                            } catch {
                              setError("Invalid notes_json");
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
                {sceneDetail.beats.length === 0 && <div className="muted text-sm">No beats yet.</div>}
              </div>
            </div>
          )}
        </section>
      )}

      {!showMetrics && activeSceneId === null && (
        <section className="surface-card md:col-start-2 xl:col-start-3 p-3 text-sm">
          <div className="font-semibold">Inspector</div>
          <div className="muted mt-1 text-xs">Select a scene card or open Metrics for structural diagnostics.</div>
        </section>
      )}
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#223247] bg-[#0f1722] p-4 text-white">
            <div className="mb-3 text-base font-semibold">Import Map (Replace All)</div>
            {mapLocked ? (
              <div className="rounded border border-[#6f3a3a] bg-[#3b1a1a] p-3 text-sm text-[#ffb4b4]">Map is locked.</div>
            ) : importStep === 1 ? (
              <div className="space-y-3 text-sm">
                <p className="muted">This will replace all beats + scene mapping in the working version.</p>
                <input
                  type="file"
                  accept="application/json,.json"
                  className="shell-control block w-full px-3 py-2"
                  onChange={(e) => onChooseImportFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                />
                {importFileName && <div className="muted">Selected: {importFileName}</div>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="shell-link px-3 py-2" onClick={() => setShowImportModal(false)} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="shell-link px-3 py-2"
                    disabled={busy || !importPayload}
                    onClick={() => setImportStep(2)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="muted">Type <code>REPLACE</code> to confirm destructive import.</p>
                <input
                  className="shell-control w-full px-3 py-2 text-white"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.trim())}
                  placeholder="REPLACE"
                  disabled={busy}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="shell-link px-3 py-2" onClick={() => setImportStep(1)} disabled={busy}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#6f3a3a] bg-[#3b1a1a] px-3 py-2 text-[#ff8f8f]"
                    disabled={busy || confirmText !== "REPLACE" || !importPayload}
                    onClick={executeImport}
                  >
                    Replace & Import
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
