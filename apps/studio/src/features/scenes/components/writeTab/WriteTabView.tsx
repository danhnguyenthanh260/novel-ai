import type { ChapterSceneItem, ChatScope, CurrentVersion, DockTab, SceneItem } from "@/features/scenes/components/writeTab/types";
import NovelLabWorkspace from "@/features/scenes/components/writeTab/NovelLabWorkspace";

type WriteTabViewProps = {
  storySlug: string;
  chatScope: ChatScope;
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
  chapterScenes: ChapterSceneItem[];
  loadingChapter: boolean;
  onCreateNewChapter: () => Promise<void>;
  onUnlockScene: () => Promise<void>;
  showAutoWrite: boolean;
  setShowAutoWrite: (v: boolean) => void;
  pendingChapterProse: { id: string; prose: string } | null;
  stagingData: { user_prose: string; llm_prose: string; status: string } | null;
  v3Draft: { full_text: string; status: string; virtual_scenes: unknown[] } | null;
  onAutoWriteComplete: (prose: string) => Promise<void>;
  onSaveChapterDraft: (prose: string) => Promise<void>;
  onResplitChapter: (prose: string) => Promise<void>;
};

export default function WriteTabView(props: WriteTabViewProps) {
  return (
    <NovelLabWorkspace
      storySlug={props.storySlug}
      chatScope={props.chatScope}
      chapterIds={props.chapterIds}
      scene={props.scene}
      current={props.current}
      loadingScenes={props.loadingScenes}
      loadingDetail={props.loadingDetail}
      error={props.error}
      selectedChapterId={props.selectedChapterId}
      onChapterIdChange={props.onChapterIdChange}
      chapterScenes={props.chapterScenes}
      loadingChapter={props.loadingChapter}
      onCreateNewChapter={props.onCreateNewChapter}
      showAutoWrite={props.showAutoWrite}
      setShowAutoWrite={props.setShowAutoWrite}
      pendingChapterProse={props.pendingChapterProse}
      stagingData={props.stagingData}
      v3Draft={props.v3Draft}
      onAutoWriteComplete={props.onAutoWriteComplete}
      onSaveChapterDraft={props.onSaveChapterDraft}
    />
  );
}
