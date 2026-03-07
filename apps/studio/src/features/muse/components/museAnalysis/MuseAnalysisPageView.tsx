import MuseAnalysisComposerPanel from "@/features/muse/components/museAnalysis/MuseAnalysisComposerPanel";
import MuseAnalysisReportsPanel from "@/features/muse/components/museAnalysis/MuseAnalysisReportsPanel";
import type { MuseAnalysisItem, MuseAnalysisMode, SceneItem } from "@/features/muse/components/museAnalysis/types";

type MuseAnalysisPageViewProps = {
  storySlug: string;
  mode: MuseAnalysisMode;
  setMode: (value: MuseAnalysisMode) => void;
  error: string | null;
  flash: string | null;
  sceneFilter: string;
  setSceneFilter: (value: string) => void;
  loadingScenes: boolean;
  scenes: SceneItem[];
  draft: string;
  setDraft: (value: string) => void;
  debouncedDraft: string;
  canSave: boolean;
  saving: boolean;
  saveReport: () => Promise<void>;
  items: MuseAnalysisItem[];
  selectedId: string | null;
  setSelectedId: (value: string | null) => void;
  selectedItem: MuseAnalysisItem | null;
  loadingList: boolean;
  deletingId: string | null;
  loadList: () => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
};

export default function MuseAnalysisPageView({
  storySlug,
  mode,
  setMode,
  error,
  flash,
  sceneFilter,
  setSceneFilter,
  loadingScenes,
  scenes,
  draft,
  setDraft,
  debouncedDraft,
  canSave,
  saving,
  saveReport,
  items,
  selectedId,
  setSelectedId,
  selectedItem,
  loadingList,
  deletingId,
  loadList,
  deleteReport,
}: MuseAnalysisPageViewProps) {
  return (
    <main className="space-y-3 p-2 md:p-4">
      <section className="surface-card flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Muse Analysis</h1>
          <div className="muted text-xs">story: {storySlug}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`shell-link px-2 py-1 text-xs ${mode === "edit" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={`shell-link px-2 py-1 text-xs ${mode === "preview" ? "border-[#3f6b90]" : ""}`}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </div>
      </section>

      {error ? <div className="text-sm text-[#ff8f8f]">{error}</div> : null}
      {flash ? <div className="text-sm text-emerald-300">{flash}</div> : null}

      <section className="grid gap-3 xl:grid-cols-[1.25fr_1fr]">
        <MuseAnalysisComposerPanel
          mode={mode}
          sceneFilter={sceneFilter}
          setSceneFilter={setSceneFilter}
          loadingScenes={loadingScenes}
          scenes={scenes}
          draft={draft}
          setDraft={setDraft}
          debouncedDraft={debouncedDraft}
          canSave={canSave}
          saving={saving}
          saveReport={saveReport}
        />
        <MuseAnalysisReportsPanel
          items={items}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selectedItem={selectedItem}
          loadingList={loadingList}
          deletingId={deletingId}
          loadList={loadList}
          deleteReport={deleteReport}
        />
      </section>
    </main>
  );
}
