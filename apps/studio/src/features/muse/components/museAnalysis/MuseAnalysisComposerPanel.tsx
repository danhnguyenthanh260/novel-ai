import MarkdownPreview from "@/features/muse/components/museAnalysis/MarkdownPreview";
import type { MuseAnalysisMode, SceneItem } from "@/features/muse/components/museAnalysis/types";

type MuseAnalysisComposerPanelProps = {
  mode: MuseAnalysisMode;
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
};

export default function MuseAnalysisComposerPanel({
  mode,
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
}: MuseAnalysisComposerPanelProps) {
  return (
    <div className="surface-card space-y-3 p-3">
      <div className="grid gap-2">
        <label className="grid gap-1 text-sm">
          <span className="muted text-xs">Scene (optional)</span>
          <select
            className="shell-control px-2 py-2 text-sm"
            value={sceneFilter}
            onChange={(e) => setSceneFilter(e.target.value)}
            disabled={loadingScenes}
          >
            <option value="">Story-level</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={String(scene.id)}>
                {scene.chapter_id} / #{scene.idx} {scene.title ? `- ${scene.title}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === "edit" ? (
        <textarea
          className="shell-control min-h-[340px] w-full p-3 text-sm leading-6"
          placeholder={`Issue:
Evidence:
Why problematic:
Recommendation:
Scope: scene-level | story-level`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <div className="shell-control min-h-[340px] p-3 text-sm leading-6">
          <MarkdownPreview markdown={debouncedDraft} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" className="shell-link px-3 py-2 text-sm disabled:opacity-40" disabled={!canSave} onClick={saveReport}>
          {saving ? "Saving..." : "Save Report"}
        </button>
        <button type="button" className="shell-link px-3 py-2 text-sm" onClick={() => setDraft("")}>
          Clear
        </button>
      </div>
    </div>
  );
}
