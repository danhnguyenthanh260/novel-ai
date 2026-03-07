import type { CurrentVersion, DockTab, SceneItem } from "@/features/scenes/components/writeTab/types";

type WriteDockPanelProps = {
  scene: SceneItem | null;
  current: CurrentVersion | null;
  dockTab: DockTab;
  onDockTabChange: (value: DockTab) => void;
  ghostSuggestionReady: boolean;
};

type DockTabsProps = {
  dockTab: DockTab;
  onDockTabChange: (value: DockTab) => void;
  ghostSuggestionReady: boolean;
};

function DockTabs({ dockTab, onDockTabChange, ghostSuggestionReady }: DockTabsProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={`shell-link px-2 py-1 text-xs ${dockTab === "actions" ? "border-[#3f6b90]" : ""}`}
        onClick={() => onDockTabChange("actions")}
      >
        Actions
      </button>
      <button
        type="button"
        className={`shell-link px-2 py-1 text-xs ${dockTab === "context" ? "border-[#3f6b90]" : ""}`}
        onClick={() => onDockTabChange("context")}
      >
        Context
      </button>
      <button
        type="button"
        className={`shell-link px-2 py-1 text-xs ${dockTab === "assist" ? "border-[#3f6b90]" : ""}`}
        onClick={() => onDockTabChange("assist")}
      >
        Assist
        {ghostSuggestionReady ? (
          <span className="ml-2 rounded border border-[#2f5b58] bg-[#133a37] px-1.5 py-0.5 text-[10px] text-[#9de5dc]">
            1 ready
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className={`shell-link px-2 py-1 text-xs ${dockTab === "report" ? "border-[#3f6b90]" : ""}`}
        onClick={() => onDockTabChange("report")}
      >
        Report
      </button>
    </div>
  );
}

type ContextPanelProps = {
  scene: SceneItem | null;
  current: CurrentVersion | null;
  dockTab: DockTab;
};

function ContextPanel({ scene, current, dockTab }: ContextPanelProps) {
  if (dockTab !== "context") return <div className="hidden" />;

  return (
    <div className="space-y-2">
      {scene ? (
        <>
          <div className="shell-control grid gap-2 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="muted">Chapter</span>
              <span>{scene.chapter_id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="muted">Scene</span>
              <span>#{scene.idx}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="muted">Status</span>
              <span className="status-pill status-pill--other">{scene.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="muted">Version</span>
              <span>v{current?.version_no ?? "-"}</span>
            </div>
          </div>
          <div className="muted text-xs">Pipeline context for decision making.</div>
        </>
      ) : (
        <div className="muted text-xs">Select a scene to show write context.</div>
      )}
    </div>
  );
}

export default function WriteDockPanel({ scene, current, dockTab, onDockTabChange, ghostSuggestionReady }: WriteDockPanelProps) {
  return (
    <div className="surface-card space-y-3 p-3 text-sm">
      <div>
        <div className="text-base font-semibold">Write Dock</div>
        <div className="muted text-xs">Actions, context, and assist in one place.</div>
      </div>

      <DockTabs dockTab={dockTab} onDockTabChange={onDockTabChange} ghostSuggestionReady={ghostSuggestionReady} />

      <div id="write-dock-actions" className={dockTab === "actions" ? "space-y-2" : "hidden"} />
      <ContextPanel scene={scene} current={current} dockTab={dockTab} />

      <div id="write-dock-assist" className={dockTab === "assist" ? "space-y-2" : "hidden"} />
      <div id="write-dock-report" className={dockTab === "report" ? "space-y-2" : "hidden"} />
    </div>
  );
}
