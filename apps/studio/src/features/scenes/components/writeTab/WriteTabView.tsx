import type { CurrentVersion, DockTab, SceneItem } from "@/features/scenes/components/writeTab/types";
import TriPanelLayout from "@/components/layout/TriPanelLayout";
import WriteDockPanel from "@/features/scenes/components/writeTab/WriteDockPanel";
import WriteTabCenterPanel from "@/features/scenes/components/writeTab/WriteTabCenterPanel";

type WriteTabViewProps = {
  storySlug: string;
  scenes: SceneItem[];
  chapterIds: string[];
  sceneId: string;
  onSceneIdChange: (value: string) => void;
  scene: SceneItem | null;
  current: CurrentVersion | null;
  loadingScenes: boolean;
  loadingDetail: boolean;
  error: string | null;
  dockTab: DockTab;
  onDockTabChange: (value: DockTab) => void;
  ghostSuggestionReady: boolean;
  seedPrompt: string;
  onCommitted: () => Promise<void>;
  onGhostSuggestionReadyChange: (value: boolean) => void;
  // New Chapter-level props
  selectedChapterId: string;
  onChapterIdChange: (id: string) => void;
  viewMode: "scene" | "chapter";
  chapterScenes: any[];
  loadingChapter: boolean;
  onCreateNewChapter: () => Promise<void>;
  onUnlockScene: () => Promise<void>;
  showAutoWrite: boolean;
  setShowAutoWrite: (v: boolean) => void;
  pendingChapterProse: { id: string; prose: string } | null;
  stagingData: { user_prose: string; llm_prose: string; status: string } | null;
  onAutoWriteComplete: (prose: string) => Promise<void>;
  onSaveChapterDraft: (prose: string) => Promise<void>;
  onResplitChapter: (prose: string) => Promise<void>;
};

export default function WriteTabView({
  storySlug,
  scenes,
  chapterIds,
  sceneId,
  onSceneIdChange,
  scene,
  current,
  loadingScenes,
  loadingDetail,
  error,
  dockTab,
  onDockTabChange,
  ghostSuggestionReady,
  seedPrompt,
  onCommitted,
  onGhostSuggestionReadyChange,
  selectedChapterId,
  onChapterIdChange,
  viewMode,
  chapterScenes,
  loadingChapter,
  onCreateNewChapter,
  onUnlockScene,
  showAutoWrite,
  setShowAutoWrite,
  pendingChapterProse,
  stagingData,
  onAutoWriteComplete,
  onSaveChapterDraft,
  onResplitChapter,
}: WriteTabViewProps) {
  return (
    <main className="p-1">
      <TriPanelLayout
        center={
          <WriteTabCenterPanel
            storySlug={storySlug}
            scenes={scenes}
            chapterIds={chapterIds}
            sceneId={sceneId}
            onSceneIdChange={onSceneIdChange}
            scene={scene}
            current={current}
            loadingScenes={loadingScenes}
            loadingDetail={loadingDetail}
            error={error}
            seedPrompt={seedPrompt}
            onCommitted={onCommitted}
            onGhostSuggestionReadyChange={onGhostSuggestionReadyChange}
            selectedChapterId={selectedChapterId}
            onChapterIdChange={onChapterIdChange}
            viewMode={viewMode}
            chapterScenes={chapterScenes}
            loadingChapter={loadingChapter}
            onCreateNewChapter={onCreateNewChapter}
            onUnlockScene={onUnlockScene}
            showAutoWrite={showAutoWrite}
            setShowAutoWrite={setShowAutoWrite}
            pendingChapterProse={pendingChapterProse}
            stagingData={stagingData}
            onAutoWriteComplete={onAutoWriteComplete}
            onSaveChapterDraft={onSaveChapterDraft}
            onResplitChapter={onResplitChapter}
          />
        }
        right={
          <WriteDockPanel
            scene={scene}
            current={current}
            dockTab={dockTab}
            onDockTabChange={onDockTabChange}
            ghostSuggestionReady={ghostSuggestionReady}
          />
        }
        leftMode="hidden"
        rightMode="pinned"
        leftTitle="Navigator"
        centerTitle="Write"
        rightTitle="Context"
        rightTabletWidthClass="w-96 min-w-96"
        rightDesktopWidthClass="w-96 min-w-96"
      />
    </main>
  );
}
